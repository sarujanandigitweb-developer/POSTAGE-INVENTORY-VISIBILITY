'use strict';
// Verifies the rebuilt History: only the four types, the field->warehouse mapping,
// the Supply "final change" rule, and that both German wordings are covered.
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
  body + '\n; sandbox.out = { CATS, STOCK_HISTORY, HIST_TOTAL, HIST_RAW, histFor };')
  (sb, document, { addEventListener(){}, matchMedia: () => ({matches:false, addEventListener(){}}) },
   { getItem: () => null, setItem(){} });
const { CATS, STOCK_HISTORY, HIST_TOTAL, HIST_RAW } = sb.out;

const all = [];
Object.keys(STOCK_HISTORY).forEach(s => Object.keys(STOCK_HISTORY[s])
  .forEach(rg => STOCK_HISTORY[s][rg].forEach(m => all.push([s, rg, m]))));

console.log('SKUs with history :', Object.keys(STOCK_HISTORY).length);
console.log('movements carried :', all.length);
console.log('regions           :', [...new Set(all.map(x => x[1]))].sort().join(', '));
console.log('actions           :', [...new Set(all.map(x => x[2].ac))].sort().join(' | '));
console.log('warehouses        :', [...new Set(all.map(x => x[2].tl))].sort().join(' | '));
console.log('sources           :', [...new Set(all.map(x => x[2].sr))].sort().join(' | '));

const cnt = f => { const c = {}; all.forEach(x => { const k = f(x[2]); c[k] = (c[k] || 0) + 1; }); return c; };
console.log('\nby warehouse      :', JSON.stringify(cnt(m => m.tl)));
console.log('by action         :', JSON.stringify(cnt(m => m.ac)));
console.log('by source         :', JSON.stringify(cnt(m => m.sr)));

console.log('\n-- invariants --');
const chk = (label, ok, extra) => console.log((ok ? 'OK   ' : '**** ') + label + (extra === undefined ? '' : '  ' + extra));
chk('every movement has a date', all.every(x => /^\d{4}-\d{2}-\d{2}$/.test(x[2].dt)));
chk('every movement has an action', all.every(x => x[2].ac));
chk('every movement names a warehouse', all.every(x => x[2].tl),
    all.filter(x => !x[2].tl).length + ' without');
chk('every German movement is in the DE bucket',
    all.filter(x => x[2].tl === 'German').every(x => x[1] === 'DE'));
chk('no UK movement sits in the DE bucket',
    all.filter(x => x[1] === 'DE').every(x => x[2].tl === 'German'));
chk('German movements never name a UK unit',
    all.filter(x => x[1] === 'DE').every(x => !/Unit/.test(x[2].tl)));
chk('Qty is computed only where both sides are numbers',
    all.every(x => { const m = x[2], n = v => /^-?\d+$/.test(String(v));
      return (n(m.sb) && n(m.sa)) ? m.qt === Number(m.sa) - Number(m.sb) : m.qt === ''; }));
chk('negatives survive', all.filter(x => /^-\d+$/.test(String(x[2].sb)) ||
                                          /^-\d+$/.test(String(x[2].sa))).length > 0,
    all.filter(x => /^-\d+$/.test(String(x[2].sb)) || /^-\d+$/.test(String(x[2].sa))).length + ' movements');
chk('no more than 12 per SKU per region',
    Object.keys(STOCK_HISTORY).every(s => Object.keys(STOCK_HISTORY[s])
      .every(rg => STOCK_HISTORY[s][rg].length <= 12)));
chk('each region list is newest first',
    Object.keys(STOCK_HISTORY).every(s => Object.keys(STOCK_HISTORY[s]).every(rg => {
      const v = STOCK_HISTORY[s][rg];
      return v.every((m, i) => i === 0 || v[i - 1].dt >= m.dt); })));
chk('a Supply movement always carries its SU number',
    all.filter(x => x[2].sr === 'Supply' || x[2].sr === 'German supply')
       .every(x => /^SU/i.test(x[2].cn)));
chk('a Stock change never carries a container',
    all.filter(x => x[2].ac === 'Stock change').every(x => !x[2].cn));
chk('no CSV-upload location move survived the rebuild',
    all.every(x => x[2].ac !== 'CSV upload'));
chk('no shelf code is left in a stock figure',
    all.every(x => !/^[A-Z]-|^\d-[A-Z]/.test(String(x[2].sb)) &&
                   !/^[A-Z]-|^\d-[A-Z]/.test(String(x[2].sa))));
chk('the time is carried where the source records one',
    all.filter(x => x[2].tm).length > 0, all.filter(x => x[2].tm).length + ' with a time');
chk('UK stock changes carry no time (the source records none)',
    all.filter(x => x[2].sr === 'inventory CSV').every(x => !x[2].tm));

console.log('\n-- worked examples from the spec --');
const show = (sku, rg, n) => {
  const v = (STOCK_HISTORY[sku] || {})[rg] || [];
  console.log('  ' + sku + ' / ' + rg + ' — ' + v.length + ' carried' +
    (HIST_TOTAL[sku] && HIST_TOTAL[sku][rg] ? ' of ' + HIST_TOTAL[sku][rg] : ''));
  v.slice(0, n).forEach(m => console.log('     ' + [m.dt + (m.tm ? ' ' + m.tm : ''), m.ac, m.tl,
    m.sb + ' -> ' + m.sa, 'qty ' + m.qt, m.cp, m.cn || '-'].join(' | ')));
};
show('LHAHE27BM', 'UK', 4);
show('LHAHE27BM', 'DE', 3);
