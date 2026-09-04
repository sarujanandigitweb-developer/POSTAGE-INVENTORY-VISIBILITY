import { withClient, query } from '@/lib/db';
import { getOrBuild, shippedAt } from '@/lib/dataset';
import { classification, CATEGORY_ORDER, skusIn, sectionCounts, imgURL } from '@/lib/classification';
import { parseLine, region as histRegion } from '@/lib/history-parser';
import fs from 'node:fs';
import path from 'node:path';

// PRICE COMMENT IS NOT IN POSTGRES. It is produced by a separate pass of the
// 2-hourly pipeline (sql/build-shopify-comments.js), which reads a Trello export —
// there is no query that returns it. The pipeline's own output is reused rather
// than the value being invented or the column quietly dropped. It is the one field
// on this tab that is file-sourced, and only as fresh as the last pipeline run:
// re-copy sql/refresh/out/shopify-comments.json to data/price-comments.json.
//
// The PRICE follows the same route, and for the same reason. It is not `min(price)`
// over the UK channels — that is what this route used to do, and it left LSFC160BT
// blank where the dashboard shows £12.22. The real rule is a five-tier match:
//   1 exact SKU · 2 a combo with exactly ONE '+' · 3 a pack · 4 a larger combo · 5 none
// with LEDSone winning at EVERY tier before price is considered, and combos
// decomposed to find which listing actually contains this SKU. Roughly 200 lines.
//
// A £ figure may only come from a UK channel. A euro or dollar listing is a
// DIFFERENT number, not a cheaper one, so it goes to its own column carrying its
// currency — which is why LSFC300BG reads "€12.89 EUR" and not "£12.89".
//
// Re-deriving that here would be a second implementation of a validated rule, free
// to drift. These three files are the pipeline's own output; re-copy them from
// sql/refresh/out/ when it next runs.
const FILES = { comments: 'price-comments.json', price: 'price.json', alt: 'price-alt.json' };
const LOADED = {};
function pipelineFile(which) {
  if (LOADED[which]) return LOADED[which];
  try {
    LOADED[which] = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'data', FILES[which]), 'utf8'));
  } catch { LOADED[which] = {}; }
  return LOADED[which];
}

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

// Containers a SKU has actually arrived on, newest last. "Latest" is ORDER BY
// order_date — never a text maximum of the name ('Container 9' > 'Container 16'
// under a text maximum, wrong on 39% of pairs).
const ARRIVED = `
  SELECT DISTINCT upper(oi.sku) AS sku,
         CASE WHEN COALESCE(fc.main_container, cc.main_container) IN ('DE','GERMAN') THEN 'DE'
              ELSE COALESCE(fc.main_container, cc.main_container) END AS region,
         COALESCE(fc.name, cc.name) AS cname,
         o.order_date::text AS od
    FROM suppliers.order_items oi
    JOIN suppliers.orders o ON o.id = oi.order_id
    LEFT JOIN suppliers.final_containers fc ON fc.id = oi.final_container_id
    LEFT JOIN suppliers.containers      cc ON cc.id = oi.assigned_container_id
   WHERE o.status_arrived
     AND upper(oi.sku) = ANY($1)
     AND COALESCE(fc.name, cc.name) IS NOT NULL
     AND upper(trim(COALESCE(fc.name, cc.name))) NOT IN ('UNASSIGN','UNASSIGNED','N/A','-')
     AND o.order_date IS NOT NULL`;

