'use strict';
// CONTAINER DETAILS — upcoming and received containers, and what stock came on each.
//
// The dashboard already names the container a SKU last arrived on. This is the
// other direction: open a container and see its whole manifest with quantities,
// or look ahead at what is still on the water.
//
// A CONTAINER IS NOT SIMPLY ARRIVED OR NOT. `status_arrived` sits on the supplier
// ORDER, and a container carries up to 23 orders from 18 different suppliers —
// seven of them currently hold a mix of arrived and not-arrived orders. Calling
// such a container "Received" would tell a picker that stock is on the shelf when
// part of it is still at sea, so the status is derived per container:
//     every order arrived  -> Received
//     no order arrived     -> Upcoming
//     some of each         -> Part received      (and both counts are shown)
//
// NO GOODS-RECEIPT DATE EXISTS. suppliers.orders carries order_date (placed),
// confirmed_date, finished_date and expected_completion_date — arrival is only a
// boolean. "When did it land" cannot be answered from this database, so the date
// shown is the ORDER date, labelled as ordered, and the arrival date is marked
// unavailable rather than guessed. Same treatment the Inventory tab already uses.
//
// Rules carried over from containers.js unchanged:
//   * the Unassign placeholder and its variants are not containers
//   * DE and GERMAN are the same region
const { q } = require('../db.js');

const NOT_A_CONTAINER = "('UNASSIGN','UNASSIGNED','N/A','-')";

// One row per container line. Quantities live on the line: `pcs` is pieces,
// `ctns` cartons, `ctn_pcs` pieces per carton, `total_cbm` the line's volume.
const LINES = `
  SELECT COALESCE(fc.name, cc.name)                       AS cname,
         CASE WHEN COALESCE(fc.main_container, cc.main_container) IN ('DE','GERMAN') THEN 'DE'
              ELSE COALESCE(fc.main_container, cc.main_container) END AS region,
         COALESCE(fc.type, '')                            AS ctype,
         o.id            AS order_pk,
         o.order_id      AS order_ref,
         o.order_date::text AS ordered,
         o.expected_completion_date::text AS expected,
         o.status_arrived AS arrived,
         CASE WHEN o.status_arrived               THEN 'Arrived'
              WHEN o.status_shipped               THEN 'Shipped'
              WHEN o.status_finished_production   THEN 'Production done'
              WHEN o.status_confirmed             THEN 'Confirmed'
              ELSE 'Ordered' END                  AS stage,
         s.name          AS supplier,
         upper(oi.sku)   AS sku,
         NULLIF(regexp_replace(trim(COALESCE(oi.english_description,'')), '\\s+', ' ', 'g'), '') AS descr,
         COALESCE(oi.pcs, 0)::bigint      AS pcs,
         COALESCE(oi.ctns, 0)::bigint     AS ctns,
         COALESCE(oi.ctn_pcs, 0)::bigint  AS ctn_pcs,
         COALESCE(oi.total_cbm, 0)::numeric AS cbm
    FROM suppliers.order_items oi
    JOIN suppliers.orders o ON o.id = oi.order_id
    LEFT JOIN suppliers.suppliers s ON s.id = o.supplier_id
    LEFT JOIN suppliers.final_containers fc ON fc.id = oi.final_container_id
    LEFT JOIN suppliers.containers      cc ON cc.id = oi.assigned_container_id
   WHERE COALESCE(fc.name, cc.name) IS NOT NULL
     AND upper(trim(COALESCE(fc.name, cc.name))) NOT IN ${NOT_A_CONTAINER}
     AND oi.sku IS NOT NULL AND trim(oi.sku) <> ''`;

// Product names for the manifest. 53 of the 1,610 container SKUs have no row in
// inventory.products at all — those keep the supplier's own english_description
// and are counted, never invented.
const NAMES = `
  SELECT DISTINCT ON (upper(sku)) upper(sku) AS sku,
         NULLIF(regexp_replace(trim(COALESCE(title,'')), '\\s+', ' ', 'g'), '') AS title
    FROM inventory.products WHERE sku IS NOT NULL AND sku <> '' ORDER BY upper(sku), id`;

const PLACEHOLDER = 'Combo Default Title.';
const num = v => (v === null || v === undefined ? 0 : Number(v));

