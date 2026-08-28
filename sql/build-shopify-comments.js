'use strict';
// Shopify price + Comments for every dashboard SKU, from listings.shopify_listings
// (wrong_sku = 0, all_list = 1), matched in STRICT priority order:
//
//   1  exact          sku = '<SKU>'              -> "Standalone — no extra item"
//   2  simplest combo exactly ONE '+'            -> "Combined with <Name> (<SKU>)"
//   3  pack           <SKU>NPK, alone or paired  -> "Sold as 2 Pack, combined with …"
//   4  complex combo  two or more '+'            -> every extra listed
//   5  nothing                                   -> "Not listed on Shopify"
//
// The simplest valid match always wins: a SKU that has a 2-part combo must never be
// priced from a six-item kit just because one exists.
//
// PASS 1 decides the match and writes out the accessory SKUs that need naming.
// PASS 2 (run again with NAMES set) writes the price and comment lookups.
//
//   TR=<dir> IDS=<id,id> [NAMES=<id>] node sql/build-shopify-comments.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

// ---- the listing side -------------------------------------------------------
// CHANNEL PRIORITY. LEDSone is the house store and wins at every tier; the others are
// a fallback used only where LEDSone carries no listing for that SKU or combo.
//
//   1 LEDSone         UK   the primary store
//   2 Electricalsone  UK
//   3 Vintagelite     UK
//   4 BesBet          UK
//   5 Dcvoltage       UK   ('dcvoltage' is the same store, differently cased)
//   6 LEDSone DE      Germany   } these are NOT pounds, so they never reach the price
//   7 LED Sone FR     France    } column — the comment names the store instead
//   8 LEDSone US      US        }
//   9 Relicelectrical Canada    }
const CHANNEL = [null, 'LEDSone', 'Electricalsone', 'Vintagelite', 'BesBet', 'Dcvoltage',
                 'LEDSone DE', 'LED Sone FR', 'LEDSone US', 'Relicelectrical'];
const GBP_UNTIL = 5;                    // channels 1-5 are UK stores priced in pounds

const listing = {};                     // lsku -> { ord: price, … }
// The refresh feeds this builder straight from sql/refresh/extract/price.js via
// LISTING=<file>. The tier and channel logic below is untouched — only where the rows
// come from changes, so there is still exactly one definition of the pricing rules.
if (process.env.LISTING){
  const j = JSON.parse(fs.readFileSync(process.env.LISTING, 'utf8'));
  Object.keys(j.listing).forEach(k => { listing[k] = j.listing[k]; });
} else
process.env.IDS.split(',').forEach(id => {
  const j = JSON.parse(fs.readFileSync(path.join(process.env.TR,
    'mcp-claude_ai_Ledsone_postgres-execute_sql-' + id + '.txt'), 'utf8'));
  String(Object.values(j.data.rows[0])[0]).split('\n').filter(Boolean).forEach(l => {
    const i = l.indexOf('|');
    const by = {};
    l.slice(i + 1).split(',').forEach(pair => {
      const [ord, p] = pair.split(':');
      const o = +ord, v = Number(p);
      if (by[o] === undefined || v < by[o]) by[o] = v;    // same store twice -> cheapest
    });
    listing[l.slice(0, i)] = by;
  });
});
// the best channel for a listing: LEDSone if it has it, else the next store down
const bestOrd = e => { if (!e) return null;
  for (let o = 1; o < CHANNEL.length; o++) if (e[o] !== undefined) return o;
  return null; };
const priceOf = e => { const o = bestOrd(e); return o === null ? null : e[o]; };

const skus = Object.keys(listing);
const parts = {};
skus.forEach(s => { parts[s] = s.split('+'); });
const combos = skus.filter(s => parts[s].length > 1);
const byComponent = {};
combos.forEach(s => parts[s].forEach(p => (byComponent[p] = byComponent[p] || []).push(s)));

// ---- helpers ----------------------------------------------------------------
// A pack count is a SINGLE digit, or 'A' for ten — the only two-digit size in the
// data is 10 and it is always written APK. Allowing two digits made LDCWGU1036PK
// read as a "36 Pack" when it is LDCWGU103 + 6PK, and stripped the 5 off LDGU10CW53PK.
const PACK = /^(\d|A)PK(-[A-Z]{2,3})?$/;
const PACK_A = 10;                     // confirmed from the listing titles: APK = 10 Pack
function selfPart(part, sku){          // is this component OUR sku, with or without a suffix?
  if (part === sku) return { self: true, pack: null };
  if (part.indexOf(sku) !== 0) return null;
  const tail = part.slice(sku.length);
  if (tail === '') return { self: true, pack: null };
  const m = PACK.exec(tail);
  if (m) return { self: true, pack: m[1] === 'A' ? PACK_A : parseInt(m[1], 10) };
  if (/^-[A-Z]{2,3}$/.test(tail)) return { self: true, pack: null };
  return null;
}
const packOf = s => { const m = /(\d|A)PK(-[A-Z]{2,3})?$/.exec(s);
                      return m ? (m[1] === 'A' ? PACK_A : parseInt(m[1], 10)) : null; };
