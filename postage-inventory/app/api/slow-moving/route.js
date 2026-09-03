import { withClient } from '@/lib/db';
import { getOrBuild, builtAt, page as slice } from '@/lib/dataset';

// SLOW-MOVING PRODUCTS & COMPONENTS.
// Ported from ../sql/refresh/extract/slow-moving.js. Three things there are
// load-bearing and were each a real defect when missing:
//
//   1. Cancelled and Deleted orders are NOT sales. Counting them marked 1,259
//      actively-moving SKUs as slow.
//   2. A component sold INSIDE a combo has moved. order_combo must be read, or
//      858 SKUs read as "never sold at all" when they sell every week.
//   3. Nearly half of all order-line SKUs are ad-hoc combos spelled out in the
//      line itself, "A+B+C". Each named part physically left the shelf, so each
//      real catalogue SKU among them is credited with that order's date.
//
// Date normalisation matters too: differencing raw timestamps loses a day
// whenever a sale happened in the afternoon, which silently pushed rows sitting
// on the 91-day boundary out of the band.
export const dynamic = 'force-dynamic';

// 91-180 Medium, 181-365 High, over 365 Critical. No existing rule was found in
// the database — these are the requirement's own bands, stated not invented.
const PRIORITY = d => (d > 365 ? 3 : d > 180 ? 2 : d > 90 ? 1 : 0);
const SLOW_DAYS = 90;
const BAND = ['', 'Medium', 'High', 'Critical'];
const IMG_BASE = 'https://sin1.contabostorage.com/4ad62276cb6d4a83bfb1b8a91b839703:newom/newom/newom/img/product_images/';
const LIVE = `o.status NOT IN ('Cancelled','Deleted')`;

const SQL = {
  products: `
    SELECT DISTINCT ON (upper(sku)) upper(sku) AS sku, id, title, inventory_bool AS single,
           created_at
    FROM inventory.products WHERE sku IS NOT NULL AND sku <> '' ORDER BY upper(sku), id`,
  warehouses: `SELECT warehouse, warehouse_name FROM inventory.warehouse`,
  stock: `SELECT inventory, warehouse, quantity, product_shelf_location AS loc
          FROM inventory.physical_product_stock WHERE quantity <> 0`,
  images: `SELECT DISTINCT ON (product_id) product_id AS pid, image_path AS p, image_url AS u
           FROM inventory.product_images ORDER BY product_id, image_ordering, id`,
  // 1. direct sale
  direct: `
    SELECT upper(COALESCE(NULLIF(oi.real_sku,''), oi.item_sku)) AS sku, max(o.order_date) AS d
    FROM order_management.order_item_info oi
    JOIN order_management.orders o ON o.id = oi.order_id
    WHERE COALESCE(NULLIF(oi.real_sku,''), oi.item_sku) IS NOT NULL AND ${LIVE}
    GROUP BY 1`,
  // 2. usage inside a combo
  combo: `
    SELECT upper(oc.sku) AS sku, max(o.order_date) AS d
    FROM order_management.order_combo oc
    JOIN order_management.order_item_info oi ON oi.id = oc.order_item_info_id
    JOIN order_management.orders o ON o.id = oi.order_id
    WHERE oc.sku IS NOT NULL AND oc.sku <> '' AND ${LIVE}
    GROUP BY 1`,
  // 3. a component named in an ad-hoc "A+B+C" line
  adhoc: `
    SELECT upper(COALESCE(NULLIF(oi.real_sku,''), oi.item_sku)) AS sku, max(o.order_date) AS d
    FROM order_management.order_item_info oi
    JOIN order_management.orders o ON o.id = oi.order_id
    WHERE COALESCE(NULLIF(oi.real_sku,''), oi.item_sku) LIKE '%+%' AND ${LIVE}
    GROUP BY 1`,
  // names, where inventory.products has none. Each source only fills a gap.
  shopName: `SELECT upper(COALESCE(NULLIF(mapped_sku,''),sku)) AS s, min(title) AS t
             FROM listings.shopify_listings WHERE title IS NOT NULL AND title <> '' GROUP BY 1`,
  amzName: `SELECT upper(COALESCE(NULLIF(mapped_sku,''),sku)) AS s, min(title) AS t
            FROM listings.amazon_listings WHERE title IS NOT NULL AND title <> '' GROUP BY 1`,
  ebayName: `SELECT upper(sku) AS s, min(title) AS t
             FROM listings.ebay_listings WHERE title IS NOT NULL AND title <> '' GROUP BY 1`,
  // PH = the person who owns a category. ph_category_products.ref_id is a
  // MARKETPLACE reference (ASIN / eBay item id / EAN), never a SKU, so it has to
  // be resolved through the listing tables.
  ph: `
    WITH refs AS (
      SELECT p.ref_id, p.source_id, ph.category_name,
             COALESCE(NULLIF(trim(u.first_name || ' ' || COALESCE(u.last_name,'')), ''), u.username) AS person
      FROM staff.ph_category_products p
      JOIN staff.ph_categories ph ON ph.id = p.ph_category_id
      LEFT JOIN staff.users u ON u.id = ph.user_id)
    SELECT sku, category_name, person FROM (
      SELECT upper(COALESCE(NULLIF(a.mapped_sku,''),a.sku)) AS sku, r.category_name, r.person
        FROM refs r JOIN listings.amazon_listings a ON upper(a.asin) = upper(r.ref_id)
      UNION
      SELECT upper(e.sku), r.category_name, r.person
        FROM refs r JOIN listings.ebay_listings e ON e.item_id::text = r.ref_id
      UNION
      SELECT upper(COALESCE(NULLIF(b.mapped_sku,''),b.sku)), r.category_name, r.person
        FROM refs r JOIN listings.bandq_listings b ON b.ean = r.ref_id) x
    WHERE sku IS NOT NULL AND sku <> ''`,
};