// Stock on a container that has NOT arrived yet — kept visually distinct from
// stock on the shelf so a picker cannot mistake one for the other.
const INCOMING = `
  SELECT DISTINCT upper(oi.sku) AS sku,
         COALESCE(fc.name, cc.name) AS cname,
         CASE WHEN o.status_shipped             THEN 'Shipped'
              WHEN o.status_finished_production THEN 'Production done'
              WHEN o.status_confirmed           THEN 'Confirmed'
              ELSE 'Ordered' END AS stage
    FROM suppliers.order_items oi
    JOIN suppliers.orders o ON o.id = oi.order_id
    LEFT JOIN suppliers.final_containers fc ON fc.id = oi.final_container_id
    LEFT JOIN suppliers.containers      cc ON cc.id = oi.assigned_container_id
   WHERE NOT o.status_arrived
     AND upper(oi.sku) = ANY($1)
     AND COALESCE(fc.name, cc.name) IS NOT NULL
     AND upper(trim(COALESCE(fc.name, cc.name))) NOT IN ('UNASSIGN','UNASSIGNED','N/A','-')`;

// Stock-movement history. There is no movement table — the lines live as free text
// on inventory.product_history, which is why the shipped parser is reused.
const HISTORY = `
  SELECT upper(p.sku) AS sku, trim(l.line) AS line
    FROM inventory.products p
    JOIN inventory.product_history h ON h.inventory_id = p.id,
    LATERAL unnest(string_to_array(h.history, E'\\n')) WITH ORDINALITY AS l(line, ord)
   WHERE upper(p.sku) = ANY($1)
     AND trim(l.line) <> ''
     AND (l.line ILIKE '%UK stock changes%'
       OR trim(l.line) ILIKE 'Supply%'
       OR trim(l.line) ILIKE 'German Supply%'
       OR l.line ~* 'german ?Inventory +Changed +from')`;

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
function unplacedSkus(fromSnapshot) {
  // A DEPLOYMENT SERVING SNAPSHOTS MUST NOT OPEN A CONNECTION — not even in the
  // background. This check is a diagnostic (which SKUs are missing from the curated
  // classification), and it was firing one query per request against a role that allows
  // ten. It is answered by whoever builds the snapshots, not by the hosted app.
  if (fromSnapshot) return { pending: false, list: [], skipped: 'served from a snapshot' };
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
    // One snapshot PER CATEGORY, keyed the same way the request is. A single
    // whole-catalogue snapshot would be one 6,181-row object to load for a section of
    // 124, which is the cost this route was written to avoid in the first place.
    const data = await getOrBuild('inventory-' + key, () => buildSnapshot(key));

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
      unplaced: unplacedSkus(shippedAt('inventory-' + key) !== null),          // null until the background check lands
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

// The snapshot builder, exported for scripts/build-snapshots.mjs. Takes the category
// because this route snapshots one section at a time: a single whole-catalogue file
// would be 6,181 rows to load for a section of 124, which is the cost the route was
// written to avoid. The route calls this same function.
export function buildSnapshot(cat) {
  const wanted = skusIn(cat);
  if (!wanted.length) throw new Error('Unknown category: ' + cat);
  const key = cat;
  return withClient(async q => {
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

      // ---- last container, per region -------------------------------------
      // ordered by order_date so the LAST entry is the newest arrival
      const arrived = {};
      for (const r of await q(ARRIVED, [wanted])) {
        if (r.region !== 'UK' && r.region !== 'DE') continue;
        ((arrived[r.sku] ||= {})[r.region] ||= []).push({ od: r.od, name: r.cname });
      }
      for (const sku of Object.keys(arrived))
        for (const rg of Object.keys(arrived[sku]))
          arrived[sku][rg].sort((a, b) => a.od.localeCompare(b.od) || a.name.localeCompare(b.name));

      const incoming = {};
      for (const r of await q(INCOMING, [wanted])) incoming[r.sku] = { name: r.cname, stage: r.stage };

      // ---- history: movement counts, and the latest genuine goods receipt ---
      const hist = {};
      for (let i = 0; i < wanted.length; i += 800) {
        for (const r of await q(HISTORY, [wanted.slice(i, i + 800)]))
          (hist[r.sku] ||= []).push(r.line);
      }
      // The dialog shows the 12 most recent movements per region and says so when
      // there are more — the same cap the published pipeline uses, so the two agree.
      const CAP = 12;
      const moves = {}, received = {};
      for (const sku of Object.keys(hist)) {
        const mv = [];
        for (const line of hist[sku]) for (const m of parseLine(line)) mv.push(m);
        // newest first, by date then time
        mv.sort((a, b) => (b.dt + ' ' + (b.tm || '')).localeCompare(a.dt + ' ' + (a.tm || '')));
        for (const m of mv) {
          const rg = histRegion(m.tl);
          const bucket = ((moves[sku] ||= {})[rg] ||= { n: 0, rows: [] });
          bucket.n++;
          if (bucket.rows.length < CAP) bucket.rows.push({
            dt: m.dt, fl: m.fl || '', tl: m.tl || '', sb: m.sb, sa: m.sa, qt: m.qt,
            ac: m.ac || '', ip: m.ip || '', cp: m.cp || '', rm: m.rm || '',
          });
          // Received Warehouse and Received Date are NOT columns anywhere — they
          // are read out of the history text. Only a "Goods received" movement
          // counts; anything else is a correction or a pick.
          if (m.ac !== 'Goods received') continue;
          const cur = ((received[sku] ||= {})[rg]);
          const stamp = m.dt + ' ' + (m.tm || '');
          // the warehouse is the movement's TITLE (m.tl), not an m.wh field — the
          // parser names the warehouse there, e.g. "Unit 3". Reading m.wh gave a
          // blank column where the dashboard shows the unit.
          if (!cur || stamp > cur.stamp) received[sku][rg] = { stamp, wh: m.tl || '', dt: m.dt };
        }
      }

      // Join the CURATED classification on. A SKU the arrays do not know is
      // reported as unplaced, never silently dropped and never guessed at — the
      // same contract build.js keeps.
      const { cls } = classification();
      const comments = pipelineFile('comments');
      const gbp = pipelineFile('price');
      const alt = pipelineFile('alt');
      const rows = [];
      for (const p of products) {
        const c = cls[p.sku];
        if (!c) continue;              // not in this section's curated list
        const s = stock[p.pid] || {};
        // £ only from a UK channel; anything else keeps its own currency
        const g = gbp[p.sku];
        const a = alt[p.sku];
        const row = { s: p.sku, d: p.d, i: imgURL(p.img),
                      price: typeof g === 'number' ? g : null,
                      alt: a ? { v: a[0], sym: a[1], cur: a[2], ch: a[3] } : null,
                      key: c.key, f: c.f ?? null, t: c.t ?? null };
        // the attribute columns each section filters on
        for (const k of ['x', 'mt', 'sh', 'ft', 'sr', 'gp', 'ws']) if (c[k] !== undefined) row[k] = c[k];
        for (const [col, id] of Object.entries(COL)) row[col] = s[id] ? s[id].q : 0;
        for (const [col, id] of Object.entries(LOC)) if (s[id]?.loc) row[col] = s[id].loc;

        // last container per region: the newest arrival, and how many it has had
        for (const rg of ['UK', 'DE']) {
          const list = (arrived[p.sku] || {})[rg];
          if (list && list.length) {
            const latest = list[list.length - 1];
            row[rg === 'UK' ? 'ukc' : 'dec'] = { name: latest.name, od: latest.od, n: list.length };
          }
          const rec = (received[p.sku] || {})[rg];
          if (rec) row[rg === 'UK' ? 'ukr' : 'der'] = { wh: rec.wh, dt: rec.dt };
          const h = (moves[p.sku] || {})[rg];
          if (h) row[rg === 'UK' ? 'ukh' : 'deh'] = h;   // { n, rows }
        }
        const inc = incoming[p.sku];
        if (inc) row.inc = inc;
        const pc = comments[p.sku];
        if (pc) row.pc = pc;

        rows.push(row);
      }

      return { rows, warehouses, missingWarehouses };
  });
}

// re-exported so the snapshot script can enumerate the sections without a second
// copy of the category list
export { CATEGORY_ORDER };
