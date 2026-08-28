'use strict';
// SKU FIXED PRICE — the fixed selling price (no shipping) of every SKU on every
// marketplace that this database actually holds.
//
// FOUR MARKETPLACES EXIST: Shopify, eBay, Amazon, B&Q.
// WAYFAIR AND TEMU DO NOT. There is no listing table, price column or channel value for
// either one anywhere in the database. They are carried as declared-empty columns so the
// gap is visible rather than silently dropped — never as a blank that reads like "free".
//
// PRICE RULE. Fixed listing price only, GBP/UK, from live listings:
//   wrong_sku = 0, all_list = 1, price > 0, site = 'UK'.
// Shopify follows the dashboard's established channel priority (LEDSone first); the other
// three take the lowest live UK listing price. Shipping is never added — these tables
// carry no shipping column, so `price` is the fixed price as listed.
//
// PRODUCT NAME. inventory.products.title is authoritative for single SKUs. It is NOT for
// combos: every combo row in that table reads the literal string "Combo Default Title.",
// and the marketplace titles for combos are variant labels ("Green / Without Bulb",
// "Pack 2"), not product names. A combo name is therefore COMPOSED from its component
// SKUs — "A + B" — which is both truthful and the shape the requirement asked for.
const { q } = require('../db.js');

const IMG_BASE = 'https://sin1.contabostorage.com/4ad62276cb6d4a83bfb1b8a91b839703:newom/newom/newom/img/product_images/';

// a component SKU may carry a pack suffix (…2PK, …3PK) that the base product lacks
const stripPack = s => s.replace(/(\d{1,3})PK$/i, '');

// keep a composed name readable: the first clause of each component title
const clause = t => {
  const s = String(t || '').split(/\s*[,|]\s*/)[0].trim();
  return s.length > 46 ? s.slice(0, 45).trim() + '…' : s;
};

