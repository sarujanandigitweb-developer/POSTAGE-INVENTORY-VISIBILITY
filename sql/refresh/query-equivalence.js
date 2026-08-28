'use strict';
// QUERY EQUIVALENCE — the test that separates "the data moved" from "the new query is
// wrong". Read-only, writes nothing.
//
// Corroborating stock against product_history does not work: routine order picking is
// never logged there, only manual recounts and supply receipts. CL3TBM's newest history
// line reads Unit3 1818 -> 618 while the dashboard holds 400 and the database holds 264
// — the log simply does not record the movements in between.
//
// So instead: run the OLD query form and the NEW query form against the SAME database at
// the SAME moment and diff the results.
//
//   any difference   -> the new query is wrong. It cannot ship.
//   no difference    -> the queries agree, so every difference against the dashboard is
//                       real drift in the data since it was extracted.
//
//   node sql/refresh/query-equivalence.js
const fs = require('fs');
const path = require('path');
const { load } = require('./rules.js');
const { connect, q } = require('./db.js');

const ROOT = path.resolve(__dirname, '..', '..');
const R = load();
const OLD = [].concat(...Object.keys(R.CATS).map(k => R.CATS[k].data));
const SKUS = OLD.map(r => r.s);

const pct = (a, b) => b === 0 ? '100.00' : (100 * a / b).toFixed(4);
// The price pair is EXPECTED to differ: the old form took the cheapest UK listing, the
// new one takes LEDSone first. Every other pair must agree exactly, and a difference
// there is a query fault that must stop the refresh.
const EXPECTED_TO_DIFFER = ['exact-SKU UK prices'];
let failures = 0, expected = 0;
function verdict(name, n, same){
  const ok = n === same;
  if (!ok){ EXPECTED_TO_DIFFER.indexOf(name) !== -1 ? expected++ : failures++; }
  console.log('  ' + (ok ? 'IDENTICAL' : '*** DIFFERS') + '  ' + name +
              '  ' + same.toLocaleString() + '/' + n.toLocaleString() +
              ' (' + pct(same, n) + '%)');
}

