'use strict';
// Re-hashes every embedded dataset in dashboard/inventory-dashboard.html and prints
// the sha256 of each, so validation/locked-sections-lock.txt can be checked against
// the file as it stands. Read-only.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.resolve(__dirname, '..', 'dashboard', 'inventory-dashboard.html');
const src = fs.readFileSync(FILE, 'utf8');

function span(name, open, close){
  // `const DATA =` puts its array on the NEXT line; the rest open on the same line.
  const a = src.search(new RegExp('const ' + name + ' =\\s*\\' + open));
  if (a < 0) return null;
  const s = src.indexOf(open, a);
  let d = 0;
  for (let p = s; p < src.length; p++){
    if (src[p] === open) d++;
    else if (src[p] === close){ d--; if (!d) return src.slice(s, p + 1); }
  }
  return null;
}
const sha = t => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
const count = t => { const v = JSON.parse(t); return Array.isArray(v) ? v.length : Object.keys(v.h || v.c || v).length; };

const ARRAYS = [
  ['CEILING ROSE',        'DATA',      '['], ['LAMPSHADE (SOT tab)', 'LS_DATA',  '['],
  ['PENDANT LAMP HOLDER', 'PH_DATA',   '['], ['WALL ARM',            'WA_DATA',  '['],
  ['BULBS (SOT tab)',     'LB_DATA',   '['], ['LAMP HOLDER',         'LH_DATA',  '['],
  ['LAMPSHADE EXTRA',     'LS_EXTRA',  '['], ['LIGHTING',            'LGT_DATA', '['],
  ['LAMP SPARES',         'SPR_DATA',  '['], ['BULBS EXTRA',         'LB_EXTRA', '['],
  ['COSMETICS',           'CSM_DATA',  '['], ['CLOTHES',             'CLO_DATA', '['],
  ['HOME APPLIANCES',     'HAP_DATA',  '['], ['REFURBISHED',         'RFB_DATA', '['],
  ['LAMP HOLDER EXTRA',   'LH_EXTRA',  '['],
  ['STOCK HISTORY',       'HIST_RAW',       '{'],
  ['LAST CONTAINER',      'LAST_CONTAINER', '{'],
  ['UK UNIT 5 lookup',    'WH5_STOCK',      '{'],
  ['SHOPIFY PRICE lookup','SHOPIFY_PRICE',  '{'],
  ['PRICE COMMENT lookup','SHOPIFY_COMMENT', '{'],
];

ARRAYS.forEach(([label, name, open]) => {
  const t = span(name, open, open === '[' ? ']' : '}');
  if (!t){ console.log(label.padEnd(22) + '  MISSING'); return; }
  console.log(label.padEnd(22) + String(count(t)).padStart(6) + '  ' + sha(t));
});
console.log('\nwhole file            ' + String(src.length).padStart(6) + '  ' + sha(src));
