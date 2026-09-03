import { withClient } from '@/lib/db';
import { getOrBuild, builtAt, page as slice } from '@/lib/dataset';

// SKU FIXED PRICE — the fixed selling price (no shipping) on every marketplace
// this database actually holds. SQL ported from ../sql/refresh/extract/fixed-price.js.
//
// FOUR MARKETPLACES EXIST: Shopify, eBay, Amazon, B&Q. WAYFAIR AND TEMU DO NOT —
// there is no listing table, price column or channel value for either anywhere in
// the database. They are carried as declared-empty columns so the gap is visible,
// never as a blank that reads like "free".
export const dynamic = 'force-dynamic';

export const MARKETS = [
  { key: 'sh', name: 'Shopify' }, { key: 'eb', name: 'eBay' },
  { key: 'am', name: 'Amazon' }, { key: 'bq', name: 'B&Q' },
];
export const ABSENT = ['Wayfair', 'Temu'];

// inventory.products stores this literal string as the title of every combo.
// It is a placeholder, never a product name.
const PLACEHOLDER = 'Combo Default Title.';
const IMG_BASE = 'https://sin1.contabostorage.com/4ad62276cb6d4a83bfb1b8a91b839703:newom/newom/newom/img/product_images/';
const stripPack = s => s.replace(/(\d{1,3})PK$/i, '');

