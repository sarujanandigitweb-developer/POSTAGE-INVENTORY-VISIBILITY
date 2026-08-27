'use strict';
// Replaces the Shopify price and the Comments column with the rechecked pair, both
// taken from listings.shopify_listings (wrong_sku = 0, all_list = 1) under one strict
// priority order: exact SKU, then a 2-part combo, then a pack, then a larger combo.
//
// The price and the comment ALWAYS come from the same listing, so the comment names
// the listing the number on screen was actually read from.
//
//   node sql/apply-shopify-recheck.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'dashboard', 'inventory-dashboard.html');
let src = fs.readFileSync(FILE, 'utf8');
const orig = src.length;
function span(name){
  const a = src.indexOf('const ' + name + ' = {');
  if (a < 0) throw new Error('not found ' + name);
  const s = src.indexOf('{', a);
  let d = 0;
  for (let p = s; p < src.length; p++){
    if (src[p] === '{') d++;
    else if (src[p] === '}'){ d--; if (!d) return [s, p + 1]; }
  }
  throw new Error('unbalanced ' + name);
}
function sub(a, b, what){
  if (src.indexOf(a) < 0) throw new Error('anchor not found: ' + what);
  src = src.replace(a, b);
}

const PRICE = JSON.parse(fs.readFileSync(path.join(ROOT, 'sql', 'shopify-price_data.json'), 'utf8'));
const COMMENT = JSON.parse(fs.readFileSync(path.join(ROOT, 'sql', 'shopify-comments.json'), 'utf8'));

let r = span('SHOPIFY_PRICE');
src = src.slice(0, r[0]) + JSON.stringify(PRICE) + src.slice(r[1]);
r = span('SHOPIFY_COMMENT');
src = src.slice(0, r[0]) + JSON.stringify(COMMENT) + src.slice(r[1]);

// the source and the rule both changed, so the comments above them must say so
sub('// A number is an exact price; an array is [channels, low, high] for the 18 SKUs\n' +
    '// where UK stores still disagree. A SKU absent here has no UK Shopify listing.',
    '// RECHECKED against listings.shopify_listings (wrong_sku = 0, all_list = 1) under one\n' +
    '// strict priority: exact SKU, then a 2-part combo, then a pack, then a larger combo.\n' +
    '// The simplest valid listing always wins, so a SKU is never priced from a six-item\n' +
    '// kit when a standalone or 2-part listing exists. Every value is a plain number and\n' +
    '// comes from the SAME listing the Comments column names.', 'price header');

sub("  return na('Not available: this SKU has no UK Shopify listing with a price above zero ' +\n" +
    "    '(public.listing_data, which_channel = 3, wrong_sku = 0).');",
    "  return na('Not listed on Shopify: no exact SKU, no combo and no pack listing exists ' +\n" +
    "    'in listings.shopify_listings (wrong_sku = 0, all_list = 1).');", 'no-price reason');

fs.writeFileSync(FILE, src);
const n = Object.keys(PRICE).length;
console.log('prices  :', n);
console.log('comments:', Object.keys(COMMENT).length);
console.log('inventory-dashboard.html', orig, '->', src.length, 'chars  (' +
            (src.length - orig >= 0 ? '+' : '') + (src.length - orig) + ')');
