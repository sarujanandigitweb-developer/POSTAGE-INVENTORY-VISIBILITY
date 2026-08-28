'use strict';
// The classification rules, READ OUT OF THE DASHBOARD ITSELF.
//
// This file defines nothing. It loads the page's own data layer and hands back the
// tables the page already uses — CLASSIFY, SUB4, PREFIX_RULES, PREFIX_DEFINED, the
// CATS registry and classifySKU(). That way the refresh cannot drift from the page:
// there is exactly one definition of the rules, and it is the one that ships.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const FILE = path.join(ROOT, 'dashboard', 'inventory-dashboard.html');

function load(){
  const html = fs.readFileSync(FILE, 'utf8');
  const o = html.indexOf('<script>');
  const body = html.slice(o + 8, html.indexOf('const state = {'));
  const el = { addEventListener(){}, appendChild(){}, style:{},
               classList:{ add(){}, remove(){}, toggle(){} } };
  const document = { getElementById: () => null, querySelector: () => null,
                     querySelectorAll: () => [], createElement: () => el,
                     addEventListener(){}, documentElement: el, body: el };
  const sb = { console, out: null };
  new Function('sandbox','document','window','localStorage',
    body + '\n; sandbox.out = { CATS, CATEGORIES, classifySKU, CLASSIFY, SUB4, SUB4_AMBIGUOUS,' +
           ' SUB_LABEL, PREFIX_RULES, PREFIX_DEFINED, LS_TYPE_RENAME, WA_MERGE, LB_SERIES,' +
           ' HAP_GROUP, OTHERS_LABEL, imgURL, LS_IMG_BASE };')
    (sb, document, { addEventListener(){}, matchMedia: () => ({matches:false, addEventListener(){}}) },
     { getItem: () => null, setItem(){} });
  return sb.out;
}

// The section a SKU belongs to, and the family code and type label inside it, using the
// page's own rules. Returns null when nothing matches — the caller decides what Other
// means, exactly as the page's Others pass does.
function classify(rules, sku){
  const c = rules.classifySKU(sku);
  if (!c || !c.key) return null;
  return c;
}

module.exports = { load, classify, FILE };