async function build() {
  return withClient(async q => {
    const prods = await q(SQL.products);
    const bySku = new Map(prods.map(r => [r.sku, r]));
    const byPid = new Map(prods.map(r => [r.id, r.sku]));

    const wh = new Map();
    for (const r of await q(SQL.warehouses)) wh.set(r.warehouse, r.warehouse_name);

    const stock = new Map();                     // sku -> { units, locs[] }
    for (const r of await q(SQL.stock)) {
      const sku = byPid.get(r.inventory);
      if (!sku) continue;
      const e = stock.get(sku) || { units: 0, locs: [] };
      e.units += Number(r.quantity) || 0;
      const name = wh.get(r.warehouse);
      if (name) e.locs.push(name + (r.loc && r.loc !== '-' ? ' · ' + String(r.loc).trim() : ''));
      stock.set(sku, e);
    }

    const sold = new Map();
    const note = (sku, when) => {
      if (!sku || !when) return;
      const t = new Date(when).getTime();
      if (!sold.has(sku) || t > sold.get(sku)) sold.set(sku, t);
    };
    for (const r of await q(SQL.direct)) note(r.sku, r.d);
    for (const r of await q(SQL.combo)) note(r.sku, r.d);
    for (const r of await q(SQL.adhoc)) {
      if (!r.sku) continue;
      for (const part of r.sku.split('+')) {
        const k = part.trim();
        if (k && bySku.has(k)) note(k, r.d);     // only real catalogue SKUs
      }
    }

    const name = new Map();
    for (const r of prods) {
      const t = (r.title || '').replace(/\s+/g, ' ').trim();
      if (t && t !== 'Combo Default Title.') name.set(r.sku, t);
    }
    for (const key of ['shopName', 'amzName', 'ebayName']) {
      for (const r of await q(SQL[key])) {
        if (!name.has(r.s)) {
          const t = (r.t || '').replace(/\s+/g, ' ').trim();
          if (t) name.set(r.s, t);
        }
      }
    }

    const img = new Map();
    for (const r of await q(SQL.images)) {
      const sku = byPid.get(r.pid);
      if (sku) img.set(sku, r.u || r.p);
    }

    const ph = new Map();
    for (const r of await q(SQL.ph)) if (!ph.has(r.sku)) ph.set(r.sku, { c: r.category_name, p: r.person });

    // UTC-midnight normalisation on both sides, so an afternoon sale does not
    // lose a day and push a row off a band boundary.
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

    const rows = [];
    for (const sku of [...bySku.keys()].sort()) {
      const o = bySku.get(sku);
      const st = stock.get(sku) || { units: 0, locs: [] };
      const held = st.units > 0;
      const last = sold.get(sku);

      // A SKU never sold is aged from when the product was CREATED, not treated as
      // infinitely old. With no sale and no created date there is nothing to
      // measure against at all.
      const basis = last ? new Date(last) : (o.created_at ? new Date(o.created_at) : null);
      if (!basis) continue;
      const days = Math.round(
        (today - Date.UTC(basis.getUTCFullYear(), basis.getUTCMonth(), basis.getUTCDate())) / 86400000);
      if (days <= SLOW_DAYS) continue;                   // still moving: not slow

      // A SKU that holds nothing AND has never sold is a dormant catalogue entry,
      // not a slow-mover — there is neither stock to act on nor a sale to have gone
      // quiet. Leaving these in gave 34,764 rows against the dashboard's 16,478.
      if (!held && !last) continue;

      const pr = PRIORITY(days);
      const u = img.get(sku);
      const p = ph.get(sku);
      rows.push({
        s: sku, n: name.get(sku) || null,
        i: !u ? null : /^https?:\/\//i.test(u) ? u : IMG_BASE + u,
        days, band: BAND[pr], pr,
        never: last ? 0 : 1,           // aged from created_at, flagged not dropped
        units: st.units, locs: st.locs.slice(0, 3),
        phc: p ? p.c : null, php: p ? p.p : null,
        last: last ? new Date(last).toISOString().slice(0, 10) : null,
      });
    }
    // worst first: never sold, then longest since a sale
    rows.sort((a, b) => b.pr - a.pr || b.days - a.days || a.s.localeCompare(b.s));
    return rows;
  });
}

