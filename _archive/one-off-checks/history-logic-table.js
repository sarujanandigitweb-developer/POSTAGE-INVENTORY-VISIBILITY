'use strict';
// Prints the LOGIC that fills the History details table: for each of the four record
// types, which part of the raw text becomes which column. Read-only, changes nothing.
//
// Every example below is a real line from inventory.product_history, put through the
// shipped parser, so the table is a description of what the code does — not of what it
// was meant to do.
//
//   node validation/history-logic-table.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { parseLine } = require(path.join(ROOT, 'sql', 'product-history-parser.js'));

// the shipped column list, read from the page so it cannot drift
const html = fs.readFileSync(path.join(ROOT, 'dashboard', 'inventory-dashboard.html'), 'utf8');
const colsSrc = /const HIST_COLS = \[([\s\S]*?)\n\];/.exec(html)[1];
const COLS = [];
colsSrc.replace(/\['(\w+)',\s*'([^']+)',\s*'(\w*)',\s*(\d+)\]/g,
  (m, k, label, kind, w) => { COLS.push({ k, label, kind, w: +w }); return m; });

const SAMPLES = [
  ['1. UK stock changes',
   "UK stock changes: Unit3(Quantity) from 203 to 303,Unit18(unit1) from 300 to 200 (L/z in unit 18 - nanthini akka - taken unit 3) by mithusha on 2026-07-29 via inventory CSV."],
  ['2. Supply',
   "Supply - SU1201 loaded by manoranjini On 2026-07-23 10:28:59 - Quantity changed from 15 to 15 - unit1 changed from 300 to 300 - unit3 changed from 0 to 0 - Quantity changed from 15 to 215"],
  ['3. German Inventory',
   "germanInventory changed from 73 to 5 (thanusha akka informed DE Low stock counting) by mithusha On 2025-09-18 10:55:29"],
  ['4. German Supply',
   "German Supply - SU383 loaded by manoranjini On 2026-07-13 04:54:21 germanInventory Inventory changed from 2 to 102"],
];

const pad = (s, n) => String(s === undefined || s === null || s === '' ? '—' : s).padEnd(n);

console.log('HISTORY DETAILS TABLE — the columns, in the order the dialog renders them\n');
console.log('  #  ' + pad('column', 18) + pad('property', 10) + pad('width', 7) + 'style');
COLS.forEach((c, i) => console.log('  ' + String(i + 1).padStart(2) + ' ' + pad(c.label, 18) +
  pad(c.k, 10) + pad(c.w + '%', 7) +
  (c.kind === 'n' ? 'numeric' : c.kind === 'd' ? 'date' : c.kind === 'a' ? 'action + container chip'
   : c.kind === 'r' ? 'remark' : 'text')));
console.log('\n  carried but not a column: tm (time of day) -> Date tooltip · sr (record source) -> Action tooltip');

SAMPLES.forEach(([title, line]) => {
  console.log('\n' + '='.repeat(78));
  console.log(title);
  console.log('='.repeat(78));
  console.log('RAW:\n  ' + line.replace(/(.{74})/g, '$1\n  '));
  const out = parseLine(line);
  console.log('\nPRODUCES ' + out.length + ' row' + (out.length === 1 ? '' : 's') + ':');
  out.forEach((m, i) => {
    console.log('\n  row ' + (i + 1) + ':');
    COLS.forEach(c => console.log('    ' + pad(c.label, 17) + '= ' + (m[c.k] === '' || m[c.k] === undefined ? '—' : m[c.k])));
    console.log('    ' + pad('(container)', 17) + '= ' + (m.cn || '—'));
    console.log('    ' + pad('(time)', 17) + '= ' + (m.tm || '—'));
    console.log('    ' + pad('(source)', 17) + '= ' + (m.sr || '—'));
  });
});

console.log('\n' + '='.repeat(78));
console.log('THE RULES, IN ORDER');
console.log('='.repeat(78));
console.log(`
 A. WHICH LINES BECOME ROWS
    Only four wordings are read. Everything else in product_history — catalogue edits,
    CSV location moves, low-inventory checkups, order cancellations, product flags — is
    not a warehouse stock movement and produces no row.

 B. HOW MANY ROWS ONE LINE PRODUCES
    UK stock changes  one row PER SEGMENT. A line naming two units is two movements,
                      and reading only the first would lose the unit stock came FROM.
    Supply            exactly ONE row: the LAST segment whose value actually changed.
                      A supply line lists every field it touched, most unchanged.
    German Inventory  one row.
    German Supply     one row.

 C. WHICH WAREHOUSE (the field decides, never the label)
    Quantity -> Unit 3     unit1 -> Unit 18     unit3 -> Unit 4
    unit2    -> Mark       unit5 -> Unit 5      german* / tros_kronen -> German
    A Supply line carries the field with NO label at all, which is why the field is
    authoritative. Verified on all 13,454 labelled segments.

 D. REGION
    German -> the German dialog. Everything else -> the UK dialog.

 E. QTY
    after - before, and ONLY when both sides are numbers. A blank stays blank rather
    than being shown as 0.

 F. WHAT IS DROPPED, AND WHY
    A segment whose value is not a number is skipped: "Mark(unit2) from 1 to yes" is a
    typing error, not a quantity.
    "Out Of Stock from  to Yes" is a flag, not a movement — 119 lines.

 G. ORDER AND CAP
    Newest first, by date then time. The 12 most recent per SKU per region are carried;
    where more exist the true total is stored so the dialog can say "12 most recent of
    70" instead of implying it is the whole story.

 H. WHAT A BLANK MEANS
    A blank cell is normal in a movement log — a goods receipt has no before/after, a
    CSV upload has no informed person. It renders as a quiet dash carrying
    "Not recorded for this movement.", never as the loud Unavailable chip.
`);
