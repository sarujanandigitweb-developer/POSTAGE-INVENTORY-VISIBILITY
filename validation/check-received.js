'use strict';
// Verifies Received Warehouse / Received Date / Container against the four-step rule.
// Read-only.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'dashboard', 'inventory-dashboard.html'), 'utf8');
const o = html.indexOf('<script>');
const body = html.slice(o + 8, html.indexOf('const state = {'));
const el = { addEventListener(){}, appendChild(){}, style:{}, classList:{ add(){}, remove(){}, toggle(){} } };
const document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
                   createElement: () => el, addEventListener(){}, documentElement: el, body: el };
const sb = { console, out: null };
new Function('sandbox','document','window','localStorage',
  body + '\n; sandbox.out = { CATS, RECEIVED, STOCK_HISTORY, rcvWh, rcvDt };')
  (sb, document, { addEventListener(){}, matchMedia: () => ({matches:false, addEventListener(){}}) },
   { getItem: () => null, setItem(){} });
const { CATS, RECEIVED, STOCK_HISTORY, rcvWh, rcvDt } = sb.out;

const rows = [].concat(...Object.keys(CATS).map(k => CATS[k].data));
const chk = (l, ok, x) => console.log((ok ? 'OK   ' : '**** ') + l + (x === undefined ? '' : '  ' + x));

console.log('rows                     :', rows.length);
console.log('with a UK receipt        :', rows.filter(r => r.ruw).length);
console.log('with a German receipt    :', rows.filter(r => r.rgw).length);
console.log('UK container matched     :', rows.filter(r => r.ruc).length);
console.log('German container matched :', rows.filter(r => r.rgc).length);
console.log('no receipt at all        :', rows.filter(r => !r.ruw && !r.rgw).length);

const wh = {};
rows.forEach(r => { if (r.ruw) wh[r.ruw] = (wh[r.ruw] || 0) + 1;
                    if (r.rgw) wh[r.rgw] = (wh[r.rgw] || 0) + 1; });
console.log('\nreceived warehouses      :', JSON.stringify(wh));

console.log('\n-- the rule --');
chk('a UK receipt never names a German warehouse',
    rows.filter(r => r.ruw).every(r => r.ruw !== 'German'));
chk('a German receipt always names Germany',
    rows.filter(r => r.rgw).every(r => r.rgw === 'German'));
chk('only warehouses the mapping produces appear',
    Object.keys(wh).every(k => ['Unit 3','Unit 4','Unit 18','Unit 5','Mark','German'].indexOf(k) !== -1),
    Object.keys(wh).join(' | '));
chk('every received date is a real date',
    rows.every(r => (!r.rud || /^\d{4}-\d{2}-\d{2}$/.test(r.rud)) &&
                    (!r.rgd || /^\d{4}-\d{2}-\d{2}$/.test(r.rgd))));
chk('a warehouse and a date always come together',
    rows.every(r => (!!r.ruw === !!r.rud) && (!!r.rgw === !!r.rgd)));
// Verified against the container source, not asserted from the build's own logic.
chk('every matched container was ordered ON OR BEFORE the receipt date', (() => {
  const raw = fs.readFileSync(path.join(process.env.TR,
    'mcp-claude_ai_Ledsone_postgres-execute_sql-' + process.env.RID + '.txt'), 'utf8');
  const byKey = {};
  String(Object.values(JSON.parse(raw).data.rows[0])[0]).split('\n').filter(Boolean).forEach(l => {
    const [sku, rg, od, name] = l.split('|');
    (byKey[sku + '|' + rg + '|' + name] = byKey[sku + '|' + rg + '|' + name] || []).push(od);
  });
  let bad = 0, checked = 0;
  const one = (sku, rg, name, date) => {
    if (!name) return;
    const ods = byKey[sku + '|' + rg + '|' + name];
    checked++;
    if (!ods || !ods.some(od => od <= date)) bad++;
  };
  rows.forEach(r => { one(r.s, 'UK', r.ruc, r.rud); one(r.s, 'DE', r.rgc, r.rgd); });
  console.log('       (' + checked + ' matches checked against suppliers)');
  return bad === 0;
})());
chk('and it really is the LATEST such container, not just any of them', (() => {
  const raw = fs.readFileSync(path.join(process.env.TR,
    'mcp-claude_ai_Ledsone_postgres-execute_sql-' + process.env.RID + '.txt'), 'utf8');
  const all = {};
  String(Object.values(JSON.parse(raw).data.rows[0])[0]).split('\n').filter(Boolean).forEach(l => {
    const [sku, rg, od, name] = l.split('|');
    (all[sku + '|' + rg] = all[sku + '|' + rg] || []).push({ od, name });
  });
  let bad = 0;
  const one = (sku, rg, name, date) => {
    if (!name) return;
    const list = (all[sku + '|' + rg] || []).filter(x => x.od <= date)
      .sort((a, b) => a.od.localeCompare(b.od));
    if (!list.length || list[list.length - 1].name !== name) bad++;
  };
  rows.forEach(r => { one(r.s, 'UK', r.ruc, r.rud); one(r.s, 'DE', r.rgc, r.rgd); });
  return bad === 0;
})());
chk('a container is never shown without a receipt date to justify it',
    rows.every(r => !r.ruc || r.rud) && rows.every(r => !r.rgc || r.rgd));
chk('every receipt carries its supply code',
    rows.filter(r => r.ruw).every(r => /^SU/i.test(String(r.rus || ''))) &&
    rows.filter(r => r.rgw).every(r => /^SU/i.test(String(r.rgs || ''))));
chk('the receipt date agrees with the SKU history where both exist', (() => {
  let bad = 0;
  rows.filter(r => r.ruw).forEach(r => {
    const h = (STOCK_HISTORY[r.s] || {}).UK || [];
    const rec = h.filter(m => m.ac === 'Goods received');
    if (rec.length && rec[0].dt > r.rud) bad++;      // history newest-first
  });
  return bad === 0;
})());
chk('no cell renders the old Unavailable chip for these two columns',
    rcvWh(null).indexOf('Unavailable') === -1 && rcvDt(null).indexOf('Unavailable') === -1);
chk('a missing receipt renders a centred dash',
    rcvWh(null).indexOf('class="dash"') !== -1 && rcvDt(null).indexOf('class="dash"') !== -1);

console.log('\n-- the validated example --');
const e = rows.find(r => r.s === 'CRFF100CH');
console.log('  CRFF100CH:', JSON.stringify({ warehouse: e.ruw, date: e.rud,
  container: e.ruc, order: e.ruo, supply: e.rus }));
chk('  it matches the stated validation',
    e.ruw === 'Unit 3' && e.rud === '2026-07-23' && e.ruc === 'UK Container 4th 2026');

console.log('\n-- a German example --');
const g = rows.find(r => r.rgw && r.rgc);
console.log('  ' + g.s + ':', JSON.stringify({ warehouse: g.rgw, date: g.rgd,
  container: g.rgc, order: g.rgo, supply: g.rgs }));
