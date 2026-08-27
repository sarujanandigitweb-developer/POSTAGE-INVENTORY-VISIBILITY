'use strict';
// Adds the "Price Comment" column to dashboard/inventory-dashboard.html.
//
// It says HOW each row's Shopify price was found in listings.shopify_listings
// (wrong_sku = 0, all_list = 1):
//
//   Standalone                      exact SKU match - the price on this row is its own
//   Listed, no price                exact match exists but no UK price is recorded
//   6 Pack — LDCWGU1036PK           sold only as a pack; this row has no price of its own
//   Combo with CRSF2003BM, …        sold only inside a combo; no price of its own
//   Variant — LSCACU300CH-IDE       listed only under a regional/variant SKU
//   Not listed                      nothing in the listing table at all
//
// Built by sql/build-shopify-comments.js. Merged at load as a separate lookup, so every
// embedded dataset stays byte-identical.
//
//   node sql/apply-price-comment.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'dashboard', 'inventory-dashboard.html');
let src = fs.readFileSync(FILE, 'utf8');
const orig = src.length;
if (src.indexOf('const SHOPIFY_COMMENT = ') >= 0){
  console.error('SHOPIFY_COMMENT is already present - nothing to do.');
  process.exit(1);
}
const COM = JSON.parse(fs.readFileSync(path.join(ROOT, 'sql', 'shopify-comments.json'), 'utf8'));

function sub(a, b, what){
  if (src.indexOf(a) < 0) throw new Error('anchor not found: ' + what);
  src = src.replace(a, b);
}

// ---- 1. the lookup, declared beside the price it explains --------------------
sub("const CATS = {", `// ---- how each Shopify price was found ---------------------------------------
// listings.shopify_listings, wrong_sku = 0, all_list = 1, matched four ways in order:
// exact SKU, then a pack variant (<SKU>NPK - 'A' means 10, confirmed from the listing
// titles), then a combo containing it, then nothing. A superstring with no '+' is a
// regional or variant SKU, not a combo, and says so rather than naming an accessory
// that does not exist.
//
// Only the exact matches carry a price: 3,417 of 5,852 rows. Every pack, combo and
// variant row is BLANK in the price column, and the comment says so instead of
// pointing at a price that is not on screen. See sql/build-shopify-comments.js.
const SHOPIFY_COMMENT = ${JSON.stringify(COM)};

const CATS = {`, 'CATS declaration');

// ---- 2. merged in the same pass that applies the price ----------------------
sub("    const px = SHOPIFY_PRICE[r.s];",
    "    r.cm = SHOPIFY_COMMENT[r.s] || 'Not listed';\n    const px = SHOPIFY_PRICE[r.s];",
    'price pass');

// ---- 3. the header ----------------------------------------------------------
sub('<th class="grp-uk" colspan="11">UK</th>',
    '<th class="grp-uk" colspan="12">UK</th>', 'UK group colspan');
sub('<th colspan="3">Last Container</th><th rowspan="2">Shopify Price</th><th rowspan="2">History</th>',
    '<th colspan="3">Last Container</th><th rowspan="2">Shopify Price</th>' +
    '<th rowspan="2">Price Comment</th><th rowspan="2">History</th>', 'UK header cells');

// ---- 4. the row -------------------------------------------------------------
sub("    '<td class=\"n\">' + price(r.p, r.pn, r.p0, r.p1) + '</td>' +\n    histCell(r, 'UK') +",
    "    '<td class=\"n\">' + price(r.p, r.pn, r.p0, r.p1) + '</td>' +\n" +
    "    '<td class=\"cm\">' + esc(r.cm || 'Not listed') + '</td>' +\n" +
    "    histCell(r, 'UK') +", 'row price cell');

// ---- 5. the CSV -------------------------------------------------------------
sub("  'Shopify Price GBP','UK History',", "  'Shopify Price GBP','Price Comment','UK History',", 'CSV headers');
sub("    (r.p === null || r.p === undefined) ? NA : Number(r.p).toFixed(2), NA,",
    "    (r.p === null || r.p === undefined) ? NA : Number(r.p).toFixed(2), cText(r.cm), NA,",
    'CSV row');

// ---- 6. styling -------------------------------------------------------------
sub("td.sku{", "td.cm{font-size:11px;color:var(--muted);white-space:nowrap;max-width:220px;" +
              "overflow:hidden;text-overflow:ellipsis}\ntd.sku{", 'cm style');

fs.writeFileSync(FILE, src);
console.log('comments merged   :', Object.keys(COM).length);
console.log('inventory-dashboard.html', orig, '->', src.length, 'chars  (+' + (src.length - orig) + ')');
