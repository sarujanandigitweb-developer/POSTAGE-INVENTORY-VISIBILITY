import { withClient } from '@/lib/db';

// MISSING SHIPMENTS — PENDING DISPATCH.
// SQL ported from ../sql/refresh/extract/pending-dispatch.js, which carries the
// reasoning in full. The two decisions that matter:
//
//   * order_info.shipped is NOT the open/closed signal. 496,252 orders marked
//     Completed carry shipped = 0 or NULL going back to 2020 — the flag was never
//     backfilled. Filtering on it produced 497,790 "pending" orders, 447,274 of
//     them over a year old. orders.status is the reliable signal.
//   * NO DISPATCH SLA EXISTS IN THE DATABASE. Every *_due / *_sla / ship_by
//     column belongs to eBay returns or supplier invoices. SLA_DAYS is a stated
//     assumption taken from the requirement's own age bands, not a read value.
export const dynamic = 'force-dynamic';

const SLA_DAYS = 3;
const OPEN_STATUSES = ['Inprogress', 'New', 'Hold'];
const ageBand = d => (d <= 1 ? '0-1 days' : d <= 3 ? '2-3 days' : '4+ days');
const priority = d => (d > 3 ? 3 : d > 1 ? 2 : 1);   // 3 Critical, 2 High, 1 Normal

const ORDERS = `
  SELECT o.id, o.order_id, o.order_date, o.status,
         i.payment_status, i.shipped_error,
         sh.status AS ship_status, sh.tracking_number, sh.courier,
         mp.name AS marketplace, w.warehouse_name AS warehouse,
         sa.city, sa.region, sa.postcode,
         (CURRENT_DATE - o.order_date::date) AS days
  FROM order_management.orders o
  JOIN order_management.order_info i ON i.order_id = o.id
  -- ONE shipment per order. An order can carry several shipment rows — a cancelled
  -- label and its replacement — and a plain LEFT JOIN turns that into duplicate
  -- order rows. A live label beats a cancelled one; the most recent wins after that.
  LEFT JOIN LATERAL (
    SELECT s2.status, s2.tracking_number, cs.name AS courier
    FROM order_management.shipment s2
    LEFT JOIN order_management.carrier_service cs ON cs.id = s2.carrier_service_id
    WHERE s2.order_id = o.id
    ORDER BY (s2.status = 'Cancelled'), s2.shipment_created_at DESC NULLS LAST, s2.id DESC
    LIMIT 1) sh ON true
  LEFT JOIN order_management.market_place mp ON mp.id = NULLIF(o.market_place, '')::int
  LEFT JOIN inventory.warehouse w ON w.warehouse = o.warehouse_id::int
  LEFT JOIN customers.shipping_address sa ON sa.order_id = o.id
  WHERE o.status = ANY($1) AND COALESCE(i.shipped, 0) <> 1
  ORDER BY o.order_date`;

// The SKU list and the line count used to be correlated subqueries on the orders
// query, and stock a correlated subquery PER LINE — each one re-scanning
// inventory.products by upper(sku), which no index covers. Between them they took
// the endpoint to 17s and, under load, past the 120s statement timeout. The lines
// are already being read, so both order-level columns come from this result, and
// stock is looked up once for the SKUs actually on an open order.
const LINES = `
  SELECT li.order_id, upper(COALESCE(NULLIF(li.real_sku,''), li.item_sku)) AS sku,
         li.item_title AS title, li.item_quantity AS qty
  FROM order_management.order_item_info li
  JOIN order_management.orders o ON o.id = li.order_id
  JOIN order_management.order_info i ON i.order_id = o.id
  WHERE o.status = ANY($1) AND COALESCE(i.shipped, 0) <> 1
  ORDER BY li.order_id, li.id`;

const STOCK = `
  SELECT upper(p.sku) AS sku, sum(st.quantity) AS q
  FROM inventory.products p
  JOIN inventory.physical_product_stock st ON st.inventory = p.id
  WHERE upper(p.sku) = ANY($1)
  GROUP BY 1`;

export async function GET() {
  try {
    const out = await withClient(async q => {
      const orders = await q(ORDERS, [OPEN_STATUSES]);
      const lineRows = await q(LINES, [OPEN_STATUSES]);

      const skus = [...new Set(lineRows.map(r => r.sku).filter(Boolean))];
      const stock = new Map();
      if (skus.length) for (const r of await q(STOCK, [skus])) stock.set(r.sku, Number(r.q));

      const lines = {};
      for (const r of lineRows) {
        (lines[r.order_id] ||= []).push({
          s: r.sku || '', n: (r.title || '').replace(/\s+/g, ' ').trim(),
          q: Number(r.qty) || 0,
          k: stock.has(r.sku) ? stock.get(r.sku) : null,
        });
      }

      const rows = [];
      for (const r of orders) {
        const days = Number(r.days);
        if (!isFinite(days)) continue;
        // Dispatch Status in the requirement's own words. A label already exists
        // when the shipment row says New — that order waits on the courier, not
        // on packing.
        const dispatch = r.status === 'Hold' ? 'On Hold'
          : r.ship_status === 'New' ? 'Awaiting Courier Collection'
          : r.status === 'Inprogress' ? 'Processing'
          : 'Not Dispatched';
        const li = lines[r.id] || [];
        rows.push({
          o: r.order_id,
          date: r.order_date ? new Date(r.order_date).toISOString().slice(0, 10) : null,
          k: [...new Set(li.map(x => x.s).filter(Boolean))].join(', '),
          l: li.length,
          p: (r.payment_status || '').trim(),      // '' renders as "-", never invented
          s: dispatch, dy: days, pr: priority(days), band: ageBand(days),
          b: days > SLA_DAYS ? 1 : 0,
          e: (r.shipped_error || '').trim(),
          t: (r.tracking_number || '').trim(),
          m: (r.marketplace || '').trim(),
          w: (r.warehouse || '').trim(),
          // country_id has NO lookup table anywhere in the database, so a country
          // NAME cannot be resolved without inventing one. City and postcode are
          // real text and say the same thing to a packer.
          c: [(r.city || '').trim(), (r.postcode || '').trim()].filter(Boolean).join(', '),
          rg: (r.region || '').trim(),
          cr: (r.courier || '').trim(),
          li,
        });
      }
      // longest wait first — the order closest to breaching is the one to pack next
      rows.sort((a, b) => b.dy - a.dy || String(a.o).localeCompare(String(b.o)));
      return rows;
    });

    return Response.json({
      ok: true, asOf: new Date().toISOString(), sla: SLA_DAYS,
      count: out.length,
      breached: out.filter(r => r.b).length,
      bands: out.reduce((a, r) => ((a[r.band] = (a[r.band] || 0) + 1), a), {}),
      rows: out,
    });
  } catch (e) {
    console.error('[api/pending-dispatch]', e.message);
    return Response.json({ ok: false, error: 'Pending dispatch query failed. See server log.' }, { status: 500 });
  }
}
