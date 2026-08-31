'use strict';
// SLOW-MOVING PRODUCTS & COMPONENTS — stock that has not moved.
//
// POPULATION: a SKU that HOLDS STOCK and has not sold for more than 90 days. Stock that
// is already at zero is not a slow-moving problem, so it is excluded — the report is
// about units sitting still, and 3,751 SKUs are holding ~2.3M of them.
//
// LAST MOVEMENT is the LATER of two real movements, joined on orders.id (NOT
// orders.order_id, which is the marketplace reference string):
//   1. a direct sale         — order_management.order_item_info
//   2. usage inside a combo  — order_management.order_combo
//   3. a component named in an ad-hoc combo line, "A+B+C" (48% of order-line SKUs are
//      not catalogue SKUs at all, and order_combo does not always break them out)
// Both exclude Cancelled and Deleted orders and both keep Refunded ones.
// inventory.product_history is NOT usable here: it records only manual recounts and
// supply receipts, never routine picking.
//
// SIX MANDATORY FIELDS DO NOT EXIST ANYWHERE IN THE DATABASE and are emitted empty for
// the page to render as "-": Required Action, Action Quantity, Assigned Person,
// Target Date, Status, Team Notes. Every schema was searched. They are workflow fields
// and would need tables that have not been created. Nothing here guesses them.
const { q } = require('../db.js');

