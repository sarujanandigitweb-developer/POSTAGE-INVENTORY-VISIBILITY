'use strict';
// Reads the dashboard's embedded arrays AS THEY ARE ON DISK, before the page's
// in-memory re-typing runs.
//
// This matters. Reading them out of CATS instead gives the POST-load shape: Wall Arm's
// `f` has already been collapsed 11->4 and its original 2-char code replaced by a name,
// and Bulbs rows have already had their series code overwritten with 'BLD'. Rebuilding
// an array from that shape would feed the page values its own re-typing cannot process,
// and Wall Arm would collapse into Others.
//
// Every array here is the authority for the SKUs it already contains: whatever `f`,
// `t`, `x`, `mt`, `sh` and `ft` it holds is what the refresh must emit again.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const FILE = path.join(ROOT, 'dashboard', 'inventory-dashboard.html');

// name -> which CATS section it feeds, and whether its rows carry the x:1 prefix flag
const ARRAYS = [
  ['DATA',     'CR'],  ['LS_DATA',  'LS'],  ['LS_EXTRA', 'LS'],
  ['PH_DATA',  'PH'],  ['WA_DATA',  'WA'],  ['LB_DATA',  'LB'],
  ['LB_EXTRA', 'LB'],  ['LH_DATA',  'LH'],  ['LH_EXTRA', 'LH'],
  ['SPR_DATA', 'SPR'], ['LGT_DATA', 'LGT'], ['CSM_DATA', 'CSM'],
  ['CLO_DATA', 'CLO'], ['HAP_DATA', 'HAP'], ['RFB_DATA', 'RFB']
];

function span(src, name){
  const a = src.search(new RegExp('const ' + name + '\\s*=\\s*\\['));
  if (a < 0) throw new Error('array not found: ' + name);
  const s = src.indexOf('[', a);
  let d = 0;
  for (let p = s; p < src.length; p++){
    if (src[p] === '[') d++;
    else if (src[p] === ']'){ d--; if (!d) return [s, p + 1]; }
  }
  throw new Error('unbalanced ' + name);
}

function read(){
  const src = fs.readFileSync(FILE, 'utf8');
  const out = {};        // arrayName -> rows
  const bySku = {};      // sku -> { arr, key, row }
  ARRAYS.forEach(([name, key]) => {
    const r = span(src, name);
    const rows = JSON.parse(src.slice(r[0], r[1]));
    out[name] = rows;
    rows.forEach(row => { bySku[row.s] = { arr: name, key, row }; });
  });
  return { arrays: out, bySku, src };
}

module.exports = { read, span, ARRAYS, FILE };
