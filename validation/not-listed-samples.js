'use strict';
// For every product TYPE on the dashboard, how many of its SKUs are not listed on
// Shopify at all, with one real example. Read-only.
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
const notListed = s => String(COM[s] || '').indexOf('Not listed') === 0;

const STOCK = ['a','b','c','k','m','ca','us','u5'];
const units = r => STOCK.reduce((t, c) => t + (typeof r[c] === 'number' && r[c] > 0 ? r[c] : 0), 0);

const groups = [];
Object.keys(CATS).forEach(key => {
  const cfg = CATS[key];
  const buckets = {};
  cfg.data.forEach(r => {
    const type = r.sc || r.t || '(no type)';
    (buckets[type] = buckets[type] || []).push(r);
  });
  Object.keys(buckets).sort().forEach(type => {
    const rows = buckets[type];
    const miss = rows.filter(r => notListed(r.s));
    if (!miss.length) return;
    // the example is the one with the MOST stock - the costliest to be invisible
    miss.sort((x, y) => units(y) - units(x));
    const e = miss[0];
    groups.push({ section: cfg.name, type, total: rows.length, missing: miss.length,
                  sku: e.s, desc: String(e.d || '').replace(/\s+/g, ' ').trim().slice(0, 62),
                  units: miss.reduce((t, r) => t + units(r), 0), exUnits: units(e) });
  });
});

groups.sort((a, b) => b.units - a.units);
console.log('| Section | Type | Not listed | of | Units unsellable | Example SKU | What it is |');
console.log('|---|---|---:|---:|---:|---|---|');
groups.forEach(g => console.log('| ' + g.section + ' | ' + g.type + ' | ' + g.missing + ' | ' +
  g.total + ' | ' + g.units.toLocaleString() + ' | `' + g.sku + '` | ' + g.desc + ' |'));
console.log('\ntypes with at least one unlisted SKU:', groups.length);
console.log('total unlisted SKUs:', groups.reduce((t, g) => t + g.missing, 0));
console.log('total units behind them:', groups.reduce((t, g) => t + g.units, 0).toLocaleString());
