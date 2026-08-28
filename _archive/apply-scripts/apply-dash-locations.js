'use strict';
// Kronen and Schmutter shelf locations read a plain dash, the same as Unit 3 and
// Unit 4, and the "Unavailable = not present in LEDSone MCP" legend leaves the header.
//
// Every location column now uses the dash, so `loc()` and the two NA_REASON entries it
// consumed are removed rather than left behind as dead code.
//
//   node sql/apply-dash-locations.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'dashboard', 'inventory-dashboard.html');
let src = fs.readFileSync(FILE, 'utf8');
const orig = src.length;
function sub(a, b, what){
  if (src.indexOf(a) < 0) throw new Error('anchor not found: ' + what);
  src = src.replace(a, b);
}

// ---- 1. Kronen and Schmutter join the dash ---------------------------------
sub("    '<td class=\"n\">' + num(r.k) + '</td><td>' + loc(r.kl, true) + '</td>' +\n" +
    "    '<td class=\"n\">' + num(r.m) + '</td><td>' + loc(r.ml) + '</td>' +",
    "    '<td class=\"n\">' + num(r.k) + '</td><td>' + locDash(r.kl) + '</td>' +\n" +
    "    '<td class=\"n\">' + num(r.m) + '</td><td>' + locDash(r.ml) + '</td>' +",
    'kronen/schmutter cells');

// ---- 2. loc() is now unused ------------------------------------------------
sub(`function loc(v, kronen){
  return (v === null || v === undefined || v === '')
    ? na(kronen ? NA_REASON.kloc : NA_REASON.loc)
    : '<span class="loc">' + esc(v) + '</span>';
}
// Unit 3 and Unit 4 show a plain dash where the shelf is not recorded. The team reads
// these two columns constantly and an "Unavailable" chip on every empty shelf was
// noise, not information. The database value is passed through untouched otherwise.
function locDash(v){`,
`// EVERY shelf column shows a plain dash where the location is not recorded. An
// "Unavailable" chip on thousands of empty shelves was noise, not information, and it
// crowded out the codes that ARE there. The reason still shows on hover, and the
// database value is passed through untouched whenever there is one.
function locDash(v){`, 'drop loc()');

// the two reasons only loc() used
sub(`  loc:   'Not available in LEDSone MCP: product_shelf_location is NULL (or the non-location sentinel "-") for this SKU at this warehouse.',
  kloc:  'Not available in LEDSone MCP: product_shelf_location is NULL for every SKU in this category at Kronen (all 332 Ceiling Rose and all 451 Lampshade SKUs).',
`, '', 'drop loc reasons');

// ---- 3. the header legend --------------------------------------------------
sub(`        <span class="tag warnt" id="naTag">Unavailable = not present in LEDSone MCP</span>\n`,
    '', 'header legend');

fs.writeFileSync(FILE, src);
console.log('remaining loc( calls :', (src.match(/[^h]loc\(r\./g) || []).length);
console.log('locDash calls        :', (src.match(/locDash\(r\./g) || []).length);
console.log('naTag references     :', (src.match(/naTag/g) || []).length);
console.log('inventory-dashboard.html', orig, '->', src.length, 'chars  (' +
            (src.length - orig >= 0 ? '+' : '') + (src.length - orig) + ')');
