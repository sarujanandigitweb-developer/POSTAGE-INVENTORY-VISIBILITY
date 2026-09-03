'use strict';
// MISSING SHIPMENTS — PENDING DISPATCH: open orders that are not yet out of the door.
//
// POPULATION. `order_info.shipped` alone is NOT usable as the open/closed signal. 496,252
// orders marked `Completed` carry shipped = 0 or NULL, stretching back to 2020 — the flag
// was simply never backfilled on historical rows (only 4,198 of them even have a
// shipped_time). Filtering on it produced 497,790 "pending" orders, 447,274 of them over a
// year old, which is not a dispatch backlog, it is a broken column.
//
// `orders.status` is the reliable signal. The genuinely open states are Inprogress, New
// and Hold — 1,244 orders, none older than about two weeks, which is what a real pending
// queue looks like. Completed, Delivered-equivalent, Cancelled, Deleted and Refunded are
// all excluded, as the requirement asks.
//
// ROW GRAIN: one row per ORDER. Days Pending, Priority and SLA Breach are properties of
// the order, not of a line, and orders here average 1.12 lines. The SKUs on the order are
// listed in their own column.
//
// NO DISPATCH SLA EXISTS IN THE DATABASE. Every *_due / *_sla / ship_by column belongs to
// eBay returns or supplier invoices. SLA_DAYS below is therefore a stated assumption taken
// from the requirement's own age bands, not a value read from anywhere.
const { q } = require('../db.js');
const { dayNum } = require('../daynum.js');

const SLA_DAYS = 3;                       // an order still unshipped after this is a breach
const OPEN_STATUSES = ['Inprogress', 'New', 'Hold'];

const ageBand = d => d <= 1 ? '0-1 days' : d <= 3 ? '2-3 days' : '4+ days';
const priority = d => d > 3 ? 3 : d > 1 ? 2 : 1;      // 3 Critical, 2 High, 1 Normal

