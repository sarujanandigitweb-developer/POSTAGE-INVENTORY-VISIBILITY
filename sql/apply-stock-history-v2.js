'use strict';
// Replaces HIST_RAW with the rebuild from the four history types, and teaches the
// decoder the two fields the new records carry: the time of day and the source.
//
// The dialog itself is unchanged. The time and the source ride in the title of the
// Date and Action cells, so nothing on screen moves.
//
//   node sql/apply-stock-history-v2.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'dashboard', 'inventory-dashboard.html');
let src = fs.readFileSync(FILE, 'utf8');
const orig = src.length;
function sub(a, b, what){
  if (src.indexOf(a) < 0) throw new Error('anchor not found: ' + what);
  src = src.replace(a, b);
}
function span(name){
  const a = src.indexOf('const ' + name + ' = {');
  if (a < 0) throw new Error('not found ' + name);
  const s = src.indexOf('{', a);
  let d = 0;
  for (let p = s; p < src.length; p++){
    if (src[p] === '{') d++;
    else if (src[p] === '}'){ d--; if (!d) return [s, p + 1]; }
  }
  throw new Error('unbalanced ' + name);
}

const RAW = JSON.parse(fs.readFileSync(path.join(ROOT, 'sql', 'stock-history_data.json'), 'utf8'));
const r = span('HIST_RAW');
src = src.slice(0, r[0]) + JSON.stringify(RAW) + src.slice(r[1]);

// ---- the decoder gains `tm` (time) and `sr` (source) -----------------------
sub(`      byRegion[rg] = R.h[sku][rg].map(v => ({
        dt: g(R.d, v[0]), ac: g(R.a, v[1]), tl: g(R.l, v[2]),
        sb: v[3], sa: v[4], qt: v[5],
        cp: g(R.p, v[6]), ip: g(R.p, v[7]), rm: g(R.r, v[8]),
        cn: g(R.c, v[9]), fl: g(R.l, v[10]), rg: rg
      }));`,
`      byRegion[rg] = R.h[sku][rg].map(v => ({
        dt: g(R.d, v[0]), ac: g(R.a, v[1]), tl: g(R.l, v[2]),
        sb: v[3], sa: v[4], qt: v[5],
        cp: g(R.p, v[6]), ip: g(R.p, v[7]), rm: g(R.r, v[8]),
        cn: g(R.c, v[9]), fl: g(R.l, v[10]), rg: rg,
        tm: v[11] || '', sr: g(R.s, v[12])     // time of day, and which record type
      }));`, 'decoder');

// ---- the two extra fields ride in existing cells, so no column moves --------
sub(`  if (kind === 'd') return '<td class="dt">' + esc(v) + '</td>';`,
`  // The source records a time as well as a date. The Date column is 9% wide and the
  // spec calls it "Date", so the time rides in the tooltip rather than widening it.
  if (kind === 'd') return '<td class="dt"' +
    (m.tm ? ' title="' + esc(v + ' ' + m.tm) + '"' : '') + '>' + esc(v) + '</td>';`, 'date cell');

sub(`    return '<td><span class="hact ' + (HACT_CLASS[v] || '') + '">' + esc(v) + '</span>' +
           (m.cn ? '<span class="hcont">' + esc(m.cn) + '</span>' : '') + '</td>';`,
`    return '<td><span class="hact ' + (HACT_CLASS[v] || '') +
           (m.sr ? '" title="Source: ' + esc(m.sr) : '') + '">' + esc(v) + '</span>' +
           (m.cn ? '<span class="hcont">' + esc(m.cn) + '</span>' : '') + '</td>';`, 'action cell');

// ---- keep the documentation constants truthful ------------------------------
sub(`const HIST_SOURCE_ACTIONS = ['CSV upload', 'Goods received', 'Manual correction', 'Stock change'];`,
`const HIST_SOURCE_ACTIONS = ['Goods received', 'Manual correction', 'Stock change'];
// The four record types the history is built from, and the warehouse each field names.
// The FIELD is authoritative, not the label beside it: a Supply line carries the field
// alone, and Quantity/unit1/unit3 do NOT mean Unit 1/Unit 1/Unit 3.
const HIST_TYPES = ['UK stock changes', 'Supply', 'German Inventory', 'German Supply'];
const HIST_WAREHOUSE = { Quantity: 'Unit 3', unit1: 'Unit 18', unit3: 'Unit 4',
                         unit2: 'Mark', unit5: 'Unit 5' };`, 'source actions');

fs.writeFileSync(FILE, src);
console.log('HIST_RAW replaced. SKUs:', Object.keys(RAW.h).length);
console.log('inventory-dashboard.html', orig, '->', src.length, 'chars  (' +
            (src.length - orig >= 0 ? '+' : '') + (src.length - orig) + ')');
