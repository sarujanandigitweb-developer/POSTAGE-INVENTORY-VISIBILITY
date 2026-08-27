'use strict';
// Moves the Handles type (SKU prefix HL, 31 SKUs) from Home Appliances to Lamp Spares.
//
// The rows live in HAP_DATA, which is a locked dataset. They are re-typed IN MEMORY at
// load — the same pattern Wall Arm and Bulbs use — so HAP_DATA stays byte-identical on
// disk and its hash survives.
//
//   node sql/apply-handles-to-spares.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'dashboard', 'inventory-dashboard.html');
let src = fs.readFileSync(FILE, 'utf8');
const orig = src.length;
if (src.indexOf('HANDLES_MOVED') >= 0){
  console.error('the Handles move is already applied - nothing to do.');
  process.exit(1);
}
function sub(a, b, what){
  if (src.indexOf(a) < 0) throw new Error('anchor not found: ' + what);
  src = src.replace(a, b);
}

// ---- 1. Lamp Spares declares the type -------------------------------------
sub("            ['NT','Lock Nuts','Lock Nuts'],['WR','Washer','Washer']]",
    "            ['NT','Lock Nuts','Lock Nuts'],['WR','Washer','Washer'],\n" +
    "            ['HL','Handles','Handles']]", 'SPR fams');

// ---- 2. Home Appliances no longer does ------------------------------------
sub("            ['ZPMS','Mortar and Pestle','Mortar and Pestle','PMS'],\n" +
    "            ['ZHL','Handles','Handles','HL']]",
    "            ['ZPMS','Mortar and Pestle','Mortar and Pestle','PMS']]", 'HAP fams');

// ---- 3. the rows move at load ---------------------------------------------
sub("const HAP_GROUP = { ZLBT: 'Bags', ZSB: 'Bags', ZHB: 'Bags', ZMB: 'Bags' };",
`const HAP_GROUP = { ZLBT: 'Bags', ZSB: 'Bags', ZHB: 'Bags', ZMB: 'Bags' };

// ---- Handles belong to Lamp Spares, not Home Appliances --------------------
// HANDLES_MOVED. The 31 HL SKUs were extracted into HAP_DATA when the four new
// categories were added. They are lamp and cabinet hardware, so the team files them
// with the other spares.
//
// Done in memory, like the Wall Arm collapse and the Bulbs re-typing: HAP_DATA keeps
// its 705 rows and its byte-identical hash on disk, and the move is one rule here
// rather than a re-extraction.
const HANDLES = HAP_DATA.filter(r => r.f === 'ZHL');
HANDLES.forEach(r => { r.f = 'HL'; });                    // the Lamp Spares family code
const HAP_REST = HAP_DATA.filter(r => r.f !== 'ZHL');`, 'move rule');

// ---- 4. the two sections read the moved sets ------------------------------
sub("    data: SPR_DATA,\n    name:  'Lamp Spares',",
    "    data: SPR_DATA.concat(HANDLES),\n    name:  'Lamp Spares',", 'SPR data');
sub("    data: HAP_DATA,\n    name:  'Home Appliances',",
    "    data: HAP_REST,\n    name:  'Home Appliances',", 'HAP data');

// ---- 5. the sub-titles say the new counts ---------------------------------
sub('Lamp Spares &mdash; 1,420 components across 29 sub-types',
    'Lamp Spares &mdash; 1,451 components across 30 sub-types', 'SPR subtitle');
sub('Home Appliances &mdash; 705 SKUs across 19 types (SKU-prefix defined)',
    'Home Appliances &mdash; 674 SKUs across 18 types (SKU-prefix defined)', 'HAP subtitle');

fs.writeFileSync(FILE, src);
console.log('inventory-dashboard.html', orig, '->', src.length, 'chars  (+' + (src.length - orig) + ')');
