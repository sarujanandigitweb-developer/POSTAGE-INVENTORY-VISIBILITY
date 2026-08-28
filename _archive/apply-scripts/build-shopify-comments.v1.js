'use strict';
// Builds the "Comments" column: for every SKU on the dashboard, HOW its Shopify price
// was found in listings.shopify_listings (wrong_sku = 0, all_list = 1).
//
//   1 exact       sku = '<SKU>'            -> "Standalone — no extra item"
//   2 pack        sku ~ '^<SKU>(\d+|A)PK$' -> "Sold as 6 Pack (SKU: LDCWGU1036PK)"
//   3 combo       sku ILIKE '%<SKU>%' and the match contains '+'
//                                          -> name the other components
//   4 nothing                              -> "Not listed on Shopify"
//
// A tier-3 match that does NOT contain '+' is not a combo - it is a regional or
// variant SKU (…-CA, …-IDE). Calling that "Combined with" would name an accessory
// that does not exist, so it gets its own wording.
//
// PACK TOKEN 'A' = 10. Not a guess: 79 SKUs ending APK carry listing titles reading
// "10 Pack" / "10 Pcs", with no other count anywhere in the set.
//
//   TR=<dir with the saved query results> FILES=a.txt,b.txt,c.txt node sql/build-shopify-comments.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TR = process.env.TR;

let listing = [];
process.env.FILES.split(',').forEach(f => {
  const j = JSON.parse(fs.readFileSync(path.join(TR, f), 'utf8'));
  listing = listing.concat(String(Object.values(j.data.rows[0])[0]).split('\n').filter(Boolean));
});
listing = [...new Set(listing)];
const exact = new Set(listing);
const combos = listing.filter(s => s.indexOf('+') !== -1).map(s => ({ full: s, parts: s.split('+') }));
const others = listing.filter(s => s.indexOf('+') === -1);

const PACK_A = 10;                       // 'A' pack token, confirmed from listing titles
const packSize = tok => tok === 'A' ? PACK_A : parseInt(tok, 10);
const words = n => n + ' Pack';

// a combo component is "ours" if it is the SKU, or the SKU plus a pack/region suffix
function isOurs(part, sku){
  if (part === sku) return true;
  if (part.indexOf(sku) !== 0) return false;
  const tail = part.slice(sku.length);
  return tail === '' || /^(\d+|A)PK$/.test(tail) || /^-[A-Z]{2,3}$/.test(tail) ||
         /^(\d+|A)PK-[A-Z]{2,3}$/.test(tail);
}

const rows = fs.readFileSync(path.join(ROOT, 'sql', 'dashboard-skus.txt'), 'utf8')
  .split('\n').filter(Boolean).map(l => l.split('\t'));

// Which rows actually SHOW a price. The dashboard prices from an exact SKU match in
// public.listing_data, so a pack / combo / variant row has no price of its own - and
// the comment must say that rather than pointing at a SKU whose price is not on screen.
const PRICED = (() => {
  const html = fs.readFileSync(path.join(ROOT, 'dashboard', 'inventory-dashboard.html'), 'utf8');
  const o = html.indexOf('<script>');
  const body = html.slice(o + 8, html.indexOf('const state = {'));
  const el = { addEventListener(){}, appendChild(){}, style:{}, classList:{ add(){}, remove(){}, toggle(){} } };
  const document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
                     createElement: () => el, addEventListener(){}, documentElement: el, body: el };
  const sb = { console, out: null };
  new Function('sandbox','document','window','localStorage', body + '\n; sandbox.out = { CATS };')
    (sb, document, { addEventListener(){}, matchMedia: () => ({matches:false, addEventListener(){}}) },
     { getItem: () => null, setItem(){} });
  const set = new Set();
  Object.keys(sb.out.CATS).forEach(k => sb.out.CATS[k].data.forEach(r => {
    if (typeof r.p === 'number' || (r.pn && r.pn > 1)) set.add(r.s);
  }));
  return set;
})();

const tally = { exact: 0, pack: 0, combo: 0, variant: 0, none: 0 };
const out = [];

