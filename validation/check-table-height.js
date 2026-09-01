#!/usr/bin/env node
/* The table box must never be able to collapse to nothing.
   It did on 1 Sep 2026: the hub page adds its own breadcrumb bar above us, so
   on a laptop screen the fixed chrome was taller than the viewport, `flex:1`
   resolved to 0px, and every tab showed a header with no rows under it. */
const fs = require('fs');
const F = __dirname + '/../dashboard/inventory-dashboard.html';
const css = /<style>([\s\S]*?)<\/style>/.exec(fs.readFileSync(F, 'utf8'))[1];

const fail = [];
const ruleOf = sel => {
  const m = new RegExp('\\n' + sel.replace('.', '\\.') + '[,{][^}]*', 'g').exec(css);
  return m ? m[0] : null;
};

// 1. every panel that holds a table needs a real floor, not min-height:0
for (const sel of ['.wrap', '.fxwrap', '.smwrap']) {
  const r = ruleOf(sel);
  if (!r) { fail.push(`${sel}: rule missing`); continue; }
  const mh = /min-height:\s*(\d+)px/.exec(r);
  if (!mh) fail.push(`${sel}: min-height is not a px floor — it can collapse to 0`);
  else if (+mh[1] < 240) fail.push(`${sel}: floor ${mh[1]}px is under 240px (fewer than ~4 rows)`);
  else console.log(`  ${sel.padEnd(9)} floor ${mh[1]}px  OK`);
}

// 2. nothing may clip that overflow away at the page level
if (/\nbody\{[^}]*overflow\s*:\s*hidden/.test(css))
  fail.push('body has overflow:hidden — the overflow would be clipped, not scrollable');
else console.log('  body     does not clip overflow  OK');

// 3. the height-based media queries that reclaim chrome space must exist
for (const q of ['max-height: 900px', 'max-height: 780px']) {
  if (css.includes('@media (' + q + ')')) console.log(`  @media (${q})  present  OK`);
  else fail.push(`missing height media query: ${q}`);
}

// 4. the short-screen overrides must lower the floor (so the page does not
//    scroll and take the sticky table header with it) but never to nothing
for (const q of ['900', '780']) {
  const blk = new RegExp('@media \\(max-height: ' + q + 'px\\)\\{([\\s\\S]*?)\\n\\}').exec(css);
  if (!blk) { fail.push(`@media max-height ${q}px: block missing`); continue; }
  for (const m of blk[1].matchAll(/min-height:\s*(\d+)px/g)) {
    if (+m[1] < 150) fail.push(`@media max-height ${q}px: floor ${m[1]}px is too small`);
  }
  console.log(`  @media ${q}px overrides floor  OK`);
}

// 5. the search row must not carry padding on both .tbar and .status there
if (!/@media \(max-height: 900px\)\{[\s\S]*?\.status\{padding:2px 0/.test(css))
  fail.push('short-screen .status padding not flattened — the search row wastes ~20px');
else console.log('  search row flattened on short screens  OK');

if (fail.length) { console.error('\nFAILED:'); fail.forEach(f => console.error('  - ' + f)); process.exit(1); }
console.log('\nALL CHECKS PASSED');
