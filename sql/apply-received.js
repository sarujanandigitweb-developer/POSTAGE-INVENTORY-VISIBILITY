'use strict';
// Fills Received Warehouse and Received Date — two columns that have read
// "Unavailable" since the dashboard was built — from the receipt lines in
// inventory.product_history, and ties the container to that receipt.
//
//   node sql/apply-received.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'dashboard', 'inventory-dashboard.html');
let src = fs.readFileSync(FILE, 'utf8');
const orig = src.length;
if (src.indexOf('const RECEIVED = ') >= 0){
  console.error('RECEIVED is already present - nothing to do.');
  process.exit(1);
}
function sub(a, b, what){
  if (src.indexOf(a) < 0) throw new Error('anchor not found: ' + what);
  src = src.replace(a, b);
}
const REC = JSON.parse(fs.readFileSync(path.join(ROOT, 'sql', 'received_data.json'), 'utf8'));

// ---- the lookup -------------------------------------------------------------
sub('const CATS = {', `// ---- Received warehouse, received date, and the container it came in --------
// Built from the RECEIPT lines only: "Supply - SU#### loaded by … On <date>" and
// "German Supply - …". A "UK stock changes … via inventory CSV" line is a recount, not
// a receipt, and is not used here.
//
// The warehouse is the field that INCREASED on that line, which is why the mapping
// matters: Quantity = Unit 3, unit1 = Unit 18, unit3 = Unit 4, unit5 = Unit 5,
// germanInventory = Germany.
//
// THE CONTAINER IS MATCHED BY DATE, NOT BY A KEY. The SU#### code in the history has
// no counterpart anywhere in suppliers — verified: zero rows in orders.order_id,
// final_containers.name or containers.name contain it, and order_item_logs holds no
// supply reference. So the container shown is the latest ARRIVED container for that
// SKU in the matching country, ordered on or before the receipt date. It is the best
// available signal, not a guaranteed link, and the tooltip says so.
//
//   sku -> region -> [warehouseIdx, receivedDate, containerIdx, orderIdx, supplyCode]
const RECEIVED = ${JSON.stringify(REC)};

const CATS = {`, 'RECEIVED lookup');

// ---- merged in the load pass ------------------------------------------------
sub("    r.cm = SHOPIFY_COMMENT[r.s] || 'Not listed';",
`    r.cm = SHOPIFY_COMMENT[r.s] || 'Not listed';
    const rc = RECEIVED.r[r.s];
    r.ruw = r.rud = r.ruc = r.ruo = r.rus = null;
    r.rgw = r.rgd = r.rgc = r.rgo = r.rgs = null;
    if (rc){
      if (rc.UK){ r.ruw = RECEIVED.w[rc.UK[0]]; r.rud = rc.UK[1];
                  r.ruc = RECEIVED.n[rc.UK[2]] || null; r.ruo = RECEIVED.o[rc.UK[3]] || null; r.rus = rc.UK[4]; }
      if (rc.DE){ r.rgw = RECEIVED.w[rc.DE[0]]; r.rgd = rc.DE[1];
                  r.rgc = RECEIVED.n[rc.DE[2]] || null; r.rgo = RECEIVED.o[rc.DE[3]] || null; r.rgs = rc.DE[4]; }
    }`, 'load merge');

// ---- renderers --------------------------------------------------------------
sub('function locDash(v){',
`// Received warehouse and date come from the SKU's own receipt line. A dash means the
// history records no receipt for that region, which is a fact about the log, not a
// gap in the extraction.
function rcvWh(v, supply){
  return v ? '<span class="loc"' + (supply ? ' title="Received under supply ' + esc(supply) + '."' : '') +
             '>' + esc(v) + '</span>'
           : '<span class="dash" title="No goods-receipt line is recorded for this SKU in this region.">-</span>';
}
function rcvDt(v){
  return v ? '<span class="rdt" title="The date the receipt was logged in inventory.product_history.">' +
             esc(v) + '</span>'
           : '<span class="dash" title="No goods-receipt line is recorded for this SKU in this region.">-</span>';
}
// The container tied to that receipt. Falls back to the SKU's latest arrived container
// when no receipt was logged, and the tooltip always says which of the two it is.
function rcvContainer(name, order, date, fbName, fbN, fbDate){
  if (name){
    return '<span class="rcn" title="Latest arrived container for this SKU ordered on or before ' +
      esc(date) + (order ? ', order ' + esc(order) : '') +
      '. Matched by DATE: the supply code in the history has no key into suppliers, so this ' +
      'is the closest arrived container, not a guaranteed link.">' + esc(name) + '</span>';
  }
  return container(fbName, fbN, fbDate);
}
function locDash(v){`, 'renderers');

// ---- the cells --------------------------------------------------------------
sub(`    '<td>' + na(NA_REASON.rcvwh) + '</td>' +
    '<td>' + na(NA_REASON.rcvdt) + '</td>' +
    '<td>' + container(r.uc, r.un, r.ud) + '</td>' +`,
`    '<td>' + rcvWh(r.ruw, r.rus) + '</td>' +
    '<td>' + rcvDt(r.rud) + '</td>' +
    '<td>' + rcvContainer(r.ruc, r.ruo, r.rud, r.uc, r.un, r.ud) + '</td>' +`, 'UK cells');

sub(`    '<td>' + na(NA_REASON.rcvwh) + '</td>' +
    '<td>' + na(NA_REASON.rcvdt) + '</td>' +
    '<td>' + container(r.gc, r.gn, r.gd) + '</td>' +`,
`    '<td>' + rcvWh(r.rgw, r.rgs) + '</td>' +
    '<td>' + rcvDt(r.rgd) + '</td>' +
    '<td>' + rcvContainer(r.rgc, r.rgo, r.rgd, r.gc, r.gn, r.gd) + '</td>' +`, 'German cells');

// ---- the CSV ----------------------------------------------------------------
sub("    NA, NA, cText(r.uc),", "    cText(r.ruw), cText(r.rud), cText(r.ruc || r.uc),", 'CSV UK');
sub("    NA, NA, cText(r.gc),", "    cText(r.rgw), cText(r.rgd), cText(r.rgc || r.gc),", 'CSV German');

// ---- styling ----------------------------------------------------------------
sub('.dash{color:var(--zero);display:block;text-align:center}',
    '.dash{color:var(--zero);display:block;text-align:center}\n' +
    '.rdt{font-variant-numeric:tabular-nums;font-size:11.5px}\n' +
    '.rcn{border-bottom:1px dotted var(--line)}', 'styles');

fs.writeFileSync(FILE, src);
console.log('SKUs with a receipt :', Object.keys(REC.r).length);
console.log('inventory-dashboard.html', orig, '->', src.length, 'chars  (+' + (src.length - orig) + ')');
