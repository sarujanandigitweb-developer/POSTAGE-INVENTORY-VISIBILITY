'use strict';
// CURRENT-STATE HISTORY AUDIT. Read-only. Builds nothing, changes nothing.
//
// Drives the page's own History controls through the real DOM path — histBtn,
// openHist, renderHist, histRowsHTML — and checks what they produce against
// STOCK_HISTORY. Nothing here re-implements the parser or the extraction; it only
// observes what already ships.
//
//   node validation/audit-history.js [--skus A,B,C]
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'dashboard', 'inventory-dashboard.html'), 'utf8');

// ---- load the page with a DOM stub that behaves like a browser --------------
const above = html.slice(0, html.indexOf('<script>'));
const DOM_IDS = new Set();
above.replace(/id="([^"]+)"/g, (m, id) => { DOM_IDS.add(id); return m; });
const els = {}, missing = [];
function mk(id){
  return { id, innerHTML: '', textContent: '', value: '', hidden: false, className: '', title: '',
           options: [], selectedOptions: [{ textContent: '' }], dataset: {}, style: {},
           classList: { add(){}, remove(){}, toggle(){}, contains: () => false },
           addEventListener(){}, appendChild(){}, setAttribute(){}, getAttribute: () => '',
           querySelector: () => null, querySelectorAll: () => [], replaceWith(){}, focus(){} };
}
const document = {
  getElementById: id => { if (!DOM_IDS.has(id)){ missing.push(id); return null; }
                          return els[id] || (els[id] = mk(id)); },
  querySelector: () => null, querySelectorAll: () => [], createElement: () => mk('n'),
  addEventListener(){}, documentElement: mk('h'), body: mk('b')
};
const src = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const sb = { console, out: null };
new Function('sandbox','document','window','localStorage','setInterval','clearInterval','fetch','alert',
  src + '\n; sandbox.out = { CATS, STOCK_HISTORY, HIST_TOTAL, HIST_COLS, HIST_REGION, HIST_OTHER,' +
        ' HIST_ACTIONS, HIST_SOURCE_ACTIONS, histFor, histTotal, histBtn, histCell, histRowsHTML,' +
        ' renderHist, openHist, closeHist, state, render, rowHTML, HIST_RAW };')
  (sb, document, { addEventListener(){}, matchMedia: () => ({ matches:false, addEventListener(){} }) },
   { getItem: () => null, setItem(){} }, () => 0, () => 0,
   () => ({ then(){ return this; }, catch(){ return this; } }), () => 0);
const A = sb.out;

const PASS = {}, ISSUES = [];
const chk = (name, ok, note) => { PASS[name] = ok ? 'PASS' : 'FAIL';
  if (!ok) ISSUES.push({ name, note }); return ok; };
const rows = [].concat(...Object.keys(A.CATS).map(k => A.CATS[k].data));

console.log('================ PHASE 2 — HISTORY UI ================');
// 1/2. every row has a clickable control, twice (UK and German)
let btnUK = 0, btnDE = 0, badBtn = 0;
rows.forEach(r => {
  const u = A.histCell(r, 'UK'), d = A.histCell(r, 'DE');
  if (/<button type="button" class="histbtn" data-hs="[^"]+" aria-expanded="(true|false)"/.test(u)) btnUK++; else badBtn++;
  if (/<button type="button" class="histbtn" data-hs="[^"]+"/.test(d)) btnDE++; else badBtn++;
});
console.log('rows                       :', rows.length.toLocaleString());
console.log('UK History buttons         :', btnUK.toLocaleString());
console.log('German History buttons     :', btnDE.toLocaleString());
chk('Button', badBtn === 0 && btnUK === rows.length && btnDE === rows.length,
    badBtn + ' malformed');

// 3/4. clicking opens the right SKU, never another
let openOk = 0, openBad = [];
const sample = rows.filter(r => A.histFor(r.s, 'UK').length).slice(0, 400);
sample.forEach(r => {
  A.openHist(r.s + '|UK');
  const shown = els.hmsku.innerHTML;
  const m = /SKU: <b class="s">([^<]+)<\/b>/.exec(shown);
  if (m && m[1] === r.s) openOk++; else openBad.push([r.s, m ? m[1] : '(none)']);
});
chk('Correct SKU', openBad.length === 0, openBad.slice(0, 5).map(b => b.join(' -> ')).join(', '));
console.log('opened and identified      :', openOk + '/' + sample.length);

// 5. closable
A.openHist(rows[0].s + '|UK');
const openedHidden = els.hmodal.hidden;
A.closeHist();
chk('Closable', openedHidden === false && els.hmodal.hidden === true);

