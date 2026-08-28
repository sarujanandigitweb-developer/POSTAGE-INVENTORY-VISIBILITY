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

// inventory.products stores this literal string as the title of every combo — and of 52
// rows flagged single. It is a placeholder, never a product name.
const PLACEHOLDER = 'Combo Default Title.';

const IMG_BASE = 'https://sin1.contabostorage.com/4ad62276cb6d4a83bfb1b8a91b839703:newom/newom/newom/img/product_images/';

// a component SKU may carry a pack suffix (…2PK, …3PK) that the base product lacks
const stripPack = s => s.replace(/(\d{1,3})PK$/i, '');

// Component titles are carried WHOLE. They used to be cut to their first clause and
// capped at 46 characters, which put a literal "…" in the middle of the product name —
// the page now wraps instead, so nothing needs to be hidden to make it fit.
const clause = t => String(t || '').trim();

async function extract(c){
  // ---- pack codes ----------------------------------------------------------
  // A trailing pack token is either digits ("…2PK") or one of the letter codes in
  // inventory.product_pk ("…APK" = 10 Pack). Without the table, 12MIP20100APK has no name.
  const packQty = {};
  (await q(c, `SELECT pack_char, pack_qty FROM inventory.product_pk`))
    .forEach(r => { packQty[String(r.pack_char).toUpperCase()] = Number(r.pack_qty); });

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
  const image = {};
  imgs.forEach(r => {
    const o = byId[Number(r.pid)]; if (!o) return;
    const file = String(r.p || '').split('/').pop();
    // a non-standard host has to be carried whole; the standard one collapses to a filename
    image[o.sku] = (r.u && r.u.indexOf(IMG_BASE) !== 0) ? r.u : file;
  });

  // ---- prices --------------------------------------------------------------
  // Shopify: LEDSone first, then the other UK channels — the rule the £ column already uses
  // DISTINCT ON picks ONE listing row per SKU and that row's own updated_at travels with
  // its price. Taking min(price) and max(updated_at) separately — which is what this did
  // first — reports a date belonging to a different listing than the price displayed.
  const sh = await q(c, `
    WITH ch(name, ord) AS (VALUES ('LEDSone',1),('Electricalsone',2),('Vintagelite',3),
                                  ('BesBet',4),('Dcvoltage',5),('dcvoltage',5))
    SELECT DISTINCT ON (upper(COALESCE(NULLIF(l.mapped_sku,''),l.sku)))
           upper(COALESCE(NULLIF(l.mapped_sku,''),l.sku)) AS sku, l.price AS p, l.updated_at AS u
    FROM listings.shopify_listings l JOIN ch ON ch.name = l.channel
    WHERE COALESCE(l.wrong_sku,0)=0 AND l.all_list=1 AND l.price>0
    ORDER BY 1, ch.ord, l.price, l.updated_at DESC`);

  const eb = await q(c, `
    SELECT DISTINCT ON (upper(sku)) upper(sku) AS sku, price AS p, updated_at AS u
    FROM listings.ebay_listings
    WHERE COALESCE(wrong_sku,0)=0 AND all_list=1 AND price>0 AND site='UK'
      AND COALESCE(is_ended,0)=0
    ORDER BY 1, price, updated_at DESC`);

  const am = await q(c, `
    SELECT DISTINCT ON (upper(COALESCE(NULLIF(mapped_sku,''),sku))) upper(COALESCE(NULLIF(mapped_sku,''),sku)) AS sku, price AS p, updated_at AS u
    FROM listings.amazon_listings
    WHERE COALESCE(wrong_sku,0)=0 AND all_list=1 AND price>0 AND site='UK'
      AND COALESCE(is_ended,0)=0
    ORDER BY 1, price, updated_at DESC`);

  const bq = await q(c, `
    SELECT DISTINCT ON (upper(COALESCE(NULLIF(mapped_sku,''),sku)))
           upper(COALESCE(NULLIF(mapped_sku,''),sku)) AS sku, price AS p, updated_at AS u
    FROM listings.bandq_listings
    WHERE COALESCE(wrong_sku,0)=0 AND all_list=1 AND price>0
    ORDER BY 1, price, updated_at DESC`);

  // A DATE PER MARKETPLACE. One max() across all four says "updated today" on a row whose
  // Shopify price has not moved in a year, because Amazon happened to sync this morning.
  const px = {};                              // sku -> { sh, eb, am, bq, d:{sh,eb,am,bq} }
  const put = (rows, key) => rows.forEach(r => {
    const e = px[r.sku] = px[r.sku] || { d: {} };
    e[key] = Math.round(Number(r.p) * 100);   // pence, so no float noise
    const t = r.u ? Date.parse(r.u) : 0;
    if (t) e.d[key] = Math.round(t / 86400000);
  });
  put(sh, 'sh'); put(eb, 'eb'); put(am, 'am'); put(bq, 'bq');

  // ---- name every SKU ------------------------------------------------------
  // a combo SKU is one of two shapes:
  //   A+B+C   several components  -> "name of A + name of B + name of C"
  //   A2PK    a pack of one item  -> "name of A (2 Pack)"
  // Falling back to the bare SKU is the last resort, not the first.
  const titleOf = k => {
    const hit = bySku[k] || bySku[stripPack(k)];
    return hit && hit.single && hit.title && hit.title !== PLACEHOLDER
      ? clause(hit.title) : null;
  };
  // 52 products are flagged single yet carry the combo placeholder title, and several of
  // those are plainly pack variants (CL2ROR5PK). The placeholder is never a name for
  // anything — fall through to composing, exactly as a combo does.
  const nameOf = o => {
    const own = String(o.title || '').trim();
    if (own && own !== PLACEHOLDER) return own;
    if (o.sku.indexOf('+') !== -1)
      return o.sku.split('+').map(p => { const k = p.trim().toUpperCase();
                                         return titleOf(k) || k; });
    // "12BO1002PK" splits as 12BO100 + 2PK, not 12BO1 + 002PK. A regex cannot know
    // which; the catalogue can. Try each split and take the one that names a real product.
    if (/PK$/i.test(o.sku)){
      const body = o.sku.slice(0, -2);
      // a single letter pack code first: …APK -> 10 Pack
      const L = body.slice(-1).toUpperCase();
      if (packQty[L] !== undefined && !/\d/.test(L)){
        const base = titleOf(body.slice(0, -1).toUpperCase());
        if (base) return [base, packQty[L]];
      }
      for (let d = 1; d <= 3 && d < body.length; d++){
        const n = body.slice(-d);
        if (!/^\d+$/.test(n)) break;
        const base = titleOf(body.slice(0, -d).toUpperCase());
        if (base) return [base, Number(n)];
      }
    }
    return titleOf(o.sku) || o.sku;
  };

  // ---- rows: only SKUs with at least one real marketplace price ------------
  // ENCODING. 30,000 rows of full product names would add ~4.6 MB to a page that is
  // already 3.9 MB. Component names repeat heavily — every pack variant of a product
  // shares one title — so names are interned and each row stores indices:
  //
  //   n = 5            a single name, dictionary entry 5
  //   n = [5, -10]     entry 5, sold as a 10 Pack     (negative marks a pack count)
  //   n = [5, 9, 2]    a combo of entries 5, 9 and 2  (all indices are >= 0)
  //
  // The page reassembles the display string; search runs on the reassembled text, so
  // nothing is lost to the reader. This costs about half the bytes of plain names.
  const dict = [], dictIdx = new Map();
  const dates = [], dateIdx = new Map();
  const intern = v => { let i = dictIdx.get(v);
                        if (i === undefined){ i = dict.length; dict.push(v); dictIdx.set(v, i); }
                        return i; };

  const rows = [];
  let single = 0, combo = 0, named = 0, withImg = 0;
  Object.keys(px).forEach(sku => {
    const o = bySku[sku]; if (!o) return;             // a listing SKU with no catalogue row
    const e = px[sku];
    if (!(e.sh || e.eb || e.am || e.bq)) return;

    const parts = nameOf(o);
    let n;
    if (typeof parts === 'string') n = intern(parts);
    else if (parts.length === 2 && typeof parts[1] === 'number') n = [intern(parts[0]), -parts[1]];
    else n = parts.map(intern);

    const img = image[sku] || 0;
    if (img) withImg++;
    // whole days since epoch, one per marketplace; the tuple is interned because the
    // nightly sync stamps nearly every listing with the same date
    const tuple = [e.d.sh || 0, e.d.eb || 0, e.d.am || 0, e.d.bq || 0];
    const tk = tuple.join(',');
    let ui = dateIdx.get(tk);
    if (ui === undefined){ ui = dates.length; dates.push(tuple); dateIdx.set(tk, ui); }
    rows.push([sku, o.single ? 1 : 0, n, img,
               e.sh || 0, e.eb || 0, e.am || 0, e.bq || 0, ui]);
    if (o.single) single++; else combo++;
    if (!(typeof parts === 'string' && parts === sku)) named++;
  });
  rows.sort((a, b) => a[0].localeCompare(b[0]));

  return { payload: { d: dict, u: dates, r: rows },
           stats: { rows: rows.length, single, combo, named, unnamed: rows.length - named,
                    dict: dict.length, dateTuples: dates.length, withImg,
                    noCatalogueRow: Object.keys(px).length - rows.length } };
}

module.exports = { extract, IMG_BASE };