const base = s => s.replace(/(\d|A)PK(-[A-Z]{2,3})?$/, '');

const SKUFILE = process.env.SKUFILE || path.join(ROOT, 'sql', 'dashboard-skus.txt');
const rows = fs.readFileSync(SKUFILE, 'utf8')
  .split('\n').filter(Boolean).map(l => l.split('\t'));

// ---- decide the match -------------------------------------------------------
const need = new Set();
const match = {};
rows.forEach(([, sku]) => {
  if (listing[sku]){ match[sku] = { tier: 'exact', lsku: sku, extras: [], n: 1 }; return; }

  const pool = [...new Set((byComponent[sku] || []).concat(
    combos.filter(s => s.indexOf(sku) !== -1 && parts[s].some(p => selfPart(p, sku)))))];
  const shaped = pool.map(s => {
    const own = parts[s].map(p => selfPart(p, sku));
    if (!own.some(Boolean)) return null;
    return { lsku: s, extras: parts[s].filter((p, i) => !own[i]),
             pack: own.find(Boolean).pack, n: parts[s].length };
  }).filter(Boolean);

  // 2. exactly one '+', neither side a pack
  const two = shaped.filter(x => x.n === 2 && !x.pack && !packOf(x.extras[0]));
  if (two.length){
    // channel first, price second: a LEDSone combo beats a cheaper Vintagelite one
    two.sort((a, b) => (bestOrd(listing[a.lsku]) || 99) - (bestOrd(listing[b.lsku]) || 99) ||
                       (priceOf(listing[a.lsku]) || 1e9) - (priceOf(listing[b.lsku]) || 1e9));
    match[sku] = Object.assign({ tier: 'combo2' }, two[0]);
    two[0].extras.forEach(e => need.add(e));
    return;
  }
  // 3. a pack — standalone (<SKU>2PK) or paired (<SKU>2PK+RPR44WH2PK)
  // A pack means THIS SKU sold in multiples — on its own, or paired with one
  // accessory. A four-item kit that merely contains a pack is a complex combo and
  // belongs in tier 4, however tempting the pack suffix looks.
  const packs = skus.filter(s => { const p = selfPart(s, sku); return p && p.pack; })
    .map(s => ({ lsku: s, extras: [], pack: selfPart(s, sku).pack, n: 1 }))
    .concat(shaped.filter(x => x.n === 2 && (x.pack || packOf(x.extras[0]))));
  if (packs.length){
    packs.sort((a, b) => a.n - b.n ||
      (bestOrd(listing[a.lsku]) || 99) - (bestOrd(listing[b.lsku]) || 99) ||
      (a.pack || 99) - (b.pack || 99));
    match[sku] = Object.assign({ tier: 'pack' }, packs[0]);
    (packs[0].extras || []).forEach(e => need.add(e));
    return;
  }
  // 4. the smallest, then cheapest, complex combo
  if (shaped.length){
    shaped.sort((a, b) => a.n - b.n ||
      (bestOrd(listing[a.lsku]) || 99) - (bestOrd(listing[b.lsku]) || 99) ||
      (priceOf(listing[a.lsku]) || 1e9) - (priceOf(listing[b.lsku]) || 1e9));
    match[sku] = Object.assign({ tier: 'combo3', alt: shaped.length }, shaped[0]);
    shaped[0].extras.forEach(e => need.add(e));
    return;
  }
  match[sku] = { tier: 'none' };
});

const tiers = {};
Object.keys(match).forEach(s => { tiers[match[s].tier] = (tiers[match[s].tier] || 0) + 1; });
console.log('dashboard SKUs      :', rows.length);
console.log('  1 exact           :', tiers.exact || 0);
console.log('  2 simplest combo  :', tiers.combo2 || 0);
console.log('  3 pack            :', tiers.pack || 0);
console.log('  4 complex combo   :', tiers.combo3 || 0);
console.log('  5 not listed      :', tiers.none || 0);

const accessories = [...new Set([...need].map(base).filter(Boolean))].sort();
fs.writeFileSync(path.join(process.env.OUTDIR || path.join(ROOT,'sql'), 'accessory-skus.txt'), accessories.join('\n') + '\n');
console.log('accessory SKUs      :', accessories.length, '-> sql/accessory-skus.txt');

if (process.env.PASS1){
  console.log('\nPASS 1 done. Fetch names for those SKUs, then re-run with NAMES=<result id>.');
  process.exit(0);
}

// ---- pass 2: names, price, comment -----------------------------------------
// Plain-word names for the accessories, from inventory.products.description, trimmed
// to something a picker can read at a glance. sql/accessory-names.txt.
const NAME = {};
fs.readFileSync(path.join(ROOT, 'sql', 'accessory-names.txt'), 'utf8')
  .split('\n').filter(Boolean).forEach(l => {
    const i = l.indexOf('|');
    NAME[l.slice(0, i).trim()] = l.slice(i + 1).replace(/\s+/g, ' ').trim();
  });