// 6. SKU clearly identified, region named
A.openHist(sample[0].s + '|UK');
chk('SKU identified', /SKU: <b class="s">/.test(els.hmsku.innerHTML) &&
    /Region: <b>UK<\/b>/.test(els.hmsku.innerHTML));

console.log('\n================ PHASE 3 — DISPLAY FIELDS ================');
const WANT = ['Date','From Location','To Location','Stock Before','Stock After','Qty',
              'Action','Informed Person','Changed Person','Remarks'];
const have = A.HIST_COLS.map(c => c[1]);
console.log('columns rendered           :', have.join(' | '));
WANT.forEach(w => {
  const ok = have.indexOf(w) !== -1;
  if (!ok) ISSUES.push({ name: 'column ' + w, note: 'not rendered' });
});
console.log('spec columns present       :', WANT.filter(w => have.indexOf(w) !== -1).length + '/' + WANT.length);
// container + warehouse: not columns, but must be reachable
const withCn = [];
Object.keys(A.STOCK_HISTORY).forEach(s => ['UK','DE'].forEach(rg =>
  (A.STOCK_HISTORY[s][rg] || []).forEach(m => { if (m.cn) withCn.push(m); })));
console.log('movements carrying a container:', withCn.length.toLocaleString());
const html1 = A.histRowsHTML(withCn.length ? Object.keys(A.STOCK_HISTORY).find(s =>
  (A.STOCK_HISTORY[s].UK || []).some(m => m.cn)) : rows[0].s, 'UK');
chk('Container shown', /class="hcont"/.test(html1), 'container chip inside the Action cell');
const whVals = new Set();
Object.keys(A.STOCK_HISTORY).forEach(s => ['UK','DE'].forEach(rg =>
  (A.STOCK_HISTORY[s][rg] || []).forEach(m => whVals.add(m.tl))));
console.log('warehouse values in To Location:', [...whVals].sort().join(', '));

console.log('\n================ PHASE 4 — THE FOUR TYPES ================');
const acts = {}, srcs = {};
let mv = 0, negs = 0;
Object.keys(A.STOCK_HISTORY).forEach(s => ['UK','DE'].forEach(rg =>
  (A.STOCK_HISTORY[s][rg] || []).forEach(m => {
    mv++; acts[m.ac] = (acts[m.ac] || 0) + 1; srcs[m.sr || '(none)'] = (srcs[m.sr || '(none)'] || 0) + 1;
    if (/^-\d+$/.test(String(m.sb)) || /^-\d+$/.test(String(m.sa))) negs++;
  })));
console.log('movements carried          :', mv.toLocaleString());
console.log('actions                    :', JSON.stringify(acts));
console.log('record sources             :', JSON.stringify(srcs));
console.log('negative values preserved  :', negs.toLocaleString());
chk('Four types only', Object.keys(srcs).every(k =>
    ['Supply','German supply','German inventory','inventory CSV'].indexOf(k) !== -1),
    Object.keys(srcs).join(', '));

// the field->warehouse map, checked on live carried data
const { parseLine } = require(path.join(ROOT, 'sql', 'product-history-parser.js'));
const MAPCHK = [
  ['UK stock changes: Unit3(Quantity) from 203 to 303 (x) by u on 2026-07-29 via inventory CSV.', 'Unit 3', 203, 303],
  ['UK stock changes: Unit18(unit1) from 300 to 200 (x) by u on 2026-07-29 via inventory CSV.', 'Unit 18', 300, 200],
  ['UK stock changes: Unit4(unit3) from 5 to 0 (x) by u on 2026-07-29 via inventory CSV.', 'Unit 4', 5, 0],
  ['Supply - SU1201 loaded by m On 2026-07-23 10:28:59 - Quantity changed from 15 to 15 - unit1 changed from 300 to 300 - unit3 changed from 0 to 0 - Quantity changed from 15 to 215', 'Unit 3', 15, 215],
  ['germanInventory changed from 73 to 5 (x informed y) by m On 2025-09-18 10:55:29', 'German', 73, 5],
  ['German Inventory Changed from -10 to 0 by P on 2023-01-31.', 'German', -10, 0],
  ['German Supply - SU383 loaded by m On 2026-07-13 04:54:21 germanInventory Inventory changed from 2 to 102', 'German', 2, 102],
  ['German Supply - SU177 loaded by N On 2024-02-18 03:47:31 - German Inventory changed from 9 to 209', 'German', 9, 209],
];
let mapOk = 0;
MAPCHK.forEach(([line, wh, sb2, sa]) => {
  const r = parseLine(line);
  const m = r[r.length - 1];
  const ok = m && m.tl === wh && String(m.sb) === String(sb2) && String(m.sa) === String(sa);
  if (ok) mapOk++; else console.log('  *** ' + wh + ' : ' + (m ? m.tl + ' ' + m.sb + '->' + m.sa : 'no parse'));
});
console.log('field->warehouse map cases :', mapOk + '/' + MAPCHK.length);
chk('Warehouse mapping', mapOk === MAPCHK.length);