// Some combo images are stored under a filename naming a DIFFERENT SKU — 38 of the
// 156 comboproducts rows. The join is correct; the stored file is simply wrong.
// Showing it would put another product's photo beside this SKU.
const namesAnother = (sku, url) => {
  if (!/comboproducts\//i.test(url || '')) return false;
  let f = String(url).split('/').pop().replace(/\.(jpg|jpeg|png|webp)$/i, '');
  try { f = decodeURIComponent(f); } catch {}
  return f.toUpperCase() !== String(sku).toUpperCase();
};

// Price rule: fixed listing price only, GBP/UK, live listings.
// Shopify keeps the dashboard's channel priority (LEDSone first); the other three
// take the lowest live UK price. The DISTINCT ON keeps the date belonging to the
// same listing as the price — taking min(price) and max(updated_at) separately
// reports a date from a different listing than the one displayed.
const SQL = {
  packs: `SELECT pack_char, pack_qty FROM inventory.product_pk`,
  products: `
    SELECT DISTINCT ON (upper(sku)) upper(sku) AS sku, id, title, inventory_bool AS single
    FROM inventory.products WHERE sku IS NOT NULL AND sku <> '' ORDER BY upper(sku), id`,
  images: `
    SELECT DISTINCT ON (product_id) product_id AS pid, image_path AS p, image_url AS u
    FROM inventory.product_images ORDER BY product_id, image_ordering, id`,
  sh: `
    WITH ch(name, ord) AS (VALUES ('LEDSone',1),('Electricalsone',2),('Vintagelite',3),
                                  ('BesBet',4),('Dcvoltage',5),('dcvoltage',5))
    SELECT DISTINCT ON (upper(COALESCE(NULLIF(l.mapped_sku,''),l.sku)))
           upper(COALESCE(NULLIF(l.mapped_sku,''),l.sku)) AS sku, l.price AS p, l.updated_at AS u
    FROM listings.shopify_listings l JOIN ch ON ch.name = l.channel
    WHERE COALESCE(l.wrong_sku,0)=0 AND l.all_list=1 AND l.price>0
    ORDER BY 1, ch.ord, l.price, l.updated_at DESC`,
  eb: `
    SELECT DISTINCT ON (upper(sku)) upper(sku) AS sku, price AS p, updated_at AS u
    FROM listings.ebay_listings
    WHERE COALESCE(wrong_sku,0)=0 AND all_list=1 AND price>0 AND site='UK'
      AND COALESCE(is_ended,0)=0
    ORDER BY 1, price, updated_at DESC`,
  am: `
    SELECT DISTINCT ON (upper(COALESCE(NULLIF(mapped_sku,''),sku)))
           upper(COALESCE(NULLIF(mapped_sku,''),sku)) AS sku, price AS p, updated_at AS u
    FROM listings.amazon_listings
    WHERE COALESCE(wrong_sku,0)=0 AND all_list=1 AND price>0 AND site='UK'
      AND COALESCE(is_ended,0)=0
    ORDER BY 1, price, updated_at DESC`,
  bq: `
    SELECT DISTINCT ON (upper(COALESCE(NULLIF(mapped_sku,''),sku)))
           upper(COALESCE(NULLIF(mapped_sku,''),sku)) AS sku, price AS p, updated_at AS u
    FROM listings.bandq_listings
    WHERE COALESCE(wrong_sku,0)=0 AND all_list=1 AND price>0
    ORDER BY 1, price, updated_at DESC`,
};

async function build() {
  return withClient(async q => {
    const packQty = {};
    for (const r of await q(SQL.packs)) packQty[String(r.pack_char).toUpperCase()] = Number(r.pack_qty);

    const prods = await q(SQL.products);
    const bySku = new Map(), title = new Map(), pid = new Map(), isSingle = new Map();
    for (const r of prods) {
      bySku.set(r.sku, r);
      pid.set(r.sku, r.id);
      // Single vs combo is inventory.products.inventory_bool, NOT whether the SKU
      // contains a '+'. The '+' heuristic gave 15,768/14,453 where the dashboard
      // reports 4,771/25,450 — plenty of combos carry no '+' in their SKU.
      isSingle.set(r.sku, !!r.single);
      const t = (r.title || '').replace(/\s+/g, ' ').trim();
      if (t && t !== PLACEHOLDER) title.set(r.sku, t);
    }

    const img = new Map();
    for (const r of await q(SQL.images)) img.set(r.pid, r.u || r.p);

    // a date PER marketplace: one max() across all four says "updated today" on a
    // row whose Shopify price has not moved in a year
    const px = new Map();
    for (const { key } of MARKETS) {
      for (const r of await q(SQL[key])) {
        const e = px.get(r.sku) || { d: {} };
        e[key] = Math.round(Number(r.p) * 100);       // pence, so no float noise
        if (r.u) e.d[key] = new Date(r.u).toISOString().slice(0, 10);
        px.set(r.sku, e);
      }
    }

    // A combo name is COMPOSED from its component SKUs — "A + B" — because every
    // combo row's title is the placeholder and marketplace titles for combos are
    // variant labels ("Green / Without Bulb"), not product names. 52 products are
    // flagged single yet carry the placeholder title, so the title is only trusted
    // when the row is flagged single AND the title is not the placeholder.
    const nameFor = sku => {
      const own = isSingle.get(sku) ? title.get(sku) : null;
      if (own) return own;
      if (!sku.includes('+')) {
        const m = /^(.*?)([0-9]{1,3}|[A-Z])PK$/i.exec(sku);
        if (m) {
          const base = title.get(m[1]);
          const qty = /^\d+$/.test(m[2]) ? Number(m[2]) : packQty[m[2].toUpperCase()];
          if (base && qty) return base + ' — ' + qty + ' Pack';
        }
        return null;
      }
      const parts = sku.split('+').map(p => p.trim()).filter(Boolean);
      const named = parts.map(p => title.get(p) || title.get(stripPack(p)) || null);
      return named.every(Boolean) ? named.join(' + ') : null;
    };

    const rows = [];
    for (const sku of [...bySku.keys()].sort()) {
      const p = px.get(sku);
      if (!p) continue;                     // no live listing anywhere: not a price row
      const u = img.get(pid.get(sku));
      const url = !u ? null : /^https?:\/\//i.test(u) ? u : IMG_BASE + u;
      rows.push({
        s: sku,
        combo: isSingle.get(sku) ? 0 : 1,
        n: nameFor(sku),                    // null renders as "-", never invented
        i: url && !namesAnother(sku, url) ? url : null,
        sh: p.sh ?? null, eb: p.eb ?? null, am: p.am ?? null, bq: p.bq ?? null,
        d: p.d,
      });
    }
    return rows;
  });
}

export async function GET(request) {
  try {
    const sp = new URL(request.url).searchParams;
    const all = await getOrBuild('fixed-price', build);

    const q = (sp.get('q') || '').trim().toLowerCase();
    const type = sp.get('type') || '';         // '' | single | combo
    const mk = sp.get('mk') || '';             // listed on this marketplace
    let rows = all;
    if (type === 'single') rows = rows.filter(r => !r.combo);
    if (type === 'combo') rows = rows.filter(r => r.combo);
    if (mk) rows = rows.filter(r => r[mk] != null);
    if (q) {
      const t = q.split(/\s+/).filter(Boolean);
      rows = rows.filter(r => {
        const hay = (r.s + ' ' + (r.n || '')).toLowerCase();
        return t.every(x => hay.includes(x));
      });
    }
    const sort = sp.get('sort') || 's';
    if (sort !== 's') {
      rows = [...rows].sort((a, b) => (a[sort] ?? Infinity) - (b[sort] ?? Infinity));
    }

    const p = slice(rows, { page: sp.get('page'), size: sp.get('size') || 25 });
    return Response.json({
      ok: true, builtAt: builtAt('fixed-price'),
      markets: MARKETS, absent: ABSENT,
      total: all.length, single: all.filter(r => !r.combo).length,
      combo: all.filter(r => r.combo).length,
      coverage: MARKETS.reduce((a, m) => ((a[m.key] = all.filter(r => r[m.key] != null).length), a), {}),
      ...p,
    });
  } catch (e) {
    console.error('[api/fixed-price]', e.message);
    return Response.json({ ok: false, error: 'Fixed price query failed. See server log.' }, { status: 500 });
  }
}
