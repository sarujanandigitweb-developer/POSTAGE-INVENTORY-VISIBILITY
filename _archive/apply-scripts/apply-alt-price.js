'use strict';
// Shows the foreign price where no UK store carries the SKU, instead of a bare
// "Unavailable" whose tooltip was factually wrong.
//
// LSFT255BD is on LEDSone DE at EUR 21.35 and nowhere else. The cell said "Unavailable"
// and the tooltip said "no exact SKU, no combo and no pack listing exists" — which is
// untrue, and left the reader with no way to find out otherwise, because the Comments
// column truncates before the part that explains it.
//
// The foreign figure is rendered in its own currency and its own muted style, never as
// the blue GBP badge, so it can never be misread as pounds.
//
//   node sql/apply-alt-price.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'dashboard', 'inventory-dashboard.html');
let src = fs.readFileSync(FILE, 'utf8');
const orig = src.length;
if (src.indexOf('SHOPIFY_ALT') >= 0){
  console.error('the alt-price column is already applied - nothing to do.');
  process.exit(1);
}
function sub(a, b, what){
  if (src.indexOf(a) < 0) throw new Error('anchor not found: ' + what);
  src = src.replace(a, b);
}
const ALT = JSON.parse(fs.readFileSync(path.join(ROOT, 'sql', 'shopify-alt-price_data.json'), 'utf8'));

// ---- the lookup -------------------------------------------------------------
sub('const CATS = {',
`// ---- price where no UK store carries the SKU --------------------------------
// sku -> [price, symbol, currency, channel]. Kept SEPARATE from SHOPIFY_PRICE so a
// euro figure can never be read as pounds: the price column is labelled in GBP and
// only SHOPIFY_PRICE ever fills it.
const SHOPIFY_ALT = ${JSON.stringify(ALT)};

const CATS = {`, 'SHOPIFY_ALT');

// ---- merged onto the row ----------------------------------------------------
sub("    r.cm = SHOPIFY_COMMENT[r.s] || 'Not listed';",
    "    r.cm = SHOPIFY_COMMENT[r.s] || 'Not listed';\n" +
    "    r.pa = SHOPIFY_ALT[r.s] || null;      // [price, symbol, currency, channel]",
    'alt merge');

// ---- the cell ---------------------------------------------------------------
sub(`function price(p, n, lo, hi){
  if (p !== null && p !== undefined)
    return '<span class="pb">£' + Number(p).toFixed(2) + '</span>';`,
`function price(p, n, lo, hi, alt){
  if (p !== null && p !== undefined)
    return '<span class="pb">£' + Number(p).toFixed(2) + '</span>';
  // No UK listing, but the SKU IS on Shopify somewhere. Show that price in its own
  // currency rather than a blank the reader cannot explain.
  if (alt){
    return '<span class="pb pb-alt" title="' + esc('Not sold by any UK store. Listed on ' +
      alt[3] + ' at ' + alt[1] + Number(alt[0]).toFixed(2) + ' ' + alt[2] +
      '. Shown in its own currency because this column is in pounds.') + '">' +
      esc(alt[1]) + Number(alt[0]).toFixed(2) + '<span class="pcur">' + esc(alt[2]) + '</span></span>';
  }`, 'price signature');

sub("    '<td class=\"n\">' + price(r.p, r.pn, r.p0, r.p1) + '</td>' +",
    "    '<td class=\"n\">' + price(r.p, r.pn, r.p0, r.p1, r.pa) + '</td>' +", 'price call');

// ---- the CSV keeps the figure too, with its currency -------------------------
sub("    (r.p === null || r.p === undefined) ? NA : Number(r.p).toFixed(2), cText(r.cm), NA,",
    "    (r.p === null || r.p === undefined)\n" +
    "      ? (r.pa ? r.pa[0].toFixed(2) + ' ' + r.pa[2] : NA)\n" +
    "      : Number(r.p).toFixed(2), cText(r.cm), NA,", 'CSV price');

// ---- styling ----------------------------------------------------------------
sub('.pb{display:inline-block;border-radius:6px;padding:2px 7px;font-weight:600;',
    '.pb-alt{background:var(--na-bg);color:var(--na-ink);font-weight:600}\n' +
    '.pcur{font-size:9px;margin-left:3px;opacity:.75;letter-spacing:.02em}\n' +
    '.pb{display:inline-block;border-radius:6px;padding:2px 7px;font-weight:600;', 'alt style');

// ---- the "not listed" wording is only for SKUs that really are not listed ----
sub("  return na('Not listed on Shopify: no exact SKU, no combo and no pack listing exists ' +\n" +
    "    'in listings.shopify_listings (wrong_sku = 0, all_list = 1).');",
    "  return na('Not listed on Shopify in any market: no exact SKU, no combo and no pack ' +\n" +
    "    'listing exists in listings.shopify_listings (wrong_sku = 0, all_list = 1).');",
    'no-price reason');

fs.writeFileSync(FILE, src);
console.log('foreign prices shown :', Object.keys(ALT).length);
console.log('inventory-dashboard.html', orig, '->', src.length, 'chars  (+' + (src.length - orig) + ')');
