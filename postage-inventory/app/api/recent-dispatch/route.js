import { withClient } from '@/lib/db';
import { ymd, hoursBetween } from '@/lib/dates';

// RECENTLY DISPATCHED — orders the Postage Team FINISHED in the last 3 days.
// The exact complement of the Dispatch Queue: that tab is the queue, this is the output.
// SQL ported from ../sql/refresh/extract/recent-dispatch.js, which carries the reasoning
// in full. The three decisions that matter:
//
//   * WHEN WAS IT COMPLETED? `orders.status = 'Completed'` carries no timestamp of its
//     own, and the obvious candidates each miss ~18% of rows. That gap is not random —
//     it is Amazon PRIME and WAYFAIR, which ship the parcel themselves, so this system
//     never creates a label. Completion is read in three tiers:
//         1 order_info.shipped_time        the real dispatch moment
//         2 shipment.shipment_created_at   when the label was made
//         3 shipment.updated_at            audit fallback, for marketplace-shipped
//     Tier 3 is safe: where tiers 1 and 3 both exist they agree within 24h on 99.8% of
//     orders. With all three, every completion in the last 30 days is dated.
//
//   * MARKETPLACE IS NOT `orders.market_place`. That column is a COUNTRY id (its lookup
//     lists Australia, Germany, UK...). The sales CHANNEL is sub_source -> source.
//
//   * DISPATCH STATUS is the carrier's own word from shipment_tracking_log, falling back
//     to what the shipment itself proves. Nothing is inferred from the order status.
export const dynamic = 'force-dynamic';

const WINDOW_DAYS = 3;
// Completions never reach back far: the oldest ORDER completed in the last 3 days was
// placed 20 days ago. 90 days is a generous guard that keeps the scan bounded.
const LOOKBACK_DAYS = 90;

// source.source_name is upper case and abbreviated. SHOPIFY is the LEDSone website.
const CHANNEL = {
  AMAZON: 'Amazon', EBAY: 'eBay', SHOPIFY: 'Website', ETSY: 'Etsy', ONBUY: 'OnBuy',
  WAYFAIR: 'Wayfair', AVASAM: 'Avasam', MANOMANO: 'ManoMano', MANUALORDER: 'Manual Order',
  RESEND: 'Resend', REPLACEMENT: 'Replacement', BOL: 'Bol', 'MANUAL OM': 'Manual OM',
  FAIRE: 'Faire', WOO: 'Woo', 'B&Q': 'B&Q', TEMU: 'Temu',
};
// order_info.shipping_method — the service level the requirement calls Priority.
const SERVICE = {
  prime: 'Prime', firstclass: 'First Class', international: 'International',
  wayfair: 'Wayfair', secondday: 'Second Day', 'collection order': 'Collection',
};
const titled = (map, v) => {
  const s = (v || '').trim();
  if (!s) return '';
  return map[s] || map[s.toUpperCase()] || map[s.toLowerCase()] || s;
};

const ORDERS = `
  WITH base AS (
    SELECT o.id, o.order_id, o.order_date,
           i.shipping_method, i.shipped_time,
           sh.shipment_created_at, sh.updated_at AS sh_updated,
           NULLIF(sh.tracking_number, '') AS trk, sh.courier,
           src.source_name AS channel,
           w.warehouse_name AS warehouse,
           sa.city, sa.region, sa.postcode
    FROM order_management.orders o
    JOIN order_management.order_info i ON i.order_id = o.id
    -- ONE shipment per order, as on the queue. An order can carry a cancelled label and
    -- its replacement; a plain LEFT JOIN would duplicate the order row.
    LEFT JOIN LATERAL (
      SELECT s2.shipment_created_at, s2.updated_at, s2.tracking_number, cs.name AS courier
      FROM order_management.shipment s2
      LEFT JOIN order_management.carrier_service cs ON cs.id = s2.carrier_service_id
      WHERE s2.order_id = o.id
      ORDER BY (s2.status = 'Cancelled'), s2.shipment_created_at DESC NULLS LAST, s2.id DESC
      LIMIT 1) sh ON true
    LEFT JOIN order_management.sub_source ss ON ss.id = o.sub_source_id
    LEFT JOIN order_management.source src ON src.id = ss.source_id
    LEFT JOIN inventory.warehouse w ON w.warehouse = o.warehouse_id::int
    LEFT JOIN customers.shipping_address sa ON sa.order_id = o.id
    WHERE o.status = 'Completed' AND o.order_date >= CURRENT_DATE - $2::int
  ), dated AS (
    SELECT *, COALESCE(shipped_time, shipment_created_at, sh_updated) AS done_at FROM base
  )
  SELECT d.*, tl.status AS track_status, tl.last_event_desc
  FROM dated d
  LEFT JOIN order_management.shipment_tracking_log tl ON tl.tracking_number = d.trk
  WHERE d.done_at >= CURRENT_DATE - $1::int
  ORDER BY d.done_at DESC`;