(async () => {
  const c = await connect();

  // ============ A. STOCK ====================================================
  // OLD: a correlated sub-select per warehouse, keyed on products.id  (the shape used by
  //      _archive/extraction-queries/other-categories-extraction-query.sql)
  // NEW: one set-returning read of the whole table, joined in JS
  console.log('=== A. stock: correlated sub-selects vs a single read ===');
  const oldStock = await q(c, `
    WITH prod AS (
      SELECT DISTINCT ON (upper(pr.sku)) upper(pr.sku) AS sku, pr.id AS pid
      FROM inventory.products pr WHERE upper(pr.sku) = ANY($1) ORDER BY upper(pr.sku)),
    st AS (SELECT inventory, warehouse, quantity FROM inventory.physical_product_stock)
    SELECT prod.sku,
      (SELECT quantity FROM st WHERE inventory=prod.pid AND warehouse=1)  AS a,
      (SELECT quantity FROM st WHERE inventory=prod.pid AND warehouse=8)  AS b,
      (SELECT quantity FROM st WHERE inventory=prod.pid AND warehouse=6)  AS c,
      (SELECT quantity FROM st WHERE inventory=prod.pid AND warehouse=33) AS u5,
      (SELECT quantity FROM st WHERE inventory=prod.pid AND warehouse=10) AS k,
      (SELECT quantity FROM st WHERE inventory=prod.pid AND warehouse=7)  AS m,
      (SELECT quantity FROM st WHERE inventory=prod.pid AND warehouse=4)  AS ca,
      (SELECT quantity FROM st WHERE inventory=prod.pid AND warehouse=32) AS us
    FROM prod`, [SKUS]);

  const newRows = await q(c, `
    SELECT DISTINCT ON (upper(pr.sku)) upper(pr.sku) AS sku, pr.id AS pid
    FROM inventory.products pr WHERE upper(pr.sku) = ANY($1) ORDER BY upper(pr.sku)`, [SKUS]);
  const idOf = {}; newRows.forEach(r => { idOf[r.sku] = r.pid; });
  const flat = {};
  const ids = newRows.map(r => r.pid);
  for (let i = 0; i < ids.length; i += 4000){
    (await q(c, `SELECT inventory, warehouse, quantity FROM inventory.physical_product_stock
                 WHERE inventory = ANY($1)`, [ids.slice(i, i + 4000)]))
      .forEach(r => { (flat[r.inventory] = flat[r.inventory] || {})[r.warehouse] = Number(r.quantity); });
  }
  const COL = { a:1, b:8, c:6, u5:33, k:10, m:7, ca:4, us:32 };
  let cells = 0, cellSame = 0; const cellBad = [];
  oldStock.forEach(o => {
    const st = flat[idOf[o.sku]] || {};
    Object.keys(COL).forEach(col => {
      cells++;
      const ov = o[col] === null ? null : Number(o[col]);
      const nv = st[COL[col]] === undefined ? null : st[COL[col]];
      if (ov === nv) cellSame++; else cellBad.push([o.sku, col, ov, nv]);
    });
  });
  verdict('stock cells', cells, cellSame);
  cellBad.slice(0, 8).forEach(b => console.log('        ' + b.join('  ')));

  // ============ B. SHOPIFY PRICE ===========================================
  // OLD: min(price) per SKU restricted to site='UK'
  // NEW: min(price) per SKU per CHANNEL, LEDSone first, UK channels only
  console.log('\n=== B. Shopify price: site=UK vs channel priority ===');
  const oldPx = await q(c, `
    SELECT upper(COALESCE(NULLIF(mapped_sku,''),sku)) AS sku, min(price) AS p
    FROM listings.shopify_listings
    WHERE COALESCE(wrong_sku,0)=0 AND all_list=1 AND price>0 AND site='UK'
      AND upper(COALESCE(NULLIF(mapped_sku,''),sku)) = ANY($1)
    GROUP BY 1`, [SKUS]);
  const newPx = await q(c, `
    WITH ch(name, ord) AS (VALUES ('LEDSone',1),('Electricalsone',2),('Vintagelite',3),
                                  ('BesBet',4),('Dcvoltage',5),('dcvoltage',5)),
    d AS (SELECT upper(COALESCE(NULLIF(l.mapped_sku,''),l.sku)) AS sku, ch.ord, min(l.price) AS p
          FROM listings.shopify_listings l JOIN ch ON ch.name = l.channel
          WHERE COALESCE(l.wrong_sku,0)=0 AND l.all_list=1 AND l.price>0
            AND upper(COALESCE(NULLIF(l.mapped_sku,''),l.sku)) = ANY($1)
          GROUP BY 1,2)
    SELECT DISTINCT ON (sku) sku, p FROM d ORDER BY sku, ord`, [SKUS]);
  const oldP = {}; oldPx.forEach(r => { oldP[r.sku] = Number(r.p); });
  const newP = {}; newPx.forEach(r => { newP[r.sku] = Number(r.p); });
  const allP = [...new Set(Object.keys(oldP).concat(Object.keys(newP)))];
  let pSame = 0; const pBad = [];
  allP.forEach(s => {
    const o = oldP[s] === undefined ? null : oldP[s];
    const n = newP[s] === undefined ? null : newP[s];
    if (o === n) pSame++; else pBad.push([s, o, n]);
  });
  verdict('exact-SKU UK prices', allP.length, pSame);
  console.log('    NOTE: a difference here is EXPECTED and intended — the old form took the');
  console.log('    cheapest UK listing, the new one takes LEDSone first. Sampling those:');
  pBad.slice(0, 6).forEach(b => console.log('        ' + b[0].padEnd(16) + 'cheapest ' +
    String(b[1]).padEnd(9) + 'LEDSone-first ' + b[2]));
  console.log('    prices that MOVED because of the channel rule:', pBad.length,
              '(' + pct(pBad.length, allP.length) + '%)');

  // is the NEW price always a real listing for that SKU? that is the safety question
  const bad = pBad.filter(b => b[2] === null && b[1] !== null);
  console.log('    SKUs that LOSE a price under the new rule:', bad.length,
              bad.length ? '(listed only outside the UK channels)' : '');

  // ============ C. CONTAINER ===============================================
  console.log('\n=== C. arrived containers: same join, two shapes ===');
  const oldC = await q(c, `
    SELECT count(*) n FROM (SELECT DISTINCT upper(oi.sku) sku,
      COALESCE(fc.name, cc.name) nm, o.order_date
      FROM suppliers.order_items oi
      JOIN suppliers.orders o ON o.id = oi.order_id
      LEFT JOIN suppliers.final_containers fc ON fc.id = oi.final_container_id
      LEFT JOIN suppliers.containers cc ON cc.id = oi.assigned_container_id
      WHERE o.status_arrived AND COALESCE(fc.name, cc.name) IS NOT NULL
        AND upper(trim(COALESCE(fc.name, cc.name))) <> 'UNASSIGN') z`);
  const newC = await q(c, `
    SELECT count(*) n FROM (SELECT DISTINCT upper(oi.sku) sku,
      COALESCE(fc.name, cc.name) nm, o.order_date
      FROM suppliers.order_items oi
      JOIN suppliers.orders o ON o.id = oi.order_id
      LEFT JOIN suppliers.final_containers fc ON fc.id = oi.final_container_id
      LEFT JOIN suppliers.containers cc ON cc.id = oi.assigned_container_id
      WHERE o.status_arrived AND COALESCE(fc.name, cc.name) IS NOT NULL
        AND upper(trim(COALESCE(fc.name, cc.name))) NOT IN ('UNASSIGN','UNASSIGNED','N/A','-')
        AND o.order_date IS NOT NULL) z`);
  console.log('  old form rows:', Number(oldC[0].n).toLocaleString());
  console.log('  new form rows:', Number(newC[0].n).toLocaleString(),
              '(the new form also drops NULL order_date and the other placeholder names)');
  verdict('container rows', Number(oldC[0].n), Number(newC[0].n));

  await c.end();

  console.log('\n=== VERDICT ===');
  if (failures === 0){
    console.log('  Every query pair agrees' +
      (expected ? ' (' + expected + ' intended difference: the LEDSone channel rule)' : '') +
      '. Differences against the dashboard are REAL DRIFT.');
    console.log('  QUERY-EQUIVALENCE: PASS');
  } else {
    console.log('  ' + failures + ' UNEXPECTED pair(s) differ — this is a query fault.');
    console.log('  QUERY-EQUIVALENCE: FAIL');
    process.exitCode = 1;
  }
})().catch(e => { console.error(String(e.message)); process.exit(1); });
