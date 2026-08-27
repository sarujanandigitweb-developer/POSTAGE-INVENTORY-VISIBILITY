'use strict';
// Verifies the Handles move: Lamp Spares gained them, Home Appliances lost them, and
// nothing was duplicated or dropped on the way. Read-only.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'dashboard', 'inventory-dashboard.html'), 'utf8');
const o = html.indexOf('<script>');
const body = html.slice(o + 8, html.indexOf('const state = {'));
const el = { addEventListener(){}, appendChild(){}, style:{}, classList:{ add(){}, remove(){}, toggle(){} } };
const document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
                   createElement: () => el, addEventListener(){}, documentElement: el, body: el };
const sb = { console, out: null };
new Function('sandbox','document','window','localStorage',
  body + '\n; sandbox.out = { CATS, HAP_DATA, SPR_DATA, HANDLES, UNCLASSIFIED };')
  (sb, document, { addEventListener(){}, matchMedia: () => ({matches:false, addEventListener(){}}) },
   { getItem: () => null, setItem(){} });
const { CATS, HAP_DATA, SPR_DATA, HANDLES, UNCLASSIFIED } = sb.out;

const chk = (l, ok, x) => console.log((ok ? 'OK   ' : '**** ') + l + (x === undefined ? '' : '  ' + x));
const spr = CATS.SPR.data, hap = CATS.HAP.data;
const handles = spr.filter(r => r.f === 'HL');

console.log('Lamp Spares     :', spr.length, '(was 1,420)');
console.log('Home Appliances :', hap.length, '(was 705)');
console.log('Handles moved   :', HANDLES.length);
console.log('dashboard total :', Object.keys(CATS).reduce((t, k) => t + CATS[k].data.length, 0));

console.log('\n-- the move --');
chk('31 Handles are now in Lamp Spares', handles.length === 31, handles.length);
chk('Lamp Spares is 1,420 + 31 = 1,451', spr.length === 1451, spr.length);
chk('Home Appliances is 705 - 31 = 674', hap.length === 674, hap.length);
chk('the dashboard total is unchanged at 5,852',
    Object.keys(CATS).reduce((t, k) => t + CATS[k].data.length, 0) === 5852);
chk('every Handle SKU starts HL', handles.every(r => r.s.startsWith('HL')));
chk('no Handle is left in Home Appliances',
    !hap.some(r => r.f === 'ZHL' || r.f === 'HL' || r.t === 'Handles'));
chk('no SKU appears in BOTH sections', (() => {
  const a = new Set(spr.map(r => r.s));
  return !hap.some(r => a.has(r.s));
})());
chk('no SKU was lost from either section', (() => {
  const before = new Set(HAP_DATA.map(r => r.s));
  const after = new Set(hap.map(r => r.s).concat(handles.map(r => r.s)));
  return before.size === after.size && [...before].every(s => after.has(s));
})());

console.log('\n-- the type reads correctly --');
chk('Lamp Spares declares a Handles family',
    CATS.SPR.fams.some(f => f[0] === 'HL' && f[1] === 'Handles'));
chk('Home Appliances no longer declares one',
    !CATS.HAP.fams.some(f => f[1] === 'Handles'));
chk('every Handle carries Lamp Spares as its main category',
    handles.every(r => r.mc === 'Lamp Spares'), [...new Set(handles.map(r => r.mc))].join(', '));
chk('every Handle shows "Handles" as its type',
    handles.every(r => r.sc === 'Handles'), [...new Set(handles.map(r => r.sc))].join(', '));
chk('none fell into the Others bucket',
    !handles.some(r => r.f === 'SPROT'));
chk('the classifier dropped nothing', UNCLASSIFIED.length === 0, UNCLASSIFIED.length);
chk('the sub-titles state the new counts',
    /Lamp Spares &mdash; 1,451 components across 30 sub-types/.test(html) &&
    /Home Appliances &mdash; 674 SKUs across 18 types/.test(html));

console.log('\n-- the source datasets are untouched --');
chk('HAP_DATA still holds all 705 rows on disk', HAP_DATA.length === 705, HAP_DATA.length);
chk('SPR_DATA still holds 1,420', SPR_DATA.length === 1420, SPR_DATA.length);

console.log('\nsample:');
handles.slice(0, 5).forEach(r => console.log('  ' + r.s.padEnd(12) + r.sc.padEnd(10) +
  String(r.d).slice(0, 44)));
