'use strict';
// Applies the Lamp Holder repopulation to dashboard/inventory-dashboard.html.
//
// The section was built from the LampHolder_SOT Google Sheet tab (226 SKUs) because
// configurator.components_sot_skus has no lampholder tab at all. inventory.products
// holds 417 single LH SKUs; 191 of them appeared on no section of the dashboard.
// See evidence/48 and evidence/49.
//
// Every embedded dataset array stays byte-identical - the 191 arrive as a separate
// LH_EXTRA const merged at load, the same pattern as LS_EXTRA and LB_EXTRA. Only the
// four lookups (Unit 5, last container, Shopify price, stock history) and the CATS.LH
// entry change.
//
//   node sql/apply-lamp-holder-extra.js
//
// Idempotent guard: refuses to run twice.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'dashboard', 'inventory-dashboard.html');
const SQL = path.join(ROOT, 'sql');

let src = fs.readFileSync(FILE, 'utf8');
const orig = src.length;
if (src.indexOf('const LH_EXTRA = ') >= 0){
  console.error('LH_EXTRA is already present - nothing to do.');
  process.exit(1);
}

function span(name, open, close){
  const a = src.indexOf('const ' + name + ' = ' + open);
  if (a < 0) throw new Error('not found ' + name);
  const s = src.indexOf(open, a);
  let d = 0;
  for (let p = s; p < src.length; p++){
    if (src[p] === open) d++;
    else if (src[p] === close){ d--; if (!d) return [s, p + 1]; }
  }
  throw new Error('unbalanced ' + name);
}
function replaceSpan(name, open, close, newText){
  const r = span(name, open, close);
  src = src.slice(0, r[0]) + newText + src.slice(r[1]);
}
const rd = f => JSON.parse(fs.readFileSync(path.join(SQL, f), 'utf8'));

// ---- 1. LH_EXTRA, inserted straight after LH_DATA ---------------------------
const extra = rd('lamp-holder-extra_data.json');
const lhEnd = span('LH_DATA', '[', ']')[1];
const lineEnd = src.indexOf('\n', lhEnd);
const block = '\n\n'
 + '// ---- Lamp Holder, the 191 the sheet never listed ---------------------------\n'
 + '// LH_DATA above is the LampHolder_SOT tab: 226 SKUs, and stale in both directions.\n'
 + '// inventory.products holds 417 single LH SKUs (bundles and packs excluded); 191 of\n'
 + '// them appeared on no section of the dashboard at all - 158 live, 133 carrying\n'
 + '// stock, 43,550 units the team could not see. 380 of the 417 say "holder" in their\n'
 + '// own description, so the prefix is clean and the sheet is the stale artefact.\n'
 + '// See evidence/48 and evidence/49.\n'
 + '//\n'
 + '// Added as a SEPARATE const, merged at load, so LH_DATA stays byte-identical on\n'
 + '// disk and its lock survives - the same pattern as LS_EXTRA and LB_EXTRA.\n'
 + 'const LH_EXTRA = ' + JSON.stringify(extra) + ';';
src = src.slice(0, lineEnd) + block + src.slice(lineEnd);

// ---- 2. warehouse 33 / Unit 5 ----------------------------------------------
{
  const r = span('WH5_STOCK', '{', '}');
  const cur = JSON.parse(src.slice(r[0], r[1]));
  const add = rd('lamp-holder-extra_unit5.json');
  Object.keys(add).forEach(k => { cur[k] = add[k]; });
  replaceSpan('WH5_STOCK', '{', '}', JSON.stringify(cur));
  console.log('Unit 5 entries added:', Object.keys(add).length);
}

// ---- 3. last arrived container ---------------------------------------------
{
  const r = span('LAST_CONTAINER', '{', '}');
  const cur = JSON.parse(src.slice(r[0], r[1]));
  const add = rd('lamp-holder-extra_container.json');
  const nameIdx = n => { let i = cur.n.indexOf(n); if (i < 0){ cur.n.push(n); i = cur.n.length - 1; } return i; };
  Object.keys(add).forEach(sku => {
    const o = {};
    Object.keys(add[sku]).forEach(rg => { const v = add[sku][rg]; o[rg] = [nameIdx(v[0]), v[1], v[2]]; });
    cur.c[sku] = o;
  });
  replaceSpan('LAST_CONTAINER', '{', '}', JSON.stringify(cur));
  console.log('container SKUs added:', Object.keys(add).length, '- container names now', cur.n.length);
}

// ---- 4. shopify price -------------------------------------------------------
// appended textually so the 3,320 already there keep their exact formatting: the
// source writes 17.0 where JSON.stringify would write 17.
{
  const r = span('SHOPIFY_PRICE', '{', '}');
  const add = rd('lamp-holder-extra_price.json');
  src = src.slice(0, r[1] - 1) + ',' + JSON.stringify(add).slice(1, -1) + src.slice(r[1] - 1);
  console.log('price entries appended:', Object.keys(add).length);
}

// ---- 5. stock history -------------------------------------------------------
replaceSpan('HIST_RAW', '{', '}', JSON.stringify(rd('stock-history_data.json')));

// ---- 6. the section now reads from both -------------------------------------
const dataOld = "    data: LH_DATA,\n    name:  'Lamp Holder',";
const dataNew = "    data: LH_DATA.concat(LH_EXTRA),\n    name:  'Lamp Holder',";
if (src.indexOf(dataOld) < 0) throw new Error('CATS.LH data line not found');
src = src.replace(dataOld, dataNew);

const subOld = 'Postage &amp; Warehouse Team &middot; Lamp Holder &mdash; 226 SKUs; the sheet declares no business category, so Mount Type is an attribute';
const subNew = 'Postage &amp; Warehouse Team &middot; Lamp Holder &mdash; 417 SKUs; 226 from the LampHolder_SOT tab, plus 191 the tab never listed, added by SKU prefix';
if (src.indexOf(subOld) < 0) throw new Error('CATS.LH sub text not found');
src = src.replace(subOld, subNew);

fs.writeFileSync(FILE, src);
console.log('inventory-dashboard.html', orig, '->', src.length, 'chars  (+' + (src.length - orig) + ')');
