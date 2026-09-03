'use strict';
// RECENTLY DISPATCHED — orders the Postage Team FINISHED in the last 3 days.
// The exact complement of Pending Dispatch: that tab is the queue, this one is the
// output. Same row grain (one row per ORDER) so the two read the same way.
//
// WHEN WAS IT COMPLETED? This is the whole difficulty. `orders.status = 'Completed'`
// says an order is done but carries NO timestamp of its own, and the obvious candidate
// is unusable on its own:
//
//   order_info.shipped_time     4,702 of 6,104 recent completions   77%
//   shipment.shipment_created_at  5,015                             82%
//   either of the two             5,020                             82%
//
// The missing 18% are not a random gap. They are Amazon PRIME and WAYFAIR orders:
// those marketplaces ship the parcel themselves, so this system never creates a label
// and never stamps a dispatch time. Their shipment row sits at status 'New' with no
// tracking number, but the row's own audit column `shipment.updated_at` IS written.
//
// So completion is read in three tiers, most authoritative first:
//     1  order_info.shipped_time        the real dispatch moment
//     2  shipment.shipment_created_at   when the label was made
//     3  shipment.updated_at            audit fallback, for marketplace-shipped orders
//
// Tier 3 is safe to trust: where BOTH shipped_time and updated_at exist, they agree to
// within 24 hours on 4,753 of 4,763 orders (99.8%), averaging 0.72 hours apart. With
// all three tiers every one of the 17,051 completions in the last 30 days is dated —
// zero undated rows.
//
// MARKETPLACE IS NOT `orders.market_place`. That column is a COUNTRY id (its lookup
// lists Australia, Germany, UK, US...), which is why the Pending Dispatch tab's
// "Marketplace" column really shows a country. The sales CHANNEL the requirement asks
// for — Amazon / eBay / Website — is orders.sub_source_id -> sub_source -> source, and
// it resolves for 100% of these orders.
//
// DISPATCH STATUS is the carrier's own word, from shipment_tracking_log, falling back
// to what the shipment itself proves. Nothing here is inferred from an order status.
const { q } = require('../db.js');
const { dayNum, hoursBetween } = require('../daynum.js');

const WINDOW_DAYS = 3;          // "completed within the last 3 days", from the requirement
// Completions never reach back far: the oldest ORDER completed in the last 3 days was
// placed 20 days ago. 90 days is a generous guard that keeps the scan bounded.
const LOOKBACK_DAYS = 90;

// source.source_name is stored upper case and abbreviated. SHOPIFY is the LEDSone
// website, which is the word the requirement uses for it.
const CHANNEL = {
  AMAZON:'Amazon', EBAY:'eBay', SHOPIFY:'Website', ETSY:'Etsy', ONBUY:'OnBuy',
  WAYFAIR:'Wayfair', AVASAM:'Avasam', MANOMANO:'ManoMano', MANUALORDER:'Manual Order',
  RESEND:'Resend', REPLACEMENT:'Replacement', BOL:'Bol', 'MANUAL OM':'Manual OM',
  FAIRE:'Faire', WOO:'Woo', 'B&Q':'B&Q', TEMU:'Temu'
};
// order_info.shipping_method — the service level the requirement calls Priority.
const SERVICE = {
  prime:'Prime', firstclass:'First Class', international:'International',
  wayfair:'Wayfair', secondday:'Second Day', 'collection order':'Collection'
};
const titled = (map, v) => {
  const s = (v || '').trim();
  if (!s) return '';
  return map[s] || map[s.toUpperCase()] || map[s.toLowerCase()] || s;
};

