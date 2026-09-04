import { withClient } from '@/lib/db';
import { getOrBuild, builtAt } from '@/lib/dataset';

// CONTAINER DETAILS — upcoming and received containers, and what came on each.
// SQL lifted verbatim from ../sql/refresh/extract/container-details.js so this app
// and the published HTML dashboard cannot drift apart.
//
// A CONTAINER IS NOT SIMPLY ARRIVED OR NOT. status_arrived sits on the supplier
// ORDER, and a container carries up to 23 orders from 18 suppliers — seven of them
// currently hold a mix. Calling such a container "Received" would tell a picker
// stock is on the shelf when part of it is still at sea, so the status is derived:
//   every order arrived -> Received · none -> Upcoming · a mix -> Part received
//
// NO GOODS-RECEIPT DATE EXISTS. Arrival is only a boolean, so the date shown is the
// ORDER date, labelled as such. Nothing is guessed.
export const dynamic = 'force-dynamic';

const NOT_A_CONTAINER = "('UNASSIGN','UNASSIGNED','N/A','-')";

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
const NAMES = `
  SELECT DISTINCT ON (upper(sku)) upper(sku) AS sku,
         NULLIF(regexp_replace(trim(COALESCE(title,'')), '\\s+', ' ', 'g'), '') AS title
    FROM inventory.products WHERE sku IS NOT NULL AND sku <> '' ORDER BY upper(sku), id`;

// The lifted SQL interpolates this — the Unassign placeholder in
// suppliers.final_containers is not a container, it means "none assigned".
const PLACEHOLDER = 'Combo Default Title.';
const num = v => (v === null || v === undefined ? 0 : Number(v));

async function build() {
  return withClient(async q => {
    const lines = await q(LINES);
    const names = {};
    for (const r of await q(NAMES)) if (r.title && r.title !== PLACEHOLDER) names[r.sku] = r.title;

    const box = new Map();
    for (const r of lines) {
      let c = box.get(r.cname);
      if (!c) {
        c = { n: r.cname, rg: r.region || '', ty: r.ctype || '',
              orders: new Set(), suppliers: new Set(), arrivedOrders: new Set(), openOrders: new Set(),
              stages: {}, first: null, last: null, exp: null, items: new Map() };
        box.set(r.cname, c);
      }
      c.orders.add(r.order_pk);
      (r.arrived ? c.arrivedOrders : c.openOrders).add(r.order_pk);
      if (r.supplier) c.suppliers.add(r.supplier);
      c.stages[r.stage] = (c.stages[r.stage] || 0) + 1;
      if (r.ordered) {
        if (!c.first || r.ordered < c.first) c.first = r.ordered;
        if (!c.last || r.ordered > c.last) c.last = r.ordered;
      }
      if (r.expected && (!c.exp || r.expected > c.exp)) c.exp = r.expected;

      // A SKU can appear on several lines of one container — different colours ship
      // as separate lines. They are one product arriving, so the quantities add.
      let it = c.items.get(r.sku);
      if (!it) { it = { s: r.sku, pcs: 0, ctns: 0, cbm: 0, cp: 0, d: null, sup: new Set(), st: new Set() };
                 c.items.set(r.sku, it); }
      it.pcs += num(r.pcs); it.ctns += num(r.ctns); it.cbm += num(r.cbm);
      it.cp = Math.max(it.cp, num(r.ctn_pcs));
      if (!it.d) it.d = names[r.sku] || r.descr || null;
      if (r.supplier) it.sup.add(r.supplier);
      it.st.add(r.stage);
    }

    const order = ['Ordered', 'Confirmed', 'Production done', 'Shipped', 'Arrived'];
    const rows = [...box.values()].map(c => {
      const arrived = c.arrivedOrders.size, open = c.openOrders.size;
      const status = open === 0 ? 'Received' : arrived === 0 ? 'Upcoming' : 'Part received';
      const stage = order.filter(s => c.stages[s]).slice(-1)[0] || '';
      const items = [...c.items.values()]
        .sort((a, b) => b.pcs - a.pcs || a.s.localeCompare(b.s))
        .map(i => ({ s: i.s, d: i.d, q: i.pcs, c: i.ctns, cp: i.cp,
                     v: Math.round(i.cbm * 100) / 100,
                     sp: [...i.sup].sort().join(', '), st: [...i.st].sort().join(', ') }));
      return {
        n: c.n, rg: c.rg, ty: c.ty, st: status, sg: stage,
        o: c.orders.size, ar: arrived, op: open,
        sp: [...c.suppliers].sort(), k: items.length,
        q: items.reduce((n, i) => n + i.q, 0),
        c: items.reduce((n, i) => n + i.c, 0),
        v: Math.round(items.reduce((n, i) => n + i.v, 0) * 10) / 10,
        d1: c.first, d2: c.last, ex: c.exp, it: items,
      };
    });
    // newest first — the container a reader cares about is the one just ordered or
    // just landed, not the oldest in the archive
    rows.sort((a, b) => String(b.d2 || '').localeCompare(String(a.d2 || '')) || a.n.localeCompare(b.n));
    return rows;
  });
}

export async function GET(request) {
  try {
    const sp = new URL(request.url).searchParams;
    const all = await getOrBuild('container-details', build);

    const q = (sp.get('q') || '').trim().toLowerCase();
    const st = sp.get('status') || '';
    const rg = sp.get('region') || '';
    const sg = sp.get('stage') || '';
    let rows = all;
    if (st) rows = rows.filter(r => r.st === st);
    if (rg) rows = rows.filter(r => (r.rg || '') === rg);
    if (sg) rows = rows.filter(r => (r.sg || '') === sg);
    if (q) {
      const t = q.split(/\s+/).filter(Boolean);
      rows = rows.filter(r => {
        const hay = (r.n + ' ' + r.sp.join(' ') + ' ' +
                     r.it.map(i => i.s + ' ' + (i.d || '')).join(' ')).toLowerCase();
        return t.every(x => hay.includes(x));
      });
    }
    const sort = sp.get('sort') || 'date';
    if (sort === 'pcs') rows = [...rows].sort((a, b) => b.q - a.q);
    else if (sort === 'skus') rows = [...rows].sort((a, b) => b.k - a.k);
    else if (sort === 'cbm') rows = [...rows].sort((a, b) => b.v - a.v);
    else if (sort === 'name') rows = [...rows].sort((a, b) => a.n.localeCompare(b.n));

    const count = s => all.filter(r => r.st === s).length;
    return Response.json({
      ok: true, builtAt: builtAt('container-details'),
      total: all.length,
      counts: { Upcoming: count('Upcoming'), 'Part received': count('Part received'),
                Received: count('Received') },
      regions: [...new Set(all.map(r => r.rg).filter(Boolean))].sort(),
      stages: [...new Set(all.map(r => r.sg).filter(Boolean))].sort(),
      pieces: all.reduce((n, r) => n + r.q, 0),
      cbm: Math.round(all.reduce((n, r) => n + r.v, 0) * 10) / 10,
      rows,
    });
  } catch (e) {
    console.error('[api/container-details]', e.message);
    return Response.json({ ok: false, error: 'Container details query failed. See server log.' }, { status: 500 });
  }
}

// The snapshot builder, for scripts/build-snapshots.mjs. Same function the route
// uses, so a snapshot and a live read can never be shaped differently.
export const buildSnapshot = build;