export async function GET(request) {
  try {
    const sp = new URL(request.url).searchParams;
    const all = await getOrBuild('slow-moving', build);

    const q = (sp.get('q') || '').trim().toLowerCase();
    const band = sp.get('band') || '';
    const php = sp.get('ph') || '';
    const held = sp.get('held') === '1';
    let rows = all;
    if (band) rows = rows.filter(r => r.band === band);
    if (php) rows = rows.filter(r => r.php === php);
    if (held) rows = rows.filter(r => r.units > 0);
    if (q) {
      const t = q.split(/\s+/).filter(Boolean);
      rows = rows.filter(r => t.every(x => (r.s + ' ' + (r.n || '')).toLowerCase().includes(x)));
    }

    const p = slice(rows, { page: sp.get('page'), size: sp.get('size') || 25 });
    return Response.json({
      ok: true, builtAt: builtAt('slow-moving'),
      total: all.length,
      holding: all.filter(r => r.units > 0).length,
      never: all.filter(r => r.never).length,
      units: all.reduce((n, r) => n + (r.units > 0 ? r.units : 0), 0),
      bands: all.reduce((a, r) => ((a[r.band] = (a[r.band] || 0) + 1), a), {}),
      owners: [...new Set(all.map(r => r.php).filter(Boolean))].sort(),
      ...p,
    });
  } catch (e) {
    console.error('[api/slow-moving]', e.message);
    return Response.json({ ok: false, error: 'Slow-moving query failed. See server log.' }, { status: 500 });
  }
}
