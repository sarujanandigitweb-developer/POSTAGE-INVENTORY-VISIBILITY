'use strict';
// Loads the dashboard's data layer the way the page does and reports what the Lamp
// Holder section actually resolves to. Read-only.
const fs = require('fs');
const path = require('path');

const FILE = path.resolve(__dirname, '..', 'dashboard', 'inventory-dashboard.html');
const src = fs.readFileSync(FILE, 'utf8');

// the data layer runs top-to-bottom before any rendering; take it as far as `state`
const open = src.indexOf('<script>');
const body = src.slice(open + 8, src.indexOf('const state = {'));

const el = { addEventListener(){}, appendChild(){}, style:{}, classList:{ add(){}, remove(){}, toggle(){} } };
const document = { getElementById: () => null, querySelector: () => null,
                   querySelectorAll: () => [], createElement: () => el,
                   addEventListener(){}, documentElement: el, body: el };
const sandbox = { console, out: null };
const fn = new Function('sandbox', 'document', 'window', 'localStorage',
  body + '\n; sandbox.out = { CATS, UNCLASSIFIED, STOCK_HISTORY, HIST_TOTAL, SHOPIFY_PRICE, WH5_STOCK, LAST_CONTAINER };');
fn(sandbox, document, { addEventListener(){}, matchMedia: () => ({ matches:false, addEventListener(){} }) },
   { getItem: () => null, setItem(){} });
const { CATS, UNCLASSIFIED, STOCK_HISTORY, HIST_TOTAL } = sandbox.out;

const lh = CATS.LH.data;
console.log('Lamp Holder rows on screen :', lh.length);
console.log('unique SKUs                :', new Set(lh.map(r => r.s)).size);
console.log('dropped by the classifier  :', UNCLASSIFIED.filter(u => u.section === 'LH').length);
console.log('every row main category    :', [...new Set(lh.map(r => r.mc))].join(', '));
console.log('families declared          :', CATS.LH.fams.length, '(empty = no type dropdown)');

const n = k => lh.filter(k).length;
console.log('\nwith a Mount Type          :', n(r => r.mt));
console.log('with an image              :', n(r => r.i));
console.log('with a Shopify price       :', n(r => typeof r.p === 'number'));
console.log('with Unit 5 stock          :', n(r => r.u5 > 0));
console.log('with a UK container        :', n(r => r.uc || r.un));
console.log('with a German container    :', n(r => r.gc || r.gn));
console.log('with stock history         :', n(r => STOCK_HISTORY[r.s]));
console.log('  UK history               :', n(r => (STOCK_HISTORY[r.s] || {}).UK));
console.log('  German history           :', n(r => (STOCK_HISTORY[r.s] || {}).DE));
console.log('  truncated past 12        :', n(r => HIST_TOTAL[r.s]));

const stockCols = ['a','b','c','k','m','ca','us','u5'];
const units = lh.reduce((t, r) => t + stockCols.reduce((s, c) => s + (typeof r[c] === 'number' && r[c] > 0 ? r[c] : 0), 0), 0);
console.log('\ntotal units on shelf       :', units.toLocaleString());

const totals = Object.keys(CATS).map(k => [k, CATS[k].data.length]);
console.log('\nsection totals             :', totals.map(t => t[0] + ' ' + t[1]).join('  '));
console.log('DASHBOARD TOTAL            :', totals.reduce((s, t) => s + t[1], 0));