async function extract(client){
  const lines = await q(client, LINES);
  const names = {};
  (await q(client, NAMES)).forEach(r => {
    if (r.title && r.title !== PLACEHOLDER) names[r.sku] = r.title;
  });

  const box = {};                       // container name -> aggregate
  lines.forEach(r => {
    const c = box[r.cname] || (box[r.cname] = {
      n: r.cname, rg: r.region || '', ty: r.ctype || '',
      orders: new Set(), suppliers: new Set(), arrivedOrders: new Set(), openOrders: new Set(),
      stages: {}, first: null, last: null, exp: null,
      items: new Map()                  // sku -> line totals
    });
    c.orders.add(r.order_pk);
    (r.arrived ? c.arrivedOrders : c.openOrders).add(r.order_pk);
    if (r.supplier) c.suppliers.add(r.supplier);
    c.stages[r.stage] = (c.stages[r.stage] || 0) + 1;
    if (r.ordered){ if (!c.first || r.ordered < c.first) c.first = r.ordered;
                    if (!c.last  || r.ordered > c.last)  c.last  = r.ordered; }
    if (r.expected && (!c.exp || r.expected > c.exp)) c.exp = r.expected;

    // A SKU can appear on several lines of one container — different colours ship
    // as separate lines. They are one product arriving, so the quantities add.
    const it = c.items.get(r.sku) || { s: r.sku, pcs: 0, ctns: 0, cbm: 0, cp: 0,
                                       d: null, sup: new Set(), st: new Set() };
    it.pcs  += num(r.pcs);
    it.ctns += num(r.ctns);
    it.cbm  += num(r.cbm);
    it.cp    = Math.max(it.cp, num(r.ctn_pcs));
    if (!it.d) it.d = names[r.sku] || r.descr || null;
    if (r.supplier) it.sup.add(r.supplier);
    it.st.add(r.stage);
    c.items.set(r.sku, it);
  });

  const stats = { containers: 0, received: 0, upcoming: 0, partial: 0,
                  lines: lines.length, skus: 0, pcs: 0, ctns: 0, cbm: 0,
                  unknownSku: 0, noRegion: 0 };

  const rows = Object.values(box).map(c => {
    const arrived = c.arrivedOrders.size, open = c.openOrders.size;
    const status = open === 0 ? 'Received' : arrived === 0 ? 'Upcoming' : 'Part received';
    // the furthest-along stage still outstanding is what a reader acts on
    const order = ['Ordered', 'Confirmed', 'Production done', 'Shipped', 'Arrived'];
    const stage = order.filter(s => c.stages[s]).slice(-1)[0] || '';

    const items = [...c.items.values()]
      .sort((a, b) => b.pcs - a.pcs || a.s.localeCompare(b.s))
      .map(i => ({ s: i.s, d: i.d, q: i.pcs, c: i.ctns, cp: i.cp,
                   v: Math.round(i.cbm * 100) / 100,
                   sp: [...i.sup].sort().join(', '),
                   st: [...i.st].sort().join(', ') }));

    stats.containers++;
    if (status === 'Received') stats.received++;
    else if (status === 'Upcoming') stats.upcoming++;
    else stats.partial++;
    stats.skus += items.length;
    stats.pcs  += items.reduce((n, i) => n + i.q, 0);
    stats.ctns += items.reduce((n, i) => n + i.c, 0);
    stats.cbm  += items.reduce((n, i) => n + i.v, 0);
    if (!c.rg) stats.noRegion++;
    items.forEach(i => { if (!names[i.s]) stats.unknownSku++; });

    return {
      n: c.n, rg: c.rg, ty: c.ty, st: status, sg: stage,
      o: c.orders.size, ar: arrived, op: open,
      sp: [...c.suppliers].sort(),
      k: items.length,
      q: items.reduce((n, i) => n + i.q, 0),
      c: items.reduce((n, i) => n + i.c, 0),
      v: Math.round(items.reduce((n, i) => n + i.v, 0) * 10) / 10,
      d1: c.first, d2: c.last, ex: c.exp,
      it: items
    };
  });

  // newest first — the container a reader cares about is the one just ordered or
  // just landed, not the oldest one in the archive
  rows.sort((a, b) => String(b.last || b.d2 || '').localeCompare(String(a.d2 || '')) ||
                      a.n.localeCompare(b.n));

  stats.cbm = Math.round(stats.cbm * 10) / 10;
  return { payload: { r: rows }, stats };
}

module.exports = { extract, LINES, NAMES };
