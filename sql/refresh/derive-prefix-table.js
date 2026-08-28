'use strict';
// Builds the COMPLETE prefix -> (section, family, type) table by induction from the
// 5,852 rows the dashboard shows today, then proves it reproduces every one of them.
//
// Why induction rather than a hand-written table: the rules for Lamp Spares (29 types)
// and Lighting (5) only ever existed inside extraction SQL that was never saved into
// the page, so `classifySKU` cannot classify those sections at all — it reproduces just
// 60% of the current assignments. The rows themselves are the surviving record of those
// rules, and they are the logic actually in use.
//
// The table is longest-prefix-first. A prefix is only accepted where EVERY current row
// carrying it agrees on the section, family and type; where rows disagree, a longer
// prefix is tried, exactly as the existing SUB4 derivation does.
//
//   node sql/refresh/derive-prefix-table.js
const fs = require('fs');
const path = require('path');
const { load } = require('./rules.js');

const ROOT = path.resolve(__dirname, '..', '..');
const R = load();

// ---- today's assignments ----------------------------------------------------
const rows = [];
Object.keys(R.CATS).forEach(key => R.CATS[key].data.forEach(r => {
  // `f` may already have been re-typed in memory (Wall Arm 11->4, Bulbs series->BLD,
  // Handles->HL, Others). `ws`/`sr`/`osub` hold what it was BEFORE that, and the
  // refresh must emit the pre-merge value so the page's own re-typing still applies.
  const f = r.ws || (r.sr ? seriesCode(r) : null) || r.osub_f || r.f;
  rows.push({ s: r.s, key, f, t: r.osub || r.t, x: r.x ? 1 : 0, mt: r.mt || null,
              sh: r.sh || null, ft: r.ft || null, sr: r.sr || null });
}));
function seriesCode(r){
  // LB_DATA rows arrive with f = the banner series code and are re-typed to BLD at load
  const inv = Object.keys(R.LB_SERIES).find(k => R.LB_SERIES[k] === r.sr);
  return inv || r.sr;
}

const KEYSET = {};
rows.forEach(r => { KEYSET[r.key] = (KEYSET[r.key] || 0) + 1; });
console.log('rows today:', rows.length, JSON.stringify(KEYSET));

// ---- induction ---------------------------------------------------------------
// For every length 2..10, group the rows by that prefix. A prefix is USABLE when every
// row under it shares the same (key, f, t). Shorter is preferred, so a longer prefix is
// only emitted where the shorter one is ambiguous.
const sig = r => r.key + '' + r.f + '' + r.t;
const table = [];                      // { p, key, f, t, n }
const covered = new Set();

for (let len = 2; len <= 12; len++){
  const g = {};
  rows.forEach(r => {
    if (covered.has(r.s)) return;
    if (r.s.length < len) return;
    const p = r.s.slice(0, len);
    (g[p] = g[p] || []).push(r);
  });
  Object.keys(g).forEach(p => {
    const set = g[p];
    const sigs = new Set(set.map(sig));
    if (sigs.size !== 1) return;                    // ambiguous at this length
    // do not accept a prefix that would also swallow rows of another signature that
    // are longer than this group (they are covered later, but the table is greedy)
    const clash = rows.some(r => !covered.has(r.s) && r.s.indexOf(p) === 0 && sig(r) !== sig(set[0]));
    if (clash) return;
    const one = set[0];
    table.push({ p, key: one.key, f: one.f, t: one.t, n: set.length });
    set.forEach(r => covered.add(r.s));
  });
}

const left = rows.filter(r => !covered.has(r.s));
table.sort((a, b) => b.p.length - a.p.length || a.p.localeCompare(b.p));
console.log('prefix rules derived:', table.length);
console.log('rows covered        :', covered.size, 'of', rows.length);
console.log('rows with NO usable prefix:', left.length);
if (left.length) console.log('  ' + left.slice(0, 12).map(r => r.s + ' [' + r.key + '/' + r.f + ']').join(', '));

// ---- prove it reproduces today ------------------------------------------------
function classify(sku){
  for (let i = 0; i < table.length; i++) if (sku.indexOf(table[i].p) === 0) return table[i];
  return null;
}
let ok = 0; const bad = [];
rows.forEach(r => {
  const c = classify(r.s);
  if (c && c.key === r.key && c.f === r.f && c.t === r.t) ok++;
  else bad.push([r.s, r.key + '/' + r.f + '/' + r.t, c ? c.key + '/' + c.f + '/' + c.t : '(none)']);
});
console.log('\n=== reproduction test ===');
console.log('reproduced exactly:', ok, 'of', rows.length,
            '(' + (100 * ok / rows.length).toFixed(2) + '%)');
console.log('wrong             :', bad.length);
bad.slice(0, 15).forEach(b => console.log('   ' + b[0].padEnd(16) + b[1].padEnd(34) + '-> ' + b[2]));

// ---- two-tier fallback --------------------------------------------------------
// A new SKU can carry a 4-char prefix nobody has seen, because material and subtype are
// NOT derivable from the SKU for the sheet-defined sections — LSBF3BWG is a lampshade,
// but nothing in "LSBF" says which material. Dropping it into a global Other loses the
// one thing the SKU DOES say: LS means Lampshade.
//
// So: exact prefix first; failing that, the section from the page's own 2-char CLASSIFY
// table, with the section's existing Others bucket carrying the type. Only a SKU that
// matches neither reaches the global Other section.
function classifyFull(sku){
  const exact = classify(sku);
  if (exact) return { key: exact.key, f: exact.f, t: exact.t, how: 'prefix' };
  const two = R.CLASSIFY[sku.slice(0, 2)];
  if (two) return { key: two.key, f: two.key + 'OT', t: 'Others', how: 'section' };
  return null;
}

// ---- apply to the live catalogue ---------------------------------------------
const live = fs.readFileSync(path.join(ROOT, 'sql', 'live-skus.txt'), 'utf8')
  .split('\n').filter(Boolean);
const sizes = {}, other = [], viaSection = [];
live.forEach(s => {
  const c = classifyFull(s);
  if (!c){ other.push(s); sizes.OTHER = (sizes.OTHER || 0) + 1; return; }
  if (c.how === 'section') viaSection.push(s + ' -> ' + c.key);
  sizes[c.key] = (sizes[c.key] || 0) + 1;
});
console.log('\n=== applied to the live catalogue ===');
Object.keys(sizes).sort((a, b) => sizes[b] - sizes[a]).forEach(k => {
  const now = k === 'OTHER' ? 0 : (R.CATS[k] ? R.CATS[k].data.length : 0);
  const d = sizes[k] - now;
  console.log('  ' + k.padEnd(7) + String(sizes[k]).padStart(6) +
              '  (today ' + String(now).padStart(5) + ', ' + (d >= 0 ? '+' : '') + d + ')');
});
console.log('  TOTAL  ' + String(live.length).padStart(6));
console.log('\nsection known, type unknown -> that section\'s Others:', viaSection.length);
console.log('  ' + viaSection.slice(0, 12).join(', '));
console.log('\nno rule at all -> global Other:', other.length);
console.log('  ' + other.slice(0, 25).join(', '));

if (!bad.length){
  fs.writeFileSync(path.join(ROOT, 'sql', 'refresh', 'prefix-table.json'), JSON.stringify(table, null, 0));
  console.log('\nwritten: sql/refresh/prefix-table.json');
} else {
  console.log('\nNOT written — the table must reproduce today exactly before it can be used.');
}
