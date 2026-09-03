import { withClient, query } from '@/lib/db';
import { classification, CATEGORY_ORDER, skusIn, sectionCounts, imgURL } from '@/lib/classification';

// The browser calls this route; only this route touches PostgreSQL.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// --- SQL ported from ../sql/refresh/extract/{products,stock,price}.js ---------
//
// The products filter is load-bearing, not tidiness. inventory.products holds
// ~16.4k single SKUs of which ~10.2k are ENC* eBay combo placeholders, all
// described "Combo Default Title." and all inventory_bool = false. 479 of them
// even carry stock mirrored from their components, so filtering on stock would
// not catch them.
const PRODUCTS = `
  SELECT DISTINCT ON (upper(pr.sku))
         upper(pr.sku) AS sku,
         pr.id         AS pid,
         NULLIF(regexp_replace(trim(COALESCE(pr.description,'')), '\\s+', ' ', 'g'), '') AS d,
         (SELECT regexp_replace(i.image_url, '^.*/product_images/', '')::text
            FROM inventory.product_images i
           WHERE i.product_id = pr.id
           ORDER BY i.image_ordering NULLS LAST, i.id
           LIMIT 1) AS img
    FROM inventory.products pr
   WHERE pr.inventory_bool
     AND upper(pr.sku) = ANY($1)
     AND pr.sku NOT LIKE '%+%'
     AND pr.sku !~ '[0-9A-Z]PK$'
     AND upper(pr.sku) NOT LIKE '%DUMMY%'
   ORDER BY upper(pr.sku)`;

const STOCK = `
  SELECT inventory, warehouse, quantity,
         NULLIF(NULLIF(trim(product_shelf_location), ''), '-') AS loc
    FROM inventory.physical_product_stock
   WHERE inventory = ANY($1)`;

// SKU column only, over the whole catalogue. Scoping the main query to one
// category means it can no longer notice a SKU that Postgres has and the curated
// arrays do not — and build.js's contract is that those are reported, never
// silently dropped. This is cheap and cached, so the contract survives.
const ALL_SKUS = `
  SELECT DISTINCT upper(pr.sku) AS sku
    FROM inventory.products pr
   WHERE pr.inventory_bool
     AND pr.sku NOT LIKE '%+%'
     AND pr.sku !~ '[0-9A-Z]PK$'
     AND upper(pr.sku) NOT LIKE '%DUMMY%'`;

const WAREHOUSES = `
  SELECT warehouse, warehouse_name, warehouse_location
    FROM inventory.warehouse ORDER BY warehouse`;

// Shopify price: LEDSone first, then the other UK stores. Only a UK channel may
// fill the £ column — a euro or dollar figure is a different number, not a
// cheaper one.
const PRICE = `
  WITH ch(name, ord) AS (VALUES
    ('LEDSone',1),('Electricalsone',2),('Vintagelite',3),('BesBet',4),
    ('Dcvoltage',5),('dcvoltage',5))
  SELECT upper(COALESCE(NULLIF(l.mapped_sku,''), l.sku)) AS lsku,
         min(l.price) AS p
    FROM listings.shopify_listings l
    JOIN ch ON ch.name = l.channel
   WHERE COALESCE(l.wrong_sku,0) = 0 AND l.all_list = 1 AND l.price > 0
     AND upper(COALESCE(NULLIF(l.mapped_sku,''), l.sku)) = ANY($1)
   GROUP BY 1`;

// dashboard column -> warehouse id, and which of those also carry a shelf location
const COL = { a: 1, b: 8, c: 6, u5: 33, k: 10, m: 7, ca: 4, us: 32 };
const LOC = { al: 1, bl: 8, kl: 10, ml: 7 };
const WH_OVERRIDE = { 33: 'UK Unit 5' };   // no row in inventory.warehouse yet