// 91-180 Medium, 181-365 High, over 365 Critical. No existing rule was found in the
// database or the current system, so this is the interim rule from the requirement.
const PRIORITY = d => d > 365 ? 3 : d > 180 ? 2 : d > 90 ? 1 : 0;   // 3=Critical 2=High 1=Medium
const IMG_BASE = 'https://sin1.contabostorage.com/4ad62276cb6d4a83bfb1b8a91b839703:newom/newom/newom/img/product_images/';
const PLACEHOLDER = 'Combo Default Title.';
// Some combo images are stored under a filename naming a DIFFERENT SKU — 38 of the 156
// comboproducts rows in inventory.product_images. The join is correct (product_id matches
// products.id); the stored file is simply wrong. Showing it would put another product's
// photo beside this SKU, and on a disposal report that is worse than showing nothing.
// Only these URLs can be checked, because only they carry the SKU in the filename.
const imageNamesAnother = (sku, url) => {
  if (!/comboproducts\//i.test(url || '')) return false;
  let f = String(url).split('/').pop().replace(/\.(jpg|jpeg|png|webp)$/i, '');
  try { f = decodeURIComponent(f); } catch (e) {}
  return f.toUpperCase() !== String(sku).toUpperCase();
};
const tidyName = t => String(t || '').replace(/\s+/g, ' ').trim();
const SLOW_DAYS = 90;

async function extract(c){
  // ---- catalogue -----------------------------------------------------------
  const prod = await q(c, `
    SELECT DISTINCT ON (upper(sku)) upper(sku) AS sku, id, title, inventory_bool AS single,
           created_at
    FROM inventory.products WHERE sku IS NOT NULL AND sku <> '' ORDER BY upper(sku), id`);
  const bySku = {}, byId = {};
  prod.forEach(r => { const o = { sku:r.sku, id:Number(r.id), title:r.title,
                                  single:r.single, created:r.created_at };
                      bySku[r.sku] = o; byId[o.id] = o; });

  // ---- stock, and where it sits -------------------------------------------
  const wh = {};
  (await q(c, `SELECT warehouse, warehouse_name FROM inventory.warehouse`))
    .forEach(r => { wh[Number(r.warehouse)] = r.warehouse_name; });
  wh[33] = wh[33] || 'Unit 5';        // warehouse 33 is real and active but has no master row

  const stock = {};                   // pid -> { qty, places:[{w,loc,q}] }
  (await q(c, `SELECT inventory, warehouse, quantity, product_shelf_location loc
               FROM inventory.physical_product_stock WHERE quantity <> 0`))
    .forEach(r => {
      const pid = Number(r.inventory);
      const e = stock[pid] = stock[pid] || { qty:0, places:[] };
      const qty = Number(r.quantity) || 0;
      e.qty += qty;
      const loc = (r.loc || '').trim();
      if (qty > 0) e.places.push({ w: wh[Number(r.warehouse)] || ('WH ' + r.warehouse),
                                   loc: (loc === '-' || loc === 'N/A') ? '' : loc, q: qty });
    });

  // ---- last real movement --------------------------------------------------
  // TWO SOURCES, and missing the second one is what made this report wrong. A component
  // can leave the shelf without ever appearing as a line item: it goes out INSIDE a sold
  // combo, recorded in order_management.order_combo. Reading only order_item_info marked
  // 1,259 actively-moving SKUs as slow, 858 of them as "never sold at all".
  //
  // Cancelled and Deleted orders are excluded — nothing physically moved. Refunded orders
  // are KEPT: the item did leave the shelf, and a refund is a later, separate event.
  const LIVE = `o.status NOT IN ('Cancelled','Deleted')`;
  const sold = {};
  const note = (sku, when) => {
    if (!sku || !when) return;
    const t = new Date(when).getTime();
    if (!sold[sku] || t > new Date(sold[sku]).getTime()) sold[sku] = when;
  };

  (await q(c, `
    SELECT upper(COALESCE(NULLIF(oi.real_sku,''), oi.item_sku)) AS sku,
           max(o.order_date) AS last_sale
    FROM order_management.order_item_info oi
    JOIN order_management.orders o ON o.id = oi.order_id
    WHERE COALESCE(NULLIF(oi.real_sku,''), oi.item_sku) IS NOT NULL AND ${LIVE}
    GROUP BY 1`))
    .forEach(r => note(r.sku, r.last_sale));

  (await q(c, `
    SELECT upper(oc.sku) AS sku, max(o.order_date) AS last_used
    FROM order_management.order_combo oc
    JOIN order_management.order_item_info oi ON oi.id = oc.order_item_info_id
    JOIN order_management.orders o ON o.id = oi.order_id
    WHERE oc.sku IS NOT NULL AND oc.sku <> '' AND ${LIVE}
    GROUP BY 1`))
    .forEach(r => note(r.sku, r.last_used));

  // THIRD SOURCE. Nearly half of all order-line SKUs are not in inventory.products at
  // all: they are ad-hoc combos spelled out in the line itself, "A+B+C+…", and the
  // components of those are not always broken out into order_combo. Each named component
  // physically left the shelf, so each one is credited with that order's date. Only parts
  // that are themselves real catalogue SKUs are credited — nothing is invented.
  (await q(c, `
    SELECT upper(COALESCE(NULLIF(oi.real_sku,''), oi.item_sku)) AS sku,
           max(o.order_date) AS last_sale
    FROM order_management.order_item_info oi
    JOIN order_management.orders o ON o.id = oi.order_id
    WHERE COALESCE(NULLIF(oi.real_sku,''), oi.item_sku) LIKE '%+%' AND ${LIVE}
    GROUP BY 1`))
    .forEach(r => {
      if (!r.sku) return;
      r.sku.split('+').forEach(part => {
        const k = part.trim();
        if (k && bySku[k]) note(k, r.last_sale);
      });
    });

  // ---- PH: the person who owns the category this SKU belongs to ------------
  // ph_category_products.ref_id is a MARKETPLACE reference, never a SKU: source_id 1 is
  // an Amazon ASIN, 2 an eBay item id, 16 a B&Q EAN. Each resolves through its own
  // listing table.
  const ph = {};
  (await q(c, `
    WITH refs AS (
      SELECT p.ref_id, p.source_id, ph.category_name,
             -- several staff rows repeat the name in both columns ("Shimee Shimee");
             -- show it once rather than twice in a filter list
             trim(CASE WHEN lower(COALESCE(u.first_name,'')) = lower(COALESCE(u.last_name,''))
                       THEN COALESCE(u.first_name,'')
                       ELSE COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'') END) AS person
      FROM staff.ph_category_products p
      JOIN staff.ph_categories ph ON ph.id = p.ph_category_id
      LEFT JOIN staff.users u ON u.id = ph.user_id)
    SELECT sku, category_name, person FROM (
      SELECT upper(COALESCE(NULLIF(a.mapped_sku,''),a.sku)) sku, r.category_name, r.person
        FROM refs r JOIN listings.amazon_listings a ON upper(a.asin)=upper(r.ref_id)
        WHERE r.source_id = 1
      UNION
      SELECT upper(e.sku), r.category_name, r.person
        FROM refs r JOIN listings.ebay_listings e ON e.item_id::text = r.ref_id
        WHERE r.source_id = 2
      UNION
      SELECT upper(COALESCE(NULLIF(b.mapped_sku,''),b.sku)), r.category_name, r.person
        FROM refs r JOIN listings.bandq_listings b ON b.ean = r.ref_id
        WHERE r.source_id = 16) z
    WHERE sku IS NOT NULL`))
    .forEach(r => { if (!ph[r.sku]) ph[r.sku] = { cat: r.category_name, who: r.person || '' }; });

  // ---- images: reuse the reference, never a copy ---------------------------
  // image_path is /img/product_images/<file>; the page already holds LS_IMG_BASE, so only
  // the filename is carried. Nothing is duplicated and no image is re-hosted.
  const image = {};
  const mismatched = [];
  (await q(c, `SELECT DISTINCT ON (product_id) product_id pid, image_path p, image_url u
               FROM inventory.product_images ORDER BY product_id, image_ordering, id`))
    .forEach(r => { const o = byId[Number(r.pid)]; if (!o) return;
      const file = String(r.p || '').split('/').pop();
      // The dashboard is served over https; an http:// image is blocked as mixed content
      // and renders as a broken thumbnail. Same host, same file — only the scheme changes.
      if (imageNamesAnother(o.sku, r.u)){ mismatched.push(o.sku); return; }
      image[o.sku] = (r.u && r.u.indexOf(IMG_BASE) !== 0)
        ? String(r.u).replace(/^http:\/\//i, 'https://') : file; });

  // ---- item names ----------------------------------------------------------
  // inventory.products.title is the internal master name and is correct for single items,
  // but every combo carries the literal placeholder "Combo Default Title." — 82.9% of the
  // rows on this tab had no usable name at all.
  //
  // The real name lives on the listings and, failing that, on the order line. Priority is
  // the UK English title first, then the order line:
  //   Shopify UK  — LEDSone's own store, the team's own wording
  //   Amazon UK   — present where Shopify is not, though more keyword-heavy
  //   B&Q         — single UK site
  //   eBay UK     — nearly useless: only 9,028 of 95,863 UK rows carry a title at all
  //   order line  — order_item_info.item_title, what the customer actually bought
  // Each source only fills a gap; it never overwrites a name a higher source supplied.
  const title = {};
  const fill = rows => rows.forEach(r => {
    const t = tidyName(r.t);
    if (r.s && t && t !== PLACEHOLDER && !title[r.s]) title[r.s] = t;
  });
  const MK = `upper(COALESCE(NULLIF(mapped_sku,''),sku))`;

  fill(await q(c, `SELECT ${MK} AS s, min(title) AS t FROM listings.shopify_listings
                   WHERE site='UK' AND title <> '' AND COALESCE(wrong_sku,0)=0 GROUP BY 1`));
  fill(await q(c, `SELECT ${MK} AS s, min(title) AS t FROM listings.amazon_listings
                   WHERE site='UK' AND title <> '' AND COALESCE(wrong_sku,0)=0 GROUP BY 1`));
  fill(await q(c, `SELECT ${MK} AS s, min(title) AS t FROM listings.bandq_listings
                   WHERE title <> '' AND COALESCE(wrong_sku,0)=0 GROUP BY 1`));
  fill(await q(c, `SELECT upper(sku) AS s, min(title) AS t FROM listings.ebay_listings
                   WHERE site='UK' AND title IS NOT NULL AND title <> ''
                     AND COALESCE(wrong_sku,0)=0 GROUP BY 1`));
  // The newest order line wins — it is the most recent wording the customer saw. Ordered
  // by the line's own id rather than joining 1.19M rows to orders for a date: the ids are
  // issued in insertion order, so the newest id is the newest line. Joining for order_date
  // gave the same titles and cost 110 extra seconds on every refresh.
  fill(await q(c, `SELECT DISTINCT ON (upper(COALESCE(NULLIF(real_sku,''),item_sku)))
                     upper(COALESCE(NULLIF(real_sku,''),item_sku)) AS s, item_title AS t
                   FROM order_management.order_item_info
                   WHERE item_title IS NOT NULL AND item_title <> ''
                   ORDER BY 1, id DESC`));

  // ---- images the catalogue does not hold -----------------------------------
  // 3,205 SKUs have no row at all in inventory.product_images. The picture usually exists
  // on a listing or on the order line — same chain as the item name, UK listings first,
  // order line last. Each source only fills a gap, and every candidate goes through the
  // same "does this file name a different SKU" guard.
  const fillImg = rows => rows.forEach(r => {
    const u = String(r.u || '').trim();
    // order lines carry keys that are not catalogue SKUs at all — "-IDE" suffixes,
    // free text like "10METERS 3 CORE TWISTED BLACK & WHITE", internal codes. They can
    // never match a row, so they are dropped before the identity guard rather than
    // counted as mismatches.
    if (!r.s || !u || !bySku[r.s] || image[r.s]) return;
    if (imageNamesAnother(r.s, u)){ mismatched.push(r.s); return; }
    image[r.s] = u.replace(/^http:\/\//i, 'https://');
  });
  const MKI = `upper(COALESCE(NULLIF(mapped_sku,''),sku))`;
  fillImg(await q(c, `SELECT ${MKI} AS s, min(main_image_url) AS u FROM listings.shopify_listings
                      WHERE site='UK' AND main_image_url <> '' AND COALESCE(wrong_sku,0)=0 GROUP BY 1`));
  fillImg(await q(c, `SELECT ${MKI} AS s, min(main_image_url) AS u FROM listings.amazon_listings
                      WHERE site='UK' AND main_image_url <> '' AND COALESCE(wrong_sku,0)=0 GROUP BY 1`));
  fillImg(await q(c, `SELECT ${MKI} AS s, min(main_image_url) AS u FROM listings.bandq_listings
                      WHERE main_image_url <> '' AND COALESCE(wrong_sku,0)=0 GROUP BY 1`));
  fillImg(await q(c, `SELECT upper(sku) AS s, min(main_image_url) AS u FROM listings.ebay_listings
                      WHERE site='UK' AND main_image_url IS NOT NULL AND main_image_url <> ''
                        AND COALESCE(wrong_sku,0)=0 GROUP BY 1`));
  fillImg(await q(c, `SELECT DISTINCT ON (upper(COALESCE(NULLIF(real_sku,''),item_sku)))
                        upper(COALESCE(NULLIF(real_sku,''),item_sku)) AS s, item_img AS u
                      FROM order_management.order_item_info
                      WHERE item_img IS NOT NULL AND item_img <> '' ORDER BY 1, id DESC`));

  // ---- parent products: which combos consume this SKU ----------------------
  // There is no bill-of-materials table (suppliers.child_item_products holds only 119
  // rows). A combo SKU spells out its own components — "A+B+C" — so the parents of a
  // component are the combos that name it. That is derived, and reported as derived.
  const parents = {};
  Object.keys(bySku).forEach(sku => {
    if (sku.indexOf('+') === -1) return;
    sku.split('+').forEach(part => {
      const k = part.trim().toUpperCase(); if (!k || !bySku[k]) return;
      (parents[k] = parents[k] || []).push(sku);
    });
  });

  // ---- assemble ------------------------------------------------------------
  const today = new Date(); today.setUTCHours(0,0,0,0);
  const rows = [];
  const stats = { inStock:0, slow:0, heldRows:0, zeroStock:0, medium:0, high:0, critical:0,
                  neverSold:0, units:0, withPH:0, withImage:0, withLocation:0, fallbackDate:0,
                  named:0, unnamed:0, imagesNamingAnotherSku: mismatched.length };

  Object.keys(bySku).forEach(sku => {
    const o = bySku[sku];
    const st = stock[o.id] || { qty: 0, places: [] };
    const held = st.qty > 0;
    if (held) stats.inStock++;

    const last = sold[sku] ? new Date(sold[sku]) : null;
    const basis = last || (o.created ? new Date(o.created) : null);
    if (!basis) return;                             // nothing to measure against
    // Postgres compares CURRENT_DATE against a ::date, so the time of day is dropped.
    // Differencing the raw timestamps instead loses a day whenever a sale happened in the
    // afternoon, which silently pushed rows sitting on the 91-day boundary out of the
    // report — ten of them at the last count.
    const day0 = Date.UTC(basis.getUTCFullYear(), basis.getUTCMonth(), basis.getUTCDate());
    const days = Math.round((today.getTime() - day0) / 86400000);
    if (days <= SLOW_DAYS) return;
    // A SKU that holds nothing AND has never sold is a dormant catalogue entry, not a
    // slow-mover — there is neither stock to act on nor a sale to have gone quiet.
    // Everything else is kept and FLAGGED, so a zero-stock row is visible as zero rather
    // than silently missing from the report.
    if (!held && !last) return;

    const pr = PRIORITY(days);
    stats.slow++;
    if (held){ stats.heldRows++; stats.units += st.qty; } else stats.zeroStock++;
    if (pr === 1) stats.medium++; else if (pr === 2) stats.high++; else if (pr === 3) stats.critical++;
    if (!last) { stats.neverSold++; stats.fallbackDate++; }

    const p = ph[sku];
    if (p) stats.withPH++;
    if (image[sku]) stats.withImage++;
    if ((o.title && o.title !== PLACEHOLDER) || title[sku]) stats.named++; else stats.unnamed++;

    // one line per warehouse that actually holds units, biggest first
    st.places.sort((a, b) => b.q - a.q);
    const where = st.places.map(x => x.w + (x.loc ? ' · ' + x.loc : '') + ' (' + x.q + ')');
    if (st.places.some(x => x.loc)) stats.withLocation++;

    rows.push({
      s: sku,
      i: image[sku] || '',
      // trimmed and space-collapsed: several master titles carry trailing spaces and
      // double gaps, which render as ragged names and break any exact-match check
      n: tidyName((o.title && o.title !== PLACEHOLDER) ? o.title : (title[sku] || '')),
      t: o.single ? 1 : 0,                          // 1 = single item, 0 = combo/assembly
      pa: (parents[sku] || []).slice(0, 2),
      pn: (parents[sku] || []).length,          // how many combos use it in total
      q: st.qty,
      z: held ? 0 : 1,                              // 1 = holds no stock, flagged not dropped
      w: where,
      d: last ? Math.round(last.getTime() / 86400000) : 0,   // whole days since epoch, 0 = never sold
      dy: days,
      pr: pr,
      ph: p ? p.cat : '',
      pw: p ? p.who : ''
      // Required Action, Action Qty, Assigned Person, Target Date, Status, Team Notes
      // are deliberately ABSENT — they do not exist in the database.
    });
  });

  // Critical first, then High, then Medium; within a band the longest idle first.
  // stock you can act on first; within that, Critical first and longest idle first
  rows.sort((a, b) => a.z - b.z || b.pr - a.pr || b.dy - a.dy || a.s.localeCompare(b.s));

  return { payload: { r: rows, asOf: today.toISOString().slice(0, 10) }, stats };
}

module.exports = { extract, SLOW_DAYS };
