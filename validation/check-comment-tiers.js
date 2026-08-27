'use strict';
// Cross-checks the Comments tiers against the price the dashboard actually shows.
// The dashboard price comes from an EXACT SKU match in public.listing_data, so a row
// whose comment names a pack or combo SKU has no price of its own. Read-only.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'dashboard', 'inventory-dashboard.html'), 'utf8');
const open = src.indexOf('<script>');
const body = src.slice(open + 8, src.indexOf('const state = {'));
const el = { addEventListener(){}, appendChild(){}, style:{}, classList:{ add(){}, remove(){}, toggle(){} } };
const document = { getElementById: () => null, querySelector: () => null,
                   querySelectorAll: () => [], createElement: () => el,
                   addEventListener(){}, documentElement: el, body: el };
const sandbox = { console, out: null };
new Function('sandbox','document','window','localStorage', body + '\n; sandbox.out = { CATS };')
  (sandbox, document, { addEventListener(){}, matchMedia: () => ({matches:false, addEventListener(){}}) },
   { getItem: () => null, setItem(){} });

const CATS = sandbox.out.CATS;
const COM = JSON.parse(fs.readFileSync(path.join(ROOT, 'sql', 'shopify-comments.json'), 'utf8'));
const tierOf = t => t.indexOf('Not listed') === 0 ? 'not listed'
  : /— sold as /.test(t) ? 'pack'
  : /— combined with |multipack of this SKU/.test(t) ? 'combo'
  : /variant SKU only/.test(t) ? 'variant' : 'exact';

const T = {};
Object.keys(CATS).forEach(k => CATS[k].data.forEach(r => {
  const t = tierOf(String(COM[r.s] || 'Not listed'));
  T[t] = T[t] || { rows: 0, priced: 0, range: 0, blank: 0 };
  T[t].rows++;
  if (typeof r.p === 'number') T[t].priced++;
  else if (r.pn && r.pn > 1) T[t].range++;
  else T[t].blank++;
}));
console.log('tier         rows   has price   range   blank on dashboard');
Object.keys(T).forEach(k => console.log(
  k.padEnd(12) + String(T[k].rows).padStart(5) + String(T[k].priced).padStart(12) +
  String(T[k].range).padStart(8) + String(T[k].blank).padStart(9)));