// Cached for the process, and NEVER awaited on the request path. Awaiting it put
// the whole-catalogue scan in front of the first paint — 7.3s instead of 2.1s,
// which is exactly the delay this endpoint was scoped to avoid. It runs in the
// background instead: the first response says the check is pending, every one
// after it carries the list.
let unplacedCache = null;
let unplacedRunning = false;
function unplacedSkus() {
  const fresh = unplacedCache && Date.now() - unplacedCache.at < 10 * 60 * 1000;
  if (!fresh && !unplacedRunning) {
    unplacedRunning = true;
    query(ALL_SKUS)
      .then(rows => {
        const { cls } = classification();
        unplacedCache = { at: Date.now(), list: rows.map(r => r.sku).filter(s => !cls[s]).sort() };
      })
      .catch(e => console.error('[api/inventory] unplaced check failed:', e.message))
      .finally(() => { unplacedRunning = false; });
  }
  return unplacedCache ? unplacedCache.list : null;
}

export async function GET(request) {
  // One category per request. The whole catalogue is 6,181 SKUs and reading it
  // took ~6s before anything appeared; a section is 124–1,487, so the first paint
  // is a fraction of that. Which SKUs are in a section is known locally from the
  // curated classification, so no query is needed to work it out.
  const key = new URL(request.url).searchParams.get('cat') || CATEGORY_ORDER[0];
  const wanted = skusIn(key);
  if (!wanted.length) {
    return Response.json({ ok: false, error: 'Unknown category: ' + key }, { status: 400 });
  }
  try {
    const data = await withClient(async q => {
      const products = await q(PRODUCTS, [wanted]);
      const pids = products.map(p => p.pid);

      // chunked: ANY($1) with 16k ids in one go is a needlessly large parameter
      const stock = {};
      for (let i = 0; i < pids.length; i += 4000) {
        for (const r of await q(STOCK, [pids.slice(i, i + 4000)])) {
          (stock[r.inventory] ||= {})[r.warehouse] = { q: Number(r.quantity), loc: r.loc };
        }
      }

      const warehouses = {};
      for (const r of await q(WAREHOUSES)) {
        warehouses[r.warehouse] = { name: r.warehouse_name, loc: r.warehouse_location };
      }
      const missingWarehouses = Object.values(COL).filter(id => !warehouses[id] && !WH_OVERRIDE[id]);

      const price = {};
      for (const r of await q(PRICE, [wanted])) price[r.lsku] = Number(r.p);

      // Join the CURATED classification on. A SKU the arrays do not know is
      // reported as unplaced, never silently dropped and never guessed at — the
      // same contract build.js keeps.
      const { cls } = classification();
      const rows = [];
      for (const p of products) {
        const c = cls[p.sku];
        if (!c) continue;              // not in this section's curated list
        const s = stock[p.pid] || {};
        const row = { s: p.sku, d: p.d, i: imgURL(p.img), price: price[p.sku] ?? null,
                      key: c.key, f: c.f ?? null, t: c.t ?? null };
        // the attribute columns each section filters on
        for (const k of ['x', 'mt', 'sh', 'ft', 'sr', 'gp', 'ws']) if (c[k] !== undefined) row[k] = c[k];
        for (const [col, id] of Object.entries(COL)) row[col] = s[id] ? s[id].q : 0;
        for (const [col, id] of Object.entries(LOC)) if (s[id]?.loc) row[col] = s[id].loc;
        rows.push(row);
      }

      return { rows, warehouses, missingWarehouses };
    });

    const { sections } = classification();
    // Populations for the whole strip come from the local classification, so every
    // category shows its real count even though only one was queried. The header's
    // stock alerts are NOT global — the page computes them from the ACTIVE
    // category, which is why it reads 62 / 7 on Ceiling Rose. The client does that.
    return Response.json({
      ok: true,
      cat: key,
      asOf: new Date().toISOString(),
      count: data.rows.length,
      unplaced: unplacedSkus(),          // null until the background check lands
      order: CATEGORY_ORDER,
      sections, counts: sectionCounts(),
      warehouses: data.warehouses,
      missingWarehouses: data.missingWarehouses,
      rows: data.rows,
    });
  } catch (e) {
    // the message is already scrubbed by lib/db, but never echo a query either
    console.error('[api/inventory]', e.message);
    return Response.json({ ok: false, error: 'Inventory query failed. See server log.' }, { status: 500 });
  }
}
