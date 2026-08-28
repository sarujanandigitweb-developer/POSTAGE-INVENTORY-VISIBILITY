'use strict';
// Verifies the rechecked Shopify price + Comments pair: the five tiers, the priority
// order, and that the price on screen and the comment always describe the SAME
// listing. Read-only.
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
  body + '\n; sandbox.out = { CATS, SHOPIFY_PRICE, SHOPIFY_COMMENT, price };')
  (sb, document, { addEventListener(){}, matchMedia: () => ({matches:false, addEventListener(){}}) },
   { getItem: () => null, setItem(){} });
const { CATS, SHOPIFY_PRICE, SHOPIFY_COMMENT } = sb.out;

const rows = [].concat(...Object.keys(CATS).map(k => CATS[k].data));
// the market suffix is a note on the row, not a different kind of match
const tier = raw => ((t) =>
    t === 'Standalone — no extra item'          ? 'exact'
  : t === 'Not listed on Shopify'               ? 'none'
  : /^Sold as \d+ Pack/.test(t)                 ? 'pack'
  : /^Combined with .+ and /.test(t)            ? 'combo3'
  : /^Combined with /.test(t)                   ? 'combo2'
  : 'UNKNOWN')(String(raw).replace(/ — not on LEDSone,.*$/, ''));

// the store suffix is a note, not part of the match — strip it before counting names
const bare = t => String(t).replace(/ — not on LEDSone,.*$/, '');
const chk = (l, ok, x) => console.log((ok ? 'OK   ' : '**** ') + l + (x === undefined ? '' : '  ' + x));
const count = {};
rows.forEach(r => { const k = tier(r.cm); count[k] = (count[k] || 0) + 1; });

console.log('rows          :', rows.length);
Object.keys(count).sort().forEach(k => console.log('  ' + k.padEnd(8) + count[k]));
console.log('priced        :', rows.filter(r => typeof r.p === 'number').length);
console.log('lookup entries:', Object.keys(SHOPIFY_PRICE).length,
            'prices /', Object.keys(SHOPIFY_COMMENT).length, 'comments');

console.log('\n-- the five tiers --');
chk('every row carries a comment', rows.every(r => r.cm));
chk('no comment falls outside the five shapes', !count.UNKNOWN,
    (rows.find(r => tier(r.cm) === 'UNKNOWN') || {}).cm);
chk('the comment lookup covers every dashboard SKU',
    Object.keys(SHOPIFY_COMMENT).length === rows.length);

console.log('\n-- price and comment describe the SAME listing --');
const chanOf = r => { const m = / — not on LEDSone, (.+?) listing/.exec(r.cm); return m ? m[1] : 'LEDSone'; };
const nonGbp = r => /\(not in pounds\)$/.test(r.cm);
const UK_CH = ['LEDSone','Electricalsone','Vintagelite','BesBet','Dcvoltage'];
chk('every row on a UK store shows a price',
    rows.filter(r => tier(r.cm) !== 'none' && !nonGbp(r)).every(r => typeof r.p === 'number'),
    rows.filter(r => tier(r.cm) !== 'none' && !nonGbp(r) && typeof r.p !== 'number').length + ' unpriced');
chk('a SKU listed only outside the UK shows NO price, and says which store',
    rows.filter(nonGbp).every(r => typeof r.p !== 'number' && / listing \(not in pounds\)$/.test(r.cm)),
    rows.filter(nonGbp).length + ' such rows');

console.log('\n-- channel priority: LEDSone first, always --');
const byChan = {};
rows.filter(r => tier(r.cm) !== 'none').forEach(r => { const c = chanOf(r); byChan[c] = (byChan[c] || 0) + 1; });
Object.keys(byChan).sort((a,b) => byChan[b] - byChan[a])
  .forEach(k => console.log('  ' + k.padEnd(18) + byChan[k]));
chk('a comment names its store ONLY when it is not LEDSone',
    rows.filter(r => chanOf(r) === 'LEDSone').every(r => !/not on LEDSone/.test(r.cm)));
chk('every named fallback store is a real channel',
    rows.filter(r => chanOf(r) !== 'LEDSone')
        .every(r => UK_CH.concat(['LEDSone DE','LED Sone FR','LEDSone US','Relicelectrical'])
                        .indexOf(chanOf(r)) !== -1),
    (rows.find(r => chanOf(r) !== 'LEDSone' && UK_CH.concat(['LEDSone DE','LED Sone FR','LEDSone US','Relicelectrical']).indexOf(chanOf(r)) === -1) || {}).cm);
