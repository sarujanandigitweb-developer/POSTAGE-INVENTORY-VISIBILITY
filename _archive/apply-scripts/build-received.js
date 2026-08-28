'use strict';
// Received Warehouse + Received Date + Container, per SKU per region.
//
//   1  Read the SKU's history and keep only genuine RECEIPTS —
//      "Supply - SU#### loaded by … On <date>" and "German Supply - …".
//      A "UK stock changes … via inventory CSV" line is a recount, not a receipt.
//   2  The warehouse is the field that INCREASED on that line
//      (Quantity=Unit 3, unit1=Unit 18, unit3=Unit 4, unit5=Unit 5, german=Germany).
//   3  The date on that line is the Received Date.
//   4  The container is the latest ARRIVED container for that SKU, in the matching
//      country, ordered on or before the Received Date.
//
// STEP 4 IS DATE PROXIMITY, NOT A JOIN. The SU#### code in the history has no
// counterpart anywhere in suppliers — verified directly: 0 rows in orders.order_id,
// final_containers.name or containers.name contain it, and suppliers.order_item_logs
// carries no supply reference either. So the container is the best available signal,
// not a certainty, and the UI says so on hover.
//
//   SP=<scratchpad> TR=<tool-results dir> RID=<result id> node sql/build-received.js
const fs = require('fs');
const path = require('path');
const { parseLine } = require('./product-history-parser.js');

const ROOT = path.resolve(__dirname, '..');
const SP = process.env.SP;

// ---- 1-3. the latest genuine receipt, from the FULL history ------------------
// Not from the embedded record: that is capped at 12 movements per region, so a SKU
// with a busy recent history could have its receipt cut off the end.
const lines = JSON.parse(fs.readFileSync(path.join(SP, 'hist_lines_dash.json'), 'utf8'));
const latest = {};                       // sku -> region -> {wh, dt, cn}
lines.forEach(([sku, line]) => {
  parseLine(line).forEach(m => {
    if (m.ac !== 'Goods received') return;             // receipts only
    const rg = m.tl === 'German' ? 'DE' : 'UK';
    const cur = (latest[sku] = latest[sku] || {})[rg];
    const stamp = m.dt + ' ' + (m.tm || '');
    if (!cur || stamp > cur.stamp) latest[sku][rg] = { wh: m.tl, dt: m.dt, cn: m.cn, stamp };
  });
});

// ---- 4. arrived containers, for the date-proximity match ---------------------
const raw = JSON.parse(fs.readFileSync(path.join(process.env.TR,
  'mcp-claude_ai_Ledsone_postgres-execute_sql-' + process.env.RID + '.txt'), 'utf8'));
const cont = {};                          // sku -> region -> [{od, name, order}]
String(Object.values(raw.data.rows[0])[0]).split('\n').filter(Boolean).forEach(l => {
  const [sku, rg, od, name, order] = l.split('|');
  ((cont[sku] = cont[sku] || {})[rg] = cont[sku][rg] || []).push({ od, name, order });
});
Object.keys(cont).forEach(s => Object.keys(cont[s]).forEach(rg =>
  cont[s][rg].sort((a, b) => a.od.localeCompare(b.od))));

// ---- assemble ---------------------------------------------------------------
const names = [], orders = [], whs = [];
const idx = (t, v) => { const x = v || ''; let i = t.indexOf(x); if (i < 0){ t.push(x); i = t.length - 1; } return i; };
idx(names, ''); idx(orders, ''); idx(whs, '');

const dashSkus = fs.readFileSync(path.join(ROOT, 'sql', 'dashboard-skus.txt'), 'utf8')
  .split('\n').filter(Boolean).map(l => l.split('\t')[1]);

const out = {};
const tally = { uk: 0, de: 0, matched: 0, unmatched: 0, noReceipt: 0 };
dashSkus.forEach(sku => {
  const L = latest[sku];
  if (!L){ tally.noReceipt++; return; }
  const rec = {};
  ['UK', 'DE'].forEach(rg => {
    const r = L[rg];
    if (!r) return;
    rg === 'UK' ? tally.uk++ : tally.de++;
    // the latest arrived container ordered ON OR BEFORE the receipt date
    const list = (cont[sku] || {})[rg] || [];
    let pick = null;
    for (let i = 0; i < list.length; i++) if (list[i].od <= r.dt) pick = list[i];
    if (pick) tally.matched++; else tally.unmatched++;
    rec[rg] = [ idx(whs, r.wh), r.dt, idx(names, pick && pick.name),
                idx(orders, pick && pick.order), r.cn || '' ];
  });
  if (Object.keys(rec).length) out[sku] = rec;
});

const RECEIVED = { w: whs, n: names, o: orders, r: out };
fs.writeFileSync(path.join(ROOT, 'sql', 'received_data.json'), JSON.stringify(RECEIVED));

console.log('dashboard SKUs             :', dashSkus.length);
console.log('  with a UK receipt        :', tally.uk);
console.log('  with a German receipt    :', tally.de);
console.log('  no receipt line at all   :', tally.noReceipt);
console.log('container matched by date  :', tally.matched);
console.log('  no arrived container     :', tally.unmatched);
console.log('warehouses                 :', JSON.stringify(whs));
console.log('containers                 :', names.length - 1);
console.log('payload                    :', (JSON.stringify(RECEIVED).length / 1024).toFixed(0), 'KB');

const byWh = {};
Object.keys(out).forEach(s => Object.keys(out[s]).forEach(rg => {
  const w = whs[out[s][rg][0]]; byWh[w] = (byWh[w] || 0) + 1; }));
console.log('\nreceived warehouse spread:');
Object.keys(byWh).sort((a, b) => byWh[b] - byWh[a]).forEach(k => console.log('  ' + k.padEnd(10) + byWh[k]));

const ex = out['CRFF100CH'];
console.log('\nvalidated example CRFF100CH:',
  ex ? JSON.stringify({ wh: whs[ex.UK[0]], date: ex.UK[1], container: names[ex.UK[2]],
                        order: orders[ex.UK[3]], supply: ex.UK[4] }) : 'no receipt');