// Lines and stock are read the same way the queue reads them: one query each, never a
// correlated subquery per line. The pipeline's per-line stock lookup re-scans
// inventory.products by upper(sku), which no index covers — it took that extract to 91s.
const LINES = `
  SELECT li.order_id, upper(COALESCE(NULLIF(li.real_sku,''), li.item_sku)) AS sku,
         li.item_title AS title, li.item_quantity AS qty
  FROM order_management.order_item_info li
  WHERE li.order_id = ANY($1)
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
      const orders = await q(ORDERS, [WINDOW_DAYS, LOOKBACK_DAYS]);
      const ids = orders.map(r => r.id);
      const lineRows = ids.length ? await q(LINES, [ids]) : [];

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

      const today = new Date();
      const rows = [];
      for (const r of orders) {
        const hours = hoursBetween(r.order_date, r.done_at);
        if (hours === null) continue;

        // The carrier's own status wins. Where the carrier has not reported, the
        // shipment still proves what happened: a tracking number means a label exists;
        // no tracking on a completed order means a marketplace shipped it themselves.
        const status = (r.track_status || '').trim() ||
                       (r.trk ? 'Label Created' : 'Dispatched - No Tracking');
        const li = lines[r.id] || [];
        const done = ymd(r.done_at);
        const ago = Math.round(
          (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
           Date.parse(done + 'T00:00:00Z')) / 86400000);

        rows.push({
          o: r.order_id,
          date: ymd(r.order_date),
          x: done,
          band: ago <= 0 ? 'Today' : ago === 1 ? 'Yesterday' : 'Earlier',
          th: hours,
          k: [...new Set(li.map(x => x.s).filter(Boolean))].join(', '),
          l: li.length,
          m: titled(CHANNEL, r.channel),
          s: status,
          pr: titled(SERVICE, r.shipping_method),
          t: (r.trk || '').trim(),
          cr: (r.courier || '').trim(),
          w: (r.warehouse || '').trim(),
          // country_id has NO lookup table anywhere in the database, so a country NAME
          // cannot be resolved without inventing one. City and postcode are real text.
          c: [(r.city || '').trim(), (r.postcode || '').trim()].filter(Boolean).join(', '),
          rg: (r.region || '').trim(),
          ev: (r.last_event_desc || '').replace(/\s+/g, ' ').trim().slice(0, 160),
          li,
        });
      }
      // most recently dispatched first — the newest work the team has done
      rows.sort((a, b) => (a.x < b.x ? 1 : a.x > b.x ? -1 : 0) || a.th - b.th ||
                          String(a.o).localeCompare(String(b.o)));
      return rows;
    });

    return Response.json({
      ok: true, asOf: new Date().toISOString(), days: WINDOW_DAYS,
      count: out.length,
      sameDay: out.filter(r => r.th <= 24).length,
      bands: out.reduce((a, r) => ((a[r.band] = (a[r.band] || 0) + 1), a), {}),
      warehouses: [...new Set(out.map(r => r.w).filter(Boolean))].sort(),
      markets: [...new Set(out.map(r => r.m).filter(Boolean))].sort(),
      states: [...new Set(out.map(r => r.s).filter(Boolean))].sort(),
      rows: out,
    });
  } catch (e) {
    console.error('[api/recent-dispatch]', e.message);
    return Response.json({ ok: false, error: 'Recent dispatch query failed. See server log.' }, { status: 500 });
  }
}