// "RPR44WH" -> "Universal Reducer Plate (RPR44WH)"; a 2PK keeps its own code
// Regional suffixes (-IDE, -CA, -US) name the same product, so they fall back to the
// base SKU's description rather than showing a bare code.
// Regional and duplicate-listing suffixes name the SAME product: -IDE, -CA, and the
// trailing _ / _1 the catalogue uses for a re-listed SKU. They fall back to the base
// SKU's description rather than showing a bare code.
const strip = s => base(s).replace(/-(IDE|CA|US|DE|FR|NL)$/, '').replace(/_\d*$/, '');
const label = s => {
  const nm = NAME[base(s)] || NAME[strip(s)];
  return nm ? nm + ' (' + s + ')' : s;
};
const list = a => a.length === 1 ? label(a[0])
  : a.slice(0, -1).map(label).join(', ') + ' and ' + label(a[a.length - 1]);

// Where no UK store carries the SKU, the foreign price is still worth showing — a
// picker asking "why is there no price?" deserves the answer on the row, not a blank.
// It is kept SEPARATE from PRICE so it can never be read as pounds.
const CURRENCY = { 'LEDSone DE': ['\u20ac', 'EUR'], 'LED Sone FR': ['\u20ac', 'EUR'],
                   'LEDSone US': ['$', 'USD'], 'Relicelectrical': ['C$', 'CAD'] };
const PRICE = {}, ALT = {}, COMMENT = {};
const stat = { ledsone: 0, otherUk: 0, nonGbp: 0, none: 0 };
const chanCount = {};
rows.forEach(([, sku]) => {
  const m = match[sku];
  if (m.tier === 'none'){ COMMENT[sku] = 'Not listed on Shopify'; stat.none++; return; }
  const e = listing[m.lsku];
  const ord = bestOrd(e);
  const chan = ord ? CHANNEL[ord] : null;
  if (chan) chanCount[chan] = (chanCount[chan] || 0) + 1;

  // Only a UK store's figure reaches the price column: it is labelled in pounds, and a
  // euro or Canadian dollar amount rendered as "£31.49" is a wrong number.
  if (ord && ord <= GBP_UNTIL){ PRICE[sku] = e[ord]; ord === 1 ? stat.ledsone++ : stat.otherUk++; }
  else if (ord){ const cur = CURRENCY[chan] || ['', ''];
                 ALT[sku] = [e[ord], cur[0], cur[1], chan]; stat.nonGbp++; }
  else stat.nonGbp++;

  let txt;
  if (m.tier === 'exact')       txt = 'Standalone — no extra item';
  else if (m.tier === 'combo2') txt = 'Combined with ' + label(m.extras[0]);
  else if (m.tier === 'pack')   txt = 'Sold as ' + (m.pack || packOf(m.lsku)) + ' Pack' +
                                      (m.extras && m.extras.length ? ', combined with ' + list(m.extras) : '');
  else                          txt = 'Combined with ' + list(m.extras) +
                                      (m.alt > 1 ? ' (' + m.alt + ' combos)' : '');
  // LEDSone is the default and goes unsaid; anything else is named, because the reader
  // needs to know the number did not come from the house store.
  if (ord && ord !== 1) txt += ' — not on LEDSone, ' + chan + ' listing' +
                               (ord > GBP_UNTIL ? ' (not in pounds)' : '');
  COMMENT[sku] = txt;
});

const ODIR = process.env.OUTDIR || path.join(ROOT, 'sql');
fs.writeFileSync(path.join(ODIR, 'shopify-price_data.json'), JSON.stringify(PRICE));
fs.writeFileSync(path.join(ODIR, 'shopify-alt-price_data.json'), JSON.stringify(ALT));
fs.writeFileSync(path.join(ODIR, 'shopify-comments.json'), JSON.stringify(COMMENT));
fs.writeFileSync(path.join(ODIR, 'shopify-comments.csv'),
  'SKU,Comments\n' + rows.map(([, s]) => s + ',"' + COMMENT[s].replace(/"/g, '""') + '"').join('\n') + '\n');

console.log('\npriced from LEDSone      :', stat.ledsone);
console.log('priced from another UK store:', stat.otherUk);
console.log('listed only outside the UK  :', stat.nonGbp, '(no price shown)');
console.log('not listed anywhere         :', stat.none);
console.log('foreign-currency prices captured:', Object.keys(ALT).length);
console.log('accessories named           :', Object.keys(NAME).length);
console.log('\nmatches by channel:');
Object.keys(chanCount).sort((a, b) => chanCount[b] - chanCount[a])
  .forEach(k => console.log('  ' + k.padEnd(18) + chanCount[k]));