async function extract(c){
  const rows = await q(c, `
    WITH base AS (
      SELECT o.id, o.order_id, o.order_date,
             i.shipping_method, i.shipped_time,
             sh.shipment_created_at, sh.updated_at AS sh_updated,
             NULLIF(sh.tracking_number, '') AS trk, sh.courier,
             src.source_name AS channel,
             w.warehouse_name AS warehouse,
             sa.city, sa.region, sa.postcode,
             (SELECT string_agg(DISTINCT upper(COALESCE(NULLIF(li.real_sku,''), li.item_sku)), ', ')
                FROM order_management.order_item_info li WHERE li.order_id = o.id) AS skus,
             (SELECT count(*) FROM order_management.order_item_info li
               WHERE li.order_id = o.id) AS lines
      FROM order_management.orders o
      JOIN order_management.order_info i ON i.order_id = o.id
      -- ONE shipment per order, exactly as Pending Dispatch does it. An order can carry
      -- a cancelled label and its replacement; a plain LEFT JOIN would duplicate the
      -- order row and the duplicate-order-id guard would refuse to publish.
      LEFT JOIN LATERAL (
        SELECT s2.shipment_created_at, s2.updated_at, s2.tracking_number,
               cs.name AS courier
        FROM order_management.shipment s2
        LEFT JOIN order_management.carrier_service cs ON cs.id = s2.carrier_service_id
        WHERE s2.order_id = o.id
        ORDER BY (s2.status = 'Cancelled'), s2.shipment_created_at DESC NULLS LAST, s2.id DESC
        LIMIT 1
      ) sh ON true
      LEFT JOIN order_management.sub_source ss ON ss.id = o.sub_source_id
      LEFT JOIN order_management.source src ON src.id = ss.source_id
      LEFT JOIN inventory.warehouse w ON w.warehouse = o.warehouse_id::int
      LEFT JOIN customers.shipping_address sa ON sa.order_id = o.id
      WHERE o.status = 'Completed'
        AND o.order_date >= CURRENT_DATE - $2::int
    ), dated AS (
      SELECT *, COALESCE(shipped_time, shipment_created_at, sh_updated) AS done_at,
             CASE WHEN shipped_time IS NOT NULL THEN 'shipped_time'
                  WHEN shipment_created_at IS NOT NULL THEN 'label'
                  ELSE 'audit' END AS done_src
      FROM base
    )
    SELECT d.*, tl.status AS track_status, tl.last_event_desc
    FROM dated d
    LEFT JOIN order_management.shipment_tracking_log tl ON tl.tracking_number = d.trk
    WHERE d.done_at >= CURRENT_DATE - $1::int
    ORDER BY d.done_at DESC`, [WINDOW_DAYS, LOOKBACK_DAYS]);

  // ---- per-line detail, for the dialog ------------------------------------
  // Product Name, Quantity and Stock Available are LINE properties, so they belong in
  // the dialog and not in a column, exactly as on Pending Dispatch.
  const ids = rows.map(r => r.id);
  const lines = {};
  if (ids.length){
    (await q(c, `
      SELECT li.order_id, upper(COALESCE(NULLIF(li.real_sku,''), li.item_sku)) AS sku,
             li.item_title AS title, li.item_quantity AS qty,
             (SELECT sum(st.quantity) FROM inventory.products p
                JOIN inventory.physical_product_stock st ON st.inventory = p.id
               WHERE upper(p.sku) = upper(COALESCE(NULLIF(li.real_sku,''), li.item_sku))) AS stock
      FROM order_management.order_item_info li
      WHERE li.order_id = ANY($1)
      ORDER BY li.order_id, li.id`, [ids]))
      .forEach(r => {
        (lines[r.order_id] = lines[r.order_id] || []).push({
          s: r.sku || '', n: (r.title || '').replace(/\s+/g, ' ').trim(),
          q: Number(r.qty) || 0,
          k: r.stock === null || r.stock === undefined ? null : Number(r.stock)
        });
      });
  }

  const out = [];
  const stats = { rows: 0, channel: {}, status: {}, warehouse: {}, service: {},
                  doneSrc: {}, withTracking: 0, withCourier: 0, withShipTo: 0,
                  withPriority: 0, lines: 0, sameDay: 0, maxHours: 0 };

  rows.forEach(r => {
    const done = Date.parse(r.done_at);
    const ord  = Date.parse(r.order_date);
    if (!isFinite(done) || !isFinite(ord)) return;

    // Turnaround, NOT "days pending". A finished order has no pending time; what the
    // team is judged on is how long it took. Held in whole hours so the table can say
    // "6h" for a same-day dispatch instead of rounding it away to "0 days".
    // A DURATION is a plain difference — both instants carry the same timezone
    // offset, so it cancels. Only the DATE needs dayNum's care.
    const hours = hoursBetween(r.order_date, r.done_at);

    // The carrier's own status wins. Where the carrier has not reported, the shipment
    // still proves what happened: a tracking number means a label exists; no tracking
    // on a completed order means a marketplace (Prime, Wayfair) shipped it themselves.
    const status = (r.track_status || '').trim() ||
                   (r.trk ? 'Label Created' : 'Dispatched - No Tracking');

    const channel = titled(CHANNEL, r.channel);
    const service = titled(SERVICE, r.shipping_method);
    const wh = (r.warehouse || '').trim();

    stats.rows++;
    stats.channel[channel || '(not recorded)'] = (stats.channel[channel || '(not recorded)'] || 0) + 1;
    stats.status[status] = (stats.status[status] || 0) + 1;
    stats.warehouse[wh || '(not recorded)'] = (stats.warehouse[wh || '(not recorded)'] || 0) + 1;
    stats.service[service || '(not recorded)'] = (stats.service[service || '(not recorded)'] || 0) + 1;
    stats.doneSrc[r.done_src] = (stats.doneSrc[r.done_src] || 0) + 1;
    if (r.trk) stats.withTracking++;
    if (r.courier) stats.withCourier++;
    if (r.city || r.postcode) stats.withShipTo++;
    if (service) stats.withPriority++;
    if (hours <= 24) stats.sameDay++;
    if (hours > stats.maxHours) stats.maxHours = hours;
    stats.lines += (lines[r.id] || []).length;

    out.push({
      o: r.order_id,
      // dayNum, never a bare division — see sql/refresh/daynum.js.
      d: dayNum(r.order_date),                // order date, whole days since epoch
      x: dayNum(r.done_at),                   // dispatch date, same units
      th: hours,                              // turnaround, whole hours
      k: r.skus || '',
      l: Number(r.lines) || 0,
      m: channel,                             // Amazon / eBay / Website / ...
      s: status,
      pr: service,                            // Prime / First Class / ... ('' -> dash)
      t: (r.trk || '').trim(),
      cr: (r.courier || '').trim(),
      w: wh,
      // The address country is stored as country_id and there is STILL no lookup table
      // anywhere in the database — the ids run past 360 and match nothing. A country
      // name cannot be produced without inventing it, so the real address text is shown.
      c: [ (r.city || '').trim(), (r.postcode || '').trim() ].filter(Boolean).join(', '),
      rg: (r.region || '').trim(),
      ev: (r.last_event_desc || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      li: lines[r.id] || []
    });
  });

  // most recently dispatched first — the newest work the team has done
  out.sort((a, b) => b.x - a.x || a.th - b.th || String(a.o).localeCompare(String(b.o)));

  return { payload: { r: out, days: WINDOW_DAYS }, stats };
}

module.exports = { extract, WINDOW_DAYS, LOOKBACK_DAYS, CHANNEL, SERVICE };