rows.forEach(([sec, sku]) => {
  // ---- 1. exact ------------------------------------------------------------
  if (exact.has(sku)){ out.push([sec, sku, PRICED.has(sku) ? 'Standalone' : 'Listed, no price', 'exact']);
    tally.exact++; return; }

  // ---- 2. pack -------------------------------------------------------------
  // 1-2 digits only. A greedy \d+ read ICST64E27403PK as ICST64E27 + "403PK", when it
  // is really ICST64E2740 (a 40W bulb) + 3PK. Pack counts are never three digits.
  const re = new RegExp('^' + sku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d{1,2}|A)PK(-[A-Z]{2,3})?$');
  const packs = [];
  others.forEach(s => { const m = re.exec(s); if (m) packs.push({ sku: s, n: packSize(m[1]), region: m[2] || '' }); });
  if (packs.length){
    packs.sort((a, b) => a.n - b.n);
    const uk = packs.filter(p => !p.region);
    const use = uk.length ? uk : packs;
    // name the SKU the price actually comes from FIRST - that is the question the
     // Comments column has to answer. Where several pack sizes exist the smallest is
     // the one quoted, and the others are listed after it.
    const txt = (use.length === 1 ? words(use[0].n) : use.map(p => p.n).join(', ') + ' Pack') +
                ' — ' + use[0].sku;
    out.push([sec, sku, txt + (uk.length ? '' : ' (non-UK)'), 'pack']);
    tally.pack++;
    return;
  }

  // ---- 3. combo ------------------------------------------------------------
  const hits = combos.filter(c => c.full.indexOf(sku) !== -1);
  if (hits.length){
    hits.sort((a, b) => a.parts.length - b.parts.length || a.full.length - b.full.length);
    const c = hits[0];
    const extra = c.parts.filter(p => !isOurs(p, sku));
    let txt;
    if (!extra.length){
      txt = 'Multipack — ' + c.full;
    } else {
      // at most two names - the column has to stay scannable
      txt = 'Combo with ' + extra.slice(0, 2).join(', ') +
            (extra.length > 2 ? ' +' + (extra.length - 2) : '');
    }
    if (hits.length > 1) txt += ' (' + hits.length + ' combos)';
    out.push([sec, sku, txt, 'combo']);
    tally.combo++;
    return;
  }

  // ---- 3b. a superstring that is NOT a combo: a regional or variant SKU ----
  const var_ = others.filter(s => s !== sku && s.indexOf(sku) !== -1);
  if (var_.length){
    var_.sort((a, b) => a.length - b.length);
    out.push([sec, sku, 'Variant — ' + var_[0], 'variant']);
    tally.variant++;
    return;
  }

  out.push([sec, sku, 'Not listed', 'none']);
  tally.none++;
});

fs.writeFileSync(path.join(ROOT, 'sql', 'shopify-comments.csv'),
  'SKU,Comments\n' + out.map(r => r[1] + ',"' + r[2].replace(/"/g, '""') + '"').join('\n') + '\n');
fs.writeFileSync(path.join(ROOT, 'sql', 'shopify-comments.json'),
  JSON.stringify(out.reduce((a, r) => (a[r[1]] = r[2], a), {})));
fs.writeFileSync(path.join(ROOT, 'sql', 'not-listed-skus.txt'),
  out.filter(r => r[3] === 'none').map(r => r[0] + '\t' + r[1]).join('\n') + '\n');

console.log('distinct listing SKUs :', listing.length, '(combos ' + combos.length + ')');
console.log('dashboard rows        :', rows.length);
console.log('  1 standalone exact  :', tally.exact);
console.log('  2 pack              :', tally.pack);
console.log('  3 combo             :', tally.combo);
console.log('  3b variant SKU only :', tally.variant);
console.log('  4 not listed        :', tally.none);

const sizes = {};
out.filter(r => r[3] === 'pack').forEach(r => {
  (r[2].match(/(\d+) Pack/g) || []).forEach(m => { sizes[m] = (sizes[m] || 0) + 1; });
});
console.log('\npack sizes found:');
Object.keys(sizes).sort((a, b) => parseInt(a) - parseInt(b))
  .forEach(k => console.log('  ' + k.padEnd(9) + sizes[k]));