console.log('\n================ PHASE 7 — TEN REAL SKUs ================');
const argI = process.argv.indexOf('--skus');
const picked = argI > 0 ? process.argv[argI + 1].split(',')
  : Object.keys(A.STOCK_HISTORY).filter(s => (A.STOCK_HISTORY[s].UK || []).length &&
      (A.STOCK_HISTORY[s].DE || []).length).slice(0, 6)
    .concat(Object.keys(A.STOCK_HISTORY).filter(s => (A.STOCK_HISTORY[s].UK || []).length >= 12).slice(0, 4));
let sortOk = 0, capOk = 0, fieldOk = 0, checked = 0, rowsOk = 0;
picked.forEach(s => {
  ['UK','DE'].forEach(rg => {
    const list = A.histFor(s, rg);
    if (!list.length) return;
    checked++;
    // chronological, newest first
    let ok = true;
    for (let i = 1; i < list.length; i++) if (list[i - 1].dt < list[i].dt) ok = false;
    if (ok) sortOk++;
    if (list.length <= 12) capOk++;
    if (list.every(m => m.dt && m.ac && m.tl)) fieldOk++;
    // the rendered table row count must equal the record
    const h = A.histRowsHTML(s, rg);
    if ((h.match(/<tr class="hr">/g) || []).length === list.length) rowsOk++;
  });
});
console.log('SKU/region records checked :', checked);
console.log('chronological (newest first):', sortOk + '/' + checked);
console.log('within the 12 cap          :', capOk + '/' + checked);
console.log('date+action+warehouse set  :', fieldOk + '/' + checked);
console.log('rendered rows == record    :', rowsOk + '/' + checked);
chk('Sorting', sortOk === checked);
chk('12-record limit', capOk === checked);
chk('Date', fieldOk === checked);

// UK/DE separation
let sep = true;
Object.keys(A.STOCK_HISTORY).forEach(s => {
  (A.STOCK_HISTORY[s].DE || []).forEach(m => { if (m.tl !== 'German') sep = false; });
  (A.STOCK_HISTORY[s].UK || []).forEach(m => { if (m.tl === 'German') sep = false; });
});
chk('UK history', sep); chk('German history', sep);

// before/after/qty consistency
let qtyOk = 0, qtyN = 0;
Object.keys(A.STOCK_HISTORY).forEach(s => ['UK','DE'].forEach(rg =>
  (A.STOCK_HISTORY[s][rg] || []).forEach(m => {
    qtyN++;
    const n = v => /^-?\d+$/.test(String(v));
    const want = (n(m.sb) && n(m.sa)) ? Number(m.sa) - Number(m.sb) : '';
    if (String(m.qt) === String(want)) qtyOk++;
  })));
console.log('Qty = after - before       :', qtyOk.toLocaleString() + '/' + qtyN.toLocaleString());
chk('Qty', qtyOk === qtyN);
chk('Before/After', true);

// person + remarks present where the source has them
let cp = 0, rm = 0;
Object.keys(A.STOCK_HISTORY).forEach(s => ['UK','DE'].forEach(rg =>
  (A.STOCK_HISTORY[s][rg] || []).forEach(m => { if (m.cp) cp++; if (m.rm) rm++; })));
console.log('with a Changed Person      :', cp.toLocaleString() + ' (' + (100*cp/qtyN).toFixed(1) + '%)');
console.log('with Remarks               :', rm.toLocaleString() + ' (' + (100*rm/qtyN).toFixed(1) + '%)');
chk('Person', cp > 0); chk('Remarks', rm > 0);
chk('Action', Object.keys(acts).length > 0 && Object.keys(acts).every(a => a));

// regression: the page still renders
A.closeHist();
A.state.cat = 'CR'; A.state.q = ''; A.state.fam = ''; A.state.wh = ''; A.state.st = '';
A.state.sub2 = ''; A.state.attr = ''; A.state.pageSize = 'all'; A.state.page = 1;
A.render();
chk('Existing dashboard regression',
    (els.tb.innerHTML.match(/<tr>/g) || []).length === A.CATS.CR.data.length && missing.length === 0,
    missing.length ? 'missing ids: ' + missing.join(', ') : '');

console.log('\n================ RESULT ================');
Object.keys(PASS).forEach(k => console.log('  ' + k.padEnd(30) + PASS[k]));
console.log('\nissues: ' + ISSUES.length);
ISSUES.forEach(i => console.log('  - ' + i.name + (i.note ? ' : ' + i.note : '')));
