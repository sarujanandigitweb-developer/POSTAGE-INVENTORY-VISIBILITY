'use strict';
// Loads the dashboard's data layer and writes every SKU on screen, one per line,
// in section order. Read-only.
const fs = require('fs');
const path = require('path');
const FILE = path.resolve(__dirname, '..', 'dashboard', 'inventory-dashboard.html');
const src = fs.readFileSync(FILE, 'utf8');
const open = src.indexOf('<script>');
const body = src.slice(open + 8, src.indexOf('const state = {'));
const el = { addEventListener(){}, appendChild(){}, style:{}, classList:{ add(){}, remove(){}, toggle(){} } };
const document = { getElementById: () => null, querySelector: () => null,
                   querySelectorAll: () => [], createElement: () => el,
                   addEventListener(){}, documentElement: el, body: el };
const sandbox = { console, out: null };
new Function('sandbox','document','window','localStorage',
  body + '\n; sandbox.out = { CATS };')
  (sandbox, document, { addEventListener(){}, matchMedia: () => ({matches:false, addEventListener(){}}) },
   { getItem: () => null, setItem(){} });

const CATS = sandbox.out.CATS;
const rows = [];
Object.keys(CATS).forEach(k => CATS[k].data.forEach(r => rows.push([k, r.s])));
fs.writeFileSync(path.resolve(__dirname, '..', 'sql', 'dashboard-skus.txt'),
                 rows.map(r => r[0] + '\t' + r[1]).join('\n') + '\n');
console.log('sections:', Object.keys(CATS).length, ' rows:', rows.length,
            ' distinct SKUs:', new Set(rows.map(r => r[1])).size);