async function extract(c){
  const rows = await q(c, `
    SELECT o.id, o.order_id, o.order_date, o.status,
           i.shipped, i.payment_status, i.shipped_error,
           sh.status AS ship_status, sh.tracking_number, sh.courier,
           mp.name AS marketplace,
           w.warehouse_name AS warehouse,
           sa.city, sa.region, sa.postcode, sa.country_id,
           (CURRENT_DATE - o.order_date::date) AS days,
           (SELECT string_agg(DISTINCT upper(COALESCE(NULLIF(li.real_sku,''), li.item_sku)), ', ')
              FROM order_management.order_item_info li WHERE li.order_id = o.id) AS skus,
           (SELECT count(*) FROM order_management.order_item_info li WHERE li.order_id = o.id) AS lines
    FROM order_management.orders o
    JOIN order_management.order_info i ON i.order_id = o.id
    -- ONE shipment per order. An order can carry several shipment rows — a cancelled
    -- label and its replacement, or one parcel per box — and a plain LEFT JOIN turns that
    -- into duplicate order rows. LSFR1632 has a Cancelled and a New shipment, which is
    -- exactly the case that made the duplicate-order-id guard refuse to publish.
    -- A live label beats a cancelled one; the most recent wins after that.
    LEFT JOIN LATERAL (
      SELECT s2.status, s2.tracking_number, cs.name AS courier
      FROM order_management.shipment s2
      LEFT JOIN order_management.carrier_service cs ON cs.id = s2.carrier_service_id
      WHERE s2.order_id = o.id
      ORDER BY (s2.status = 'Cancelled'), s2.shipment_created_at DESC NULLS LAST, s2.id DESC
      LIMIT 1
    ) sh ON true
    -- orders.market_place is a numeric id held as text; the lookup gives the real name
    LEFT JOIN order_management.market_place mp ON mp.id = NULLIF(o.market_place, '')::int
    LEFT JOIN inventory.warehouse w ON w.warehouse = o.warehouse_id::int
    LEFT JOIN customers.shipping_address sa ON sa.order_id = o.id
    WHERE o.status = ANY($1) AND COALESCE(i.shipped, 0) <> 1
    ORDER BY o.order_date`, [OPEN_STATUSES]);

  // ---- per-line detail, for the dialog ------------------------------------
  // Product Name, Quantity and Stock Available belong to a LINE, not an order. 105 of
  // these orders carry more than one line and one carries 16, so they cannot be columns
  // on a one-row-per-order table without turning a cell into a list.
  const lines = {};
  (await q(c, `
    SELECT li.order_id, upper(COALESCE(NULLIF(li.real_sku,''), li.item_sku)) AS sku,
           li.item_title AS title, li.item_quantity AS qty,
           (SELECT sum(st.quantity) FROM inventory.products p
              JOIN inventory.physical_product_stock st ON st.inventory = p.id
             WHERE upper(p.sku) = upper(COALESCE(NULLIF(li.real_sku,''), li.item_sku))) AS stock
    FROM order_management.order_item_info li
    JOIN order_management.orders o ON o.id = li.order_id
    JOIN order_management.order_info i ON i.order_id = o.id
    WHERE o.status = ANY($1) AND COALESCE(i.shipped, 0) <> 1
    ORDER BY li.order_id, li.id`, [OPEN_STATUSES]))
    .forEach(r => {
      (lines[r.order_id] = lines[r.order_id] || []).push({
        s: r.sku || '', n: (r.title || '').replace(/\s+/g, ' ').trim(),
        q: Number(r.qty) || 0,
        k: r.stock === null || r.stock === undefined ? null : Number(r.stock)
      });
    });

  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const out = [];
  const stats = { rows: 0, breached: 0, band: {}, dispatch: {}, payment: {}, noSku: 0,
                withMarketplace: 0, withWarehouse: 0, withShipTo: 0, withCourier: 0, lines: 0 };

  rows.forEach(r => {
    const days = Number(r.days);
    if (!isFinite(days)) return;

    // Dispatch Status, in the requirement's own words. A label already exists when the
    // shipment row says New — that order is waiting on the courier, not on packing.
    const dispatch = r.status === 'Hold' ? 'On Hold'
                   : r.ship_status === 'New' ? 'Awaiting Courier Collection'
                   : r.status === 'Inprogress' ? 'Processing'
                   : 'Not Dispatched';

    const pay = (r.payment_status || '').trim() || '';
    const band = ageBand(days);
    const pr = priority(days);
    const breach = days > SLA_DAYS;

    stats.rows++;
    if (breach) stats.breached++;
    stats.band[band] = (stats.band[band] || 0) + 1;
    stats.dispatch[dispatch] = (stats.dispatch[dispatch] || 0) + 1;
    stats.payment[pay || '(not recorded)'] = (stats.payment[pay || '(not recorded)'] || 0) + 1;
    if (!r.skus) stats.noSku++;
    if (r.marketplace) stats.withMarketplace++;
    if (r.warehouse) stats.withWarehouse++;
    if (r.city || r.postcode) stats.withShipTo++;
    if (r.courier) stats.withCourier++;
    stats.lines += (lines[r.id] || []).length;

    out.push({
      o: r.order_id,
      // dayNum, never a bare division — see sql/refresh/daynum.js for the two off-by-ones
      // that hides. 44% of this queue was showing an order date one day late.
      d: dayNum(r.order_date),                   // whole days since epoch
      k: r.skus || '',
      l: Number(r.lines) || 0,
      p: pay,                                    // '' renders as "-", never invented
      s: dispatch,
      dy: days,
      pr: pr,
      b: breach ? 1 : 0,
      e: (r.shipped_error || '').trim(),         // why the system could not ship it
      t: (r.tracking_number || '').trim(),
      m: (r.marketplace || '').trim(),           // real name from the marketplace lookup
      w: (r.warehouse || '').trim(),
      // The address country is stored as country_id with NO lookup table anywhere in the
      // database, so a country NAME cannot be resolved without inventing one. The city and
      // postcode are real text and say the same thing to a packer, so those are shown.
      c: [ (r.city || '').trim(), (r.postcode || '').trim() ].filter(Boolean).join(', '),
      rg: (r.region || '').trim(),
      cr: (r.courier || '').trim(),
      li: lines[r.id] || []
    });
  });

  // longest wait first — the order closest to breaching is the one to pack next
  out.sort((a, b) => b.dy - a.dy || String(a.o).localeCompare(String(b.o)));

  return { payload: { r: out, sla: SLA_DAYS }, stats };
}

module.exports = { extract, SLA_DAYS, OPEN_STATUSES };
