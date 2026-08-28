'use strict';
// DRY RUN. Nothing is written and the dashboard is not touched.
//
// The question this answers, and the only one that matters before a refresh is built:
//
//   If the SAME rules are applied to the CURRENT Postgres catalogue, does every SKU on
//   the dashboard today land in the SAME section with the SAME family code and type?
//
// If yes, the logic is provably unchanged and the only difference is the SKUs Postgres
// has that the dashboard lacks. If no, every disagreement is printed, because each one
// is a place the refresh would silently move a product.
//
//   node sql/refresh/dryrun-classify.js
const fs = require('fs');
const path = require('path');
const { load } = require('./rules.js');

const ROOT = path.resolve(__dirname, '..', '..');
const R = load();

// ---- what the dashboard shows today ----------------------------------------
const today = {};                       // sku -> { key, f, t }
Object.keys(R.CATS).forEach(key => R.CATS[key].data.forEach(r => {
  today[r.s] = { key, f: r.f, t: r.t, sc: r.sc };
}));
const todaySkus = Object.keys(today);

// ---- what Postgres holds now -----------------------------------------------
const live = fs.readFileSync(path.join(ROOT, 'sql', 'live-skus.txt'), 'utf8')
  .split('\n').filter(Boolean);
const liveSet = new Set(live);

console.log('dashboard SKUs :', todaySkus.length.toLocaleString());
console.log('Postgres SKUs  :', live.length.toLocaleString());

// ---- apply the page's own classifier to every live SKU ---------------------
const out = {}, unmatched = [];
live.forEach(s => {
  const c = R.classifySKU(s);
  if (!c || !c.key){ unmatched.push(s); return; }
  out[s] = c;
});
console.log('classified     :', Object.keys(out).length.toLocaleString());
console.log('no rule matched:', unmatched.length.toLocaleString(), '-> would go to Other');

// ---- THE TEST: do today's SKUs keep their section? -------------------------
let same = 0;
const moved = [], lost = [];
todaySkus.forEach(s => {
  if (!liveSet.has(s)){ lost.push(s); return; }
  const c = out[s];
  if (!c){ moved.push([s, today[s].key, '(no rule)']); return; }
  if (c.key === today[s].key) same++;
  else moved.push([s, today[s].key, c.key]);
});

console.log('\n=== the test ===');
console.log('same section   :', same.toLocaleString(), 'of', todaySkus.length.toLocaleString(),
            '(' + (100 * same / todaySkus.length).toFixed(2) + '%)');
console.log('MOVED section  :', moved.length.toLocaleString());
console.log('not in Postgres:', lost.length.toLocaleString());

if (moved.length){
  const pairs = {};
  moved.forEach(([s, from, to]) => {
    const k = from + ' -> ' + to;
    (pairs[k] = pairs[k] || []).push(s);
  });
  console.log('\nmoves, by pair:');
  Object.keys(pairs).sort((a, b) => pairs[b].length - pairs[a].length).forEach(k =>
    console.log('  ' + String(pairs[k].length).padStart(5) + '  ' + k.padEnd(22) +
                pairs[k].slice(0, 4).join(', ')));
}
if (lost.length){
  console.log('\non the dashboard but NOT in the Postgres set (' + lost.length + '):');
  console.log('  ' + lost.slice(0, 20).join(', '));
}

// ---- the SKUs Postgres has that the dashboard does not ---------------------
const added = live.filter(s => !today[s]);
console.log('\n=== what the refresh would ADD ===');
console.log('new SKUs       :', added.length.toLocaleString());
const bySec = {};
added.forEach(s => { const c = out[s]; const k = c ? c.key : 'OTHER';
                     (bySec[k] = bySec[k] || []).push(s); });
Object.keys(bySec).sort((a, b) => bySec[b].length - bySec[a].length).forEach(k =>
  console.log('  ' + k.padEnd(7) + String(bySec[k].length).padStart(5) + '   ' +
              bySec[k].slice(0, 3).join(', ')));

console.log('\n=== resulting section sizes ===');
const sizes = {};
live.forEach(s => { const c = out[s]; const k = c ? c.key : 'OTHER';
                    sizes[k] = (sizes[k] || 0) + 1; });
Object.keys(sizes).sort((a, b) => sizes[b] - sizes[a]).forEach(k => {
  const now = R.CATS[k] ? R.CATS[k].data.length : 0;
  const d = sizes[k] - now;
  console.log('  ' + k.padEnd(7) + String(sizes[k]).padStart(6) +
              '   (today ' + String(now).padStart(5) + ', ' + (d >= 0 ? '+' : '') + d + ')');
});
console.log('  ' + 'TOTAL'.padEnd(7) + String(live.length).padStart(6) +
            '   (today ' + todaySkus.length + ')');