chk('a price is shown only for a UK store',
    rows.filter(r => typeof r.p === 'number').every(r => UK_CH.indexOf(chanOf(r)) !== -1),
    (rows.find(r => typeof r.p === 'number' && UK_CH.indexOf(chanOf(r)) === -1) || {}).cm);
chk('no row that says "Not listed" shows a price',
    rows.filter(r => tier(r.cm) === 'none').every(r => typeof r.p !== 'number'));
chk('every price is a plain positive number',
    rows.filter(r => typeof r.p === 'number').every(r => r.p > 0));
chk('no unresolvable range survives — one listing, one price',
    rows.every(r => !(r.pn > 1 && r.p === null)));

console.log('\n-- the priority order --');
chk('a standalone comment never names an accessory',
    rows.filter(r => tier(r.cm) === 'exact').every(r => bare(r.cm).indexOf('(') === -1));
chk('a 2-part combo names exactly ONE accessory',
    rows.filter(r => tier(r.cm) === 'combo2')
        .every(r => (bare(r.cm).match(/\(/g) || []).length === 1),
    (rows.find(r => tier(r.cm) === 'combo2' && (bare(r.cm).match(/\(/g) || []).length !== 1) || {}).cm);
chk('a complex combo names two or more',
    rows.filter(r => tier(r.cm) === 'combo3')
        .every(r => (bare(r.cm).match(/\(/g) || []).length >= 2));
chk('every pack states a real size, 2 to 10',
    rows.filter(r => tier(r.cm) === 'pack')
        .every(r => { const n = +/^Sold as (\d+) Pack/.exec(r.cm)[1]; return n >= 2 && n <= 10; }),
    [...new Set(rows.filter(r => tier(r.cm) === 'pack')
        .map(r => +/^Sold as (\d+) Pack/.exec(r.cm)[1]))].sort((a,b)=>a-b).join(', '));
chk('no pack size is three digits — the greedy-digit bug stays fixed',
    rows.every(r => !/Sold as \d{3,} Pack/.test(r.cm)));
chk('every named accessory reads in plain words, not a bare code',
    rows.filter(r => /Combined with/.test(r.cm))
        .every(r => /Combined with [^(]*\(/.test(bare(r.cm))),
    (rows.find(r => /Combined with/.test(r.cm) && !/Combined with [^(]*\(/.test(r.cm)) || {}).cm);

// Verified against the listing source, not inferred from the build's own ordering.
chk('a fallback store is used ONLY where LEDSone has no such listing', (() => {
  const onLedsone = new Set();
  process.env.IDS.split(',').forEach(id => {
    const j = JSON.parse(fs.readFileSync(path.join(process.env.TR,
      'mcp-claude_ai_Ledsone_postgres-execute_sql-' + id + '.txt'), 'utf8'));
    String(Object.values(j.data.rows[0])[0]).split('\n').filter(Boolean).forEach(l => {
      const i = l.indexOf('|');
      if (/(^|,)1:/.test(l.slice(i + 1))) onLedsone.add(l.slice(0, i));
    });
  });
  // every SKU that fell back must itself be absent from LEDSone
  const bad = rows.filter(r => chanOf(r) !== 'LEDSone' && tier(r.cm) !== 'none')
                  .filter(r => onLedsone.has(r.s));
  console.log('       (' + onLedsone.size.toLocaleString() + ' SKUs carry a LEDSone listing)');
  if (bad.length) console.log('       e.g. ' + bad[0].s + ' — ' + bad[0].cm);
  return bad.length === 0;
})());

console.log('\n-- the reducer-plate case named in the brief --');
const rp = rows.filter(r => /RPR44WH\)/.test(r.cm));
console.log('  SKUs paired with the Universal Reducer Plate:', rp.length);
if (rp.length) console.log('  e.g. ' + rp[0].s + ' — ' + rp[0].cm + '  (£' + rp[0].p + ')');
chk('  each of those is a 2-part combo, not a bigger kit',
    rp.every(r => tier(r.cm) === 'combo2'));

console.log('\n-- worked examples --');
['CRSF100BM','LSCY290BM','CRSF100LBM','LHTMGU10BM','LHSIE27CH','LHTHT30GD'].forEach(s => {
  const r = rows.find(x => x.s === s);
  if (r) console.log('  ' + s.padEnd(13) + (r.p === null ? '   —   ' : ('£' + r.p).padEnd(8)) + r.cm);
});
