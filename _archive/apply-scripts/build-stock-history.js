'use strict';
// Rebuilds HIST_RAW from the four history types, for every SKU on the dashboard.
//
//   TR=<tool-results dir> IDS=<comma separated result ids> node sql/build-stock-history.js
//
// Values are interned — dates, actions, warehouses, people, remarks, containers and
// sources — which is what keeps the carried movements small enough to embed.
const fs = require('fs');
const path = require('path');
const { parseLine, region } = require('./product-history-parser.js');

const ROOT = path.resolve(__dirname, '..');
const CAP = 12;                      // most recent movements carried, per SKU per region

// ---- source lines -----------------------------------------------------------
const SP = process.env.SP;
const lines = JSON.parse(fs.readFileSync(path.join(SP, 'hist_lines_dash.json'), 'utf8'));

const bySku = {};
let parsed = 0, skipped = 0;
lines.forEach(([sku, line]) => {
  const ms = parseLine(line);
  if (!ms.length){ skipped++; return; }
  parsed += ms.length;
  (bySku[sku] = bySku[sku] || []).push(...ms);
});

// ---- intern + encode --------------------------------------------------------
const d = [], a = [], l = [], p = [], r = [], c = [], s = [];
const idx = (tbl, v) => { const x = (v === undefined || v === null) ? '' : v;
                          let i = tbl.indexOf(x); if (i < 0){ tbl.push(x); i = tbl.length - 1; } return i; };
['', ].forEach(v => { idx(p, v); idx(r, v); idx(c, v); idx(s, v); });   // '' at 0 in each

const h = {}, t = {};
let carried = 0, truncated = 0, negatives = 0;
Object.keys(bySku).sort().forEach(sku => {
  const byRegion = {};
  bySku[sku].forEach(m => { const rg = region(m.tl); (byRegion[rg] = byRegion[rg] || []).push(m); });
  const out = {};
  ['UK', 'DE'].forEach(rg => {
    const all = (byRegion[rg] || []).slice()
      .sort((x, y) => (y.dt + ' ' + y.tm).localeCompare(x.dt + ' ' + x.tm));
    if (!all.length) return;
    if (all.length > CAP){ t[sku] = t[sku] || {}; t[sku][rg] = all.length; truncated++; }
    out[rg] = all.slice(0, CAP).map(m => {
      carried++;
      if (/^-\d+$/.test(String(m.sb)) || /^-\d+$/.test(String(m.sa))) negatives++;
      return [ idx(d, m.dt), idx(a, m.ac), idx(l, m.tl), m.sb, m.sa, m.qt,
               idx(p, m.cp), idx(p, m.ip), idx(r, m.rm), idx(c, m.cn), idx(l, m.fl),
               m.tm, idx(s, m.sr) ];
    });
  });
  if (Object.keys(out).length) h[sku] = out;
});

const RAW = { d, a, l, p, r, c, s, t, h };
fs.writeFileSync(path.join(ROOT, 'sql', 'stock-history_data.json'), JSON.stringify(RAW));

console.log('source lines            :', lines.length);
console.log('  parsed into movements :', parsed);
console.log('  lines yielding nothing:', skipped);
console.log('SKUs with history       :', Object.keys(h).length);
console.log('  UK                    :', Object.keys(h).filter(k => h[k].UK).length);
console.log('  German                :', Object.keys(h).filter(k => h[k].DE).length);
console.log('movements carried       :', carried);
console.log('  truncated past ' + CAP + '     :', truncated);
console.log('  negative values kept  :', negatives);
console.log('actions                 :', JSON.stringify(a));
console.log('warehouses              :', JSON.stringify(l));
console.log('sources                 :', JSON.stringify(s));
console.log('intern sizes            : d ' + d.length + '  p ' + p.length +
            '  r ' + r.length + '  c ' + c.length);
console.log('payload                 :', (JSON.stringify(RAW).length / 1048576).toFixed(2), 'MB');

const byWh = {};
Object.keys(h).forEach(k => ['UK','DE'].forEach(rg => (h[k][rg] || [])
  .forEach(v => { const w = l[v[2]]; byWh[w] = (byWh[w] || 0) + 1; })));
console.log('\ncarried movements by warehouse:');
Object.keys(byWh).sort((x, y) => byWh[y] - byWh[x]).forEach(k => console.log('  ' + k.padEnd(10) + byWh[k]));
