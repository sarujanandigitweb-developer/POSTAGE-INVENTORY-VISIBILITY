'use strict';
// Arrived containers (for LAST_CONTAINER and for the Received match) and not-yet-arrived
// containers (for INCOMING). Pure read, deterministic.
//
// Rules preserved exactly as validated:
//   * only orders with status_arrived
//   * the Unassign placeholder and its variants are not containers
//   * "latest" is ORDER BY o.order_date DESC — never a text maximum of the name
//     ('Container 9' > 'Container 16' under a text maximum, wrong on 39% of pairs)
//   * order_date is when the order was PLACED. LEDSone records no goods-receipt date.
const { q } = require('../db.js');

const NOT_A_CONTAINER = "('UNASSIGN','UNASSIGNED','N/A','-')";

const ARRIVED = `
  SELECT DISTINCT upper(oi.sku) AS sku,
         CASE WHEN COALESCE(fc.main_container, cc.main_container) IN ('DE','GERMAN') THEN 'DE'
              ELSE COALESCE(fc.main_container, cc.main_container) END AS region,
         COALESCE(fc.name, cc.name) AS cname,
         o.order_date::text AS od,
         o.order_id
    FROM suppliers.order_items oi
    JOIN suppliers.orders o ON o.id = oi.order_id
    LEFT JOIN suppliers.final_containers fc ON fc.id = oi.final_container_id
    LEFT JOIN suppliers.containers      cc ON cc.id = oi.assigned_container_id
   WHERE o.status_arrived
     AND COALESCE(fc.name, cc.name) IS NOT NULL
     AND upper(trim(COALESCE(fc.name, cc.name))) NOT IN ${NOT_A_CONTAINER}
     AND o.order_date IS NOT NULL`;

const INCOMING = `
  SELECT DISTINCT upper(oi.sku) AS sku,
         COALESCE(fc.name, cc.name) AS cname,
         CASE WHEN o.status_shipped              THEN 'Shipped'
              WHEN o.status_finished_production  THEN 'Production done'
              WHEN o.status_confirmed            THEN 'Confirmed'
              ELSE 'Ordered' END AS stage
    FROM suppliers.order_items oi
    JOIN suppliers.orders o ON o.id = oi.order_id
    LEFT JOIN suppliers.final_containers fc ON fc.id = oi.final_container_id
    LEFT JOIN suppliers.containers      cc ON cc.id = oi.assigned_container_id
   WHERE NOT o.status_arrived
     AND COALESCE(fc.name, cc.name) IS NOT NULL
     AND upper(trim(COALESCE(fc.name, cc.name))) NOT IN ${NOT_A_CONTAINER}`;

async function extract(client){
  const arrived = await q(client, ARRIVED);
  const byRegion = {};                       // sku -> region -> [{od, name, order}]
  arrived.forEach(r => {
    if (r.region !== 'UK' && r.region !== 'DE') return;
    ((byRegion[r.sku] = byRegion[r.sku] || {})[r.region] =
      byRegion[r.sku][r.region] || []).push({ od: r.od, name: r.cname, order: r.order_id });
  });
  Object.keys(byRegion).forEach(s => Object.keys(byRegion[s]).forEach(rg =>
    byRegion[s][rg].sort((a, b) => a.od.localeCompare(b.od) || a.name.localeCompare(b.name))));

  const inc = await q(client, INCOMING);
  const incoming = {};                       // sku -> {name, stage}
  inc.forEach(r => { incoming[r.sku] = { name: r.cname, stage: r.stage }; });

  return { arrived, byRegion, incoming };
}

// LAST_CONTAINER shape: { n:[names], c:{ sku:{ UK:[nameIdx,count,date], DE:[...] } } }
function lastContainer(byRegion, skus){
  const names = [];
  const idx = n => { let i = names.indexOf(n); if (i < 0){ names.push(n); i = names.length - 1; } return i; };
  const c = {};
  skus.forEach(s => {
    const e = byRegion[s];
    if (!e) return;
    const out = {};
    ['UK', 'DE'].forEach(rg => {
      const list = e[rg];
      if (!list || !list.length) return;
      const latest = list[list.length - 1];              // ordered by order_date ASC
      out[rg] = [idx(latest.name), list.length, latest.od];
    });
    if (Object.keys(out).length) c[s] = out;
  });
  return { n: names, c };
}

module.exports = { extract, lastContainer, ARRIVED, INCOMING };