async function extract(c){
  // ---- catalogue ----------------------------------------------------------
  const prod = await q(c, `
    SELECT DISTINCT ON (upper(sku)) upper(sku) AS sku, id, title, inventory_bool AS single
    FROM inventory.products WHERE sku IS NOT NULL AND sku <> '' ORDER BY upper(sku), id`);

  const bySku = {}, byId = {};
  prod.forEach(r => { const o = { sku: r.sku, id: Number(r.id), title: r.title, single: r.single };
                      bySku[r.sku] = o; byId[o.id] = o; });

  // ---- images: image_path is /img/product_images/<file>, reuse the page's base --------
  const imgs = await q(c, `
    SELECT DISTINCT ON (product_id) product_id AS pid, image_path AS p, image_url AS u
    FROM inventory.product_images ORDER BY product_id, image_ordering, id`);
  const img = {};
  imgs.forEach(r => {
    const o = byId[Number(r.pid)]; if (!o) return;
    const file = String(r.p || '').split('/').pop();
    // a non-standard host has to be carried whole; the standard one collapses to a filename
    img[o.sku] = (r.u && r.u.indexOf(IMG_BASE) !== 0) ? r.u : file;
  });

  // ---- prices --------------------------------------------------------------
  // Shopify: LEDSone first, then the other UK channels — the rule the £ column already uses
  const sh = await q(c, `
    WITH ch(name, ord) AS (VALUES ('LEDSone',1),('Electricalsone',2),('Vintagelite',3),
                                  ('BesBet',4),('Dcvoltage',5),('dcvoltage',5)),
    d AS (SELECT upper(COALESCE(NULLIF(l.mapped_sku,''),l.sku)) AS sku, ch.ord,
                 min(l.price) AS p, max(l.updated_at) AS u
          FROM listings.shopify_listings l JOIN ch ON ch.name = l.channel
          WHERE COALESCE(l.wrong_sku,0)=0 AND l.all_list=1 AND l.price>0
          GROUP BY 1,2)
    SELECT DISTINCT ON (sku) sku, p, u FROM d ORDER BY sku, ord`);

  const eb = await q(c, `
    SELECT upper(sku) AS sku, min(price) AS p, max(updated_at) AS u
    FROM listings.ebay_listings
    WHERE COALESCE(wrong_sku,0)=0 AND all_list=1 AND price>0 AND site='UK'
      AND COALESCE(is_ended,0)=0
    GROUP BY 1`);

  const am = await q(c, `
    SELECT upper(COALESCE(NULLIF(mapped_sku,''),sku)) AS sku, min(price) AS p, max(updated_at) AS u
    FROM listings.amazon_listings
    WHERE COALESCE(wrong_sku,0)=0 AND all_list=1 AND price>0 AND site='UK'
      AND COALESCE(is_ended,0)=0
    GROUP BY 1`);

  const bq = await q(c, `
    SELECT upper(COALESCE(NULLIF(mapped_sku,''),sku)) AS sku, min(price) AS p, max(updated_at) AS u
    FROM listings.bandq_listings
    WHERE COALESCE(wrong_sku,0)=0 AND all_list=1 AND price>0
    GROUP BY 1`);

  const px = {};                              // sku -> { sh, eb, am, bq, u }
  const put = (rows, key) => rows.forEach(r => {
    const e = px[r.sku] = px[r.sku] || {};
    e[key] = Math.round(Number(r.p) * 100);   // pence, so no float noise
    const t = r.u ? Date.parse(r.u) : 0;
    if (t && t > (e.u || 0)) e.u = t;
  });
  put(sh, 'sh'); put(eb, 'eb'); put(am, 'am'); put(bq, 'bq');

  // ---- name every SKU ------------------------------------------------------
  // a combo SKU is one of two shapes:
  //   A+B+C   several components  -> "name of A + name of B + name of C"
  //   A2PK    a pack of one item  -> "name of A (2 Pack)"
  // Falling back to the bare SKU is the last resort, not the first.
  const titleOf = k => {
    const hit = bySku[k] || bySku[stripPack(k)];
    return hit && hit.single && hit.title && hit.title !== 'Combo Default Title.'
      ? clause(hit.title) : null;
  };
  const nameOf = o => {
    if (o.single) return String(o.title || '').trim() || o.sku;
    if (o.sku.indexOf('+') !== -1)
      return o.sku.split('+').map(p => { const k = p.trim().toUpperCase();
                                         return titleOf(k) || k; }).join(' + ');
    // "12BO1002PK" splits as 12BO100 + 2PK, not 12BO1 + 002PK. A regex cannot know
    // which; the catalogue can. Try each split and take the one that names a real product.
    if (/PK$/i.test(o.sku)){
      const body = o.sku.slice(0, -2);
      for (let d = 1; d <= 3 && d < body.length; d++){
        const n = body.slice(-d);
        if (!/^\d+$/.test(n)) break;
        const base = titleOf(body.slice(0, -d).toUpperCase());
        if (base) return base + ' (' + Number(n) + ' Pack)';
      }
    }
    return titleOf(o.sku) || o.sku;
  };

  // ---- rows: only SKUs with at least one real marketplace price ------------
  const rows = [];
  let single = 0, combo = 0, composed = 0, withImg = 0;
  Object.keys(px).forEach(sku => {
    const o = bySku[sku]; if (!o) return;             // a listing SKU with no catalogue row
    const e = px[sku];
    if (!(e.sh || e.eb || e.am || e.bq)) return;
    const r = { s: sku, t: o.single ? 1 : 0, n: nameOf(o) };
    if (img[sku]) { r.i = img[sku]; withImg++; }
    if (e.sh) r.sh = e.sh; if (e.eb) r.eb = e.eb;
    if (e.am) r.am = e.am; if (e.bq) r.bq = e.bq;
    if (e.u) r.u = Math.round(e.u / 86400000);        // whole days since epoch
    rows.push(r);
    if (o.single) single++; else { combo++; if (r.n !== sku) composed++; }
  });
  rows.sort((a, b) => a.s.localeCompare(b.s));

  return { rows, stats: { rows: rows.length, single, combo, composed, withImg,
                          noCatalogueRow: Object.keys(px).length - rows.length } };
}

module.exports = { extract, IMG_BASE };
