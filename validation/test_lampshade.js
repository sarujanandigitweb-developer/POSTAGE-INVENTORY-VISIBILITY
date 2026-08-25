// Validation harness — executes the dashboard's REAL inline <script> against a
// minimal DOM stub, so the shipped render/filter/CSV code is exercised, not a copy.
// Run: node validation/test_lampshade.js
// Covers all three implemented categories: Ceiling Rose (locked), Lampshade (locked),
// Pendant Lamp Holder. Name kept for continuity with the Lampshade sign-off.
const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '../dashboard/inventory-dashboard.html'), 'utf8');
const m = HTML.match(/<script>\n([\s\S]*?)\n<\/script>/);
if (!m) { console.error('could not extract inline script'); process.exit(1); }
const SRC = m[1];

// ---- minimal DOM stub -------------------------------------------------------
function mkEl(id) {
  return {
    id, innerHTML: '', textContent: '', value: '', placeholder: '', hidden: false,
    dataset: {}, attrs: {}, handlers: {},
    selectedOptions: [{ textContent: 'All warehouses' }],
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    addEventListener(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); },
    appendChild() {}, removeChild() {}, click() {}, replaceWith() {}
  };
}
const els = {};
['tb','q','wh','st','reset','shown','total','breakdown','whNote','empty','csv','theme',
 'cats','h1t','subt','sub2','attr'].forEach(id => { els[id] = mkEl(id); });
els.h1t.textContent = (HTML.match(/<h1 id="h1t">([^<]*)<\/h1>/) || [, ''])[1];

// The category row is rendered via innerHTML; parse it back into fake <select>s
// so the dashboard's own change handlers can be fired against them. Cached like
// the live DOM so listeners attached by buildCats() stay attached.
let catEls = [], catHTML = null;
function parseCats() {
  if (catHTML === els.cats.innerHTML) return catEls;
  catHTML = els.cats.innerHTML;
  const out = [];
  const re = /<div class="(cat[^"]*)">([\s\S]*?)<\/div>/g;
  let mm;
  while ((mm = re.exec(els.cats.innerHTML))) {
    const block = mm[2];
    const lab = block.match(/<span class="cat-l">([\s\S]*?)<select/);
    const ds  = block.match(/data-ds="([^"]*)"/);
    const opts = [];
    const ore = /<option value="([^"]*)"( selected)?>([^<]*)<\/option>/g;
    let om;
    while ((om = ore.exec(block))) opts.push({ value: om[1], selected: !!om[2], label: om[3] });
    const el = mkEl('sel');
    el.cls      = mm[1];
    el.label    = lab ? lab[1].replace(/<span class="gap"[\s\S]*?<\/span>/g, '')
                              .replace(/<[^>]*>/g, '').trim() : '';
    el.gap      = /class="gap"/.test(block);
    el.dataset.ds = ds ? ds[1] : '';
    el.disabled = / disabled/.test(block);
    el.options  = opts;
    el.value    = (opts.find(o => o.selected) || { value: '' }).value;
    out.push(el);
  }
  catEls = out;
  return out;
}
// options of the sub2 / attr dropdowns, parsed out of their rendered innerHTML
function optsOf(id) {
  const out = [];
  const re = /<option value="([^"]*)"(?: selected)?>([^<]*)<\/option>/g;
  let mm;
  while ((mm = re.exec(els[id].innerHTML))) out.push({ value: mm[1], label: mm[2] });
  return out;
}

global.document = {
  documentElement: { setAttribute() {} },
  getElementById: id => els[id] || mkEl(id),
  querySelectorAll: sel => (sel === '#cats select' ? parseCats() : []),
  createElement: () => mkEl('a'),
  body: { appendChild() {}, removeChild() {} }
};
global.localStorage = { getItem: () => null, setItem: () => {} };
global.Blob = function (parts) { this.parts = parts; };
global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
global.setTimeout = fn => fn();

// ---- run the dashboard's own code ------------------------------------------
const runner = new Function('with(this){' + SRC +
  '\n; return {DATA, LS_DATA, CATS, CATEGORIES, state, render, matches, buildCats, buildExtras,' +
  ' applyCat, rowHTML, buildCSV, csvRow, typeCell, downloadCSV, active, extraCols, PH_DATA, WA_DATA, LB_DATA, LH_DATA};}');
const app = runner.call(global);

// ---- helpers ----------------------------------------------------------------
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
}
function cat(label) { return parseCats().find(s => s.label === label); }
function choose(label, value) {
  const sel = cat(label);
  if (!sel) throw new Error('no category dropdown labelled ' + label);
  sel.value = value;
  (sel.handlers.change || []).forEach(fn => fn());
  return sel;
}
function fire(el, ev, arg) { (el.handlers[ev] || []).forEach(fn => fn(arg)); }
const rowsShown = () => Number(els.shown.textContent);

// ============================================================================
console.log('\n== PHASE 1 — Ceiling Rose regression (must be untouched) ==');
ok('DATA has 332 Ceiling Rose SKUs', app.DATA.length === 332, app.DATA.length);
ok('CRSF count is 219', app.DATA.filter(r => r.f === 'CRSF').length === 219);
ok('CRFF count is 113', app.DATA.filter(r => r.f === 'CRFF').length === 113);
ok('every CR row still has a type', app.DATA.every(r => r.t));
ok('CR badge markup unchanged (CRSF)',
   app.typeCell(app.DATA.find(r => r.f === 'CRSF')).startsWith('<span class="type crsf">'));
ok('CR badge markup unchanged (CRFF)',
   app.typeCell(app.DATA.find(r => r.f === 'CRFF')).startsWith('<span class="type crff">'));
ok('default category is Ceiling Rose', app.state.cat === 'CR');
ok('initial total shows 332', String(els.total.textContent) === '332', els.total.textContent);
ok('initial breakdown is CRSF/CRFF', els.breakdown.textContent === 'CRSF 219 · CRFF 113',
   els.breakdown.textContent);
ok('CR images are absolute URLs', app.DATA.every(r => !r.i || /^https?:\/\//.test(r.i)));
ok('CR declares no Level-2 dimension', !app.CATS.CR.sub2 && !app.CATS.CR.attr);
ok('CR hides the sub-category dropdown', els.sub2.hidden === true);
ok('CR hides the attribute dropdown', els.attr.hidden === true);
ok('CR CSV keeps exactly 23 columns',
   app.buildCSV(app.DATA.slice(0, 3)).split('\r\n')[0].split(',').length === 23,
   app.buildCSV(app.DATA.slice(0, 3)).split('\r\n')[0].split(',').length);
ok('CR CSV exports its type verbatim',
   app.csvRow(app.DATA.find(r => r.f === 'CRSF'))[1] === 'Side Fitting');
ok('CR search still works', (() => {
  app.state.q = 'crsf100bm'; app.render(); const n = rowsShown();
  app.state.q = ''; app.render(); return n === 1; })());
ok('CR family filter still works', (() => {
  app.state.fam = 'CRFF'; app.render(); const n = rowsShown();
  app.state.fam = ''; app.render(); return n === 113; })());

console.log('\n== PHASE 2 — Lampshade dataset (451, from the SOT population) ==');
ok('LS_DATA has 451 SKUs', app.LS_DATA.length === 451, app.LS_DATA.length);
ok('451 distinct SKUs — no dashboard duplicate', new Set(app.LS_DATA.map(r => r.s)).size === 451);
ok('0 bundle SKUs', app.LS_DATA.every(r => !r.s.includes('+')));
ok('0 unresolved — every SKU starts LS', app.LS_DATA.every(r => r.s.startsWith('LS')));
ok('LSGLWA140AR appears exactly once (sheet duplicate not carried in)',
   app.LS_DATA.filter(r => r.s === 'LSGLWA140AR').length === 1);
ok('100% image mapping', app.LS_DATA.every(r => !!r.i));
ok('image URLs absolute', app.LS_DATA.every(r => r.i.startsWith('https://sin1.contabostorage.com/')));
ok('100% description', app.LS_DATA.every(r => typeof r.d === 'string' && r.d.length > 0));
ok('100% Level-1 category', app.LS_DATA.every(r => !!r.f));
ok('100% Level-2 shade_shape', app.LS_DATA.every(r => !!r.sh));
ok('100% fitting type', app.LS_DATA.every(r => !!r.ft));

console.log('\n== PHASE 3 — Level-1 category counts (exact) ==');
const L1 = { MT: ['Metal', 352], GL: ['Glass', 72], FB: ['Fabric', 13],
             CG: ['Crystal Glass', 9], NR: ['Natural Rope', 5] };
let l1total = 0;
Object.entries(L1).forEach(([code, [name, expect]]) => {
  const n = app.LS_DATA.filter(r => r.f === code).length;
  l1total += n;
  ok(name + ' = ' + expect, n === expect, n);
  ok(name + ' display name exact',
     app.LS_DATA.filter(r => r.f === code).every(r => r.t === name));
});
ok('Level-1 total = 451', l1total === 451, l1total);
ok('no Unclassified bucket exists',
   !app.LS_DATA.some(r => /unclassified/i.test(r.f + ' ' + r.t)));
ok('category labels are not renamed',
   app.CATS.LS.fams.map(f => f[1]).join('|') === 'Metal|Glass|Fabric|Crystal Glass|Natural Rope',
   app.CATS.LS.fams.map(f => f[1]).join('|'));
ok('Level-1 is material, NOT fitting_type',
   app.CATS.LS.fams.every(f => !/easy fit|pendant|ceiling mounted/i.test(f[1])));

console.log('\n== PHASE 4 — Level-2 shade_shape ==');
const shapes = [...new Set(app.LS_DATA.map(r => r.sh))];
ok('46 distinct shade shapes preserved', shapes.length === 46, shapes.length);
ok('source spelling kept — Bell and "Bell shape" both present',
   shapes.includes('Bell') && shapes.includes('Bell shape'));
ok('source spelling kept — Striped and Stripped both present',
   shapes.includes('Striped') && shapes.includes('Stripped'));
ok('source spelling kept — Bowl and Bowel both present',
   shapes.includes('Bowl') && shapes.includes('Bowel'));
ok('source spelling kept — "Temple- Dome" not merged into "Temple Dome"',
   shapes.includes('Temple- Dome') && shapes.includes('Temple Dome'));

console.log('\n== PHASE 5 — N/A recovery (31/31) ==');
const na = app.LS_DATA.filter(r => r.ft === 'N/A — 10mm, no ring');
ok('31 records carry the recovered N/A label', na.length === 31, na.length);
ok('all 31 are Metal', na.every(r => r.f === 'MT'));
ok('none of the 31 is Unclassified', na.every(r => r.ft && !/unclassified/i.test(r.ft)));
ok('[VERIFY] kept separate from N/A', app.LS_DATA.filter(r => r.ft === '[VERIFY]').length === 3);
const ver = app.LS_DATA.filter(r => r.ft === '[VERIFY]').map(r => r.s).sort();
ok('the 3 [VERIFY] SKUs are exactly the documented ones',
   ver.join(',') === 'LSHG240BG,LSOL220CH,LSTF290BB', ver.join(','));
ok('fitting distribution 404/31/9/4/3', (() => {
  const c = {};
  app.LS_DATA.forEach(r => { c[r.ft] = (c[r.ft] || 0) + 1; });
  return c['Easy Fit'] === 404 && c['N/A — 10mm, no ring'] === 31 &&
         c['Pendant Light'] === 9 && c['Ceiling Mounted'] === 4 && c['[VERIFY]'] === 3;
})());

console.log('\n== PHASE 6 — Category row & switching ==');
const rowNow = parseCats();
ok('six category dropdowns — one per _SOT tab', rowNow.length === 6, rowNow.length);
ok('labels/order match the six sheet tabs',
   rowNow.map(c => c.label).join(' | ') ===
   'Ceiling Rose | Pendant Lamp Holder | Lampshade | Wall Arm | Lamp Holder | LED Bulbs',
   rowNow.map(c => c.label).join(' | '));
ok('Lampshade lists All + its five materials',
   cat('Lampshade').options.map(o => o.label).join('|') ===
   'Select|All Lampshade|Metal|Glass|Fabric|Crystal Glass|Natural Rope',
   cat('Lampshade').options.map(o => o.label).join('|'));
choose('Lampshade', '*');
ok('switched to Lampshade', app.state.cat === 'LS');
ok('total now 451', String(els.total.textContent) === '451', els.total.textContent);
ok('shown now 451', rowsShown() === 451, els.shown.textContent);
ok('breakdown lists the five materials',
   els.breakdown.textContent === 'Metal 352 · Glass 72 · Fabric 13 · Crystal Glass 9 · Natural Rope 5',
   els.breakdown.textContent);
ok('table rendered 451 rows', (els.tb.innerHTML.match(/<tr>/g) || []).length === 451,
   (els.tb.innerHTML.match(/<tr>/g) || []).length);
ok('no row renders the literal "undefined"', !els.tb.innerHTML.includes('>undefined<'));

console.log('\n== PHASE 7 — Level-2 / attribute dropdowns ==');
ok('shade-shape dropdown now visible', els.sub2.hidden === false);
ok('fitting dropdown now visible', els.attr.hidden === false);
ok('shade-shape dropdown offers All + 46 shapes', optsOf('sub2').length === 47, optsOf('sub2').length);
ok('fitting dropdown offers All + 5 classes', optsOf('attr').length === 6, optsOf('attr').length);
ok('shape options carry counts', /\(\d+\)$/.test(optsOf('sub2')[1].label), optsOf('sub2')[1].label);
ok('fitting dropdown includes the recovered N/A label',
   optsOf('attr').some(o => o.value === 'N/A — 10mm, no ring'));

console.log('\n== PHASE 8 — Lampshade filtering ==');
app.state.fam = 'GL'; app.render();
ok('Glass filter shows 72', rowsShown() === 72, els.shown.textContent);
app.state.fam = 'CG'; app.render();
ok('Crystal Glass filter shows 9', rowsShown() === 9, els.shown.textContent);
app.state.fam = '';
els.sub2.value = 'Cone'; fire(els.sub2, 'change', { target: { value: 'Cone' } });
const coneN = app.LS_DATA.filter(r => r.sh === 'Cone').length;
ok('shade-shape filter Cone matches dataset (' + coneN + ')', rowsShown() === coneN, els.shown.textContent);
els.sub2.value = ''; fire(els.sub2, 'change', { target: { value: '' } });
els.attr.value = 'N/A — 10mm, no ring';
fire(els.attr, 'change', { target: { value: 'N/A — 10mm, no ring' } });
ok('fitting filter isolates the 31 N/A rows', rowsShown() === 31, els.shown.textContent);
els.attr.value = ''; fire(els.attr, 'change', { target: { value: '' } });
ok('combined material + shape filter narrows correctly', (() => {
  app.state.fam = 'MT'; app.state.sub2 = 'Barn Slot'; app.render();
  const n = rowsShown();
  const want = app.LS_DATA.filter(r => r.f === 'MT' && r.sh === 'Barn Slot').length;
  app.state.fam = ''; app.state.sub2 = ''; app.render();
  return n === want && want > 0;
})());

console.log('\n== PHASE 9 — Lampshade search (SKU, category, shape, description) ==');
function searchN(q) { app.state.q = q; app.render(); const n = rowsShown(); app.state.q = ''; app.render(); return n; }
ok('search by SKU', searchN('lscy290bm') === 1);
ok('search by category (glass)', searchN('glass') >= 72);
ok('search by shade shape (barn slot)', searchN('barn slot') > 0);
ok('search by description (hemp)', searchN('hemp') > 0);
ok('search by fitting (pendant light)', searchN('pendant light') >= 9);

console.log('\n== PHASE 10 — CSV export ==');
const lsCsv = app.buildCSV(app.LS_DATA.filter(app.matches)).split('\r\n');
ok('Lampshade CSV has 25 columns (23 + shape + fitting)',
   lsCsv[0].split(',').length === 25, lsCsv[0].split(',').length);
ok('CSV header ends with the two extra columns',
   /Shade shape,Fitting type$/.test(lsCsv[0]), lsCsv[0].slice(-40));
ok('Lampshade CSV has 451 data rows', lsCsv.length === 452, lsCsv.length);
ok('Lampshade CSV Type column carries the material',
   app.csvRow(app.LS_DATA.find(r => r.f === 'GL'))[1] === 'Glass');

console.log('\n== PHASE 11 — switch back to Ceiling Rose ==');
choose('Ceiling Rose', '*');
ok('total restored to 332', String(els.total.textContent) === '332', els.total.textContent);
ok('breakdown restored', els.breakdown.textContent === 'CRSF 219 · CRFF 113', els.breakdown.textContent);
ok('table back to 332 rows', (els.tb.innerHTML.match(/<tr>/g) || []).length === 332);
ok('sub-category dropdown hidden again', els.sub2.hidden === true);
ok('attribute dropdown hidden again', els.attr.hidden === true);
ok('CR CSV back to 23 columns',
   app.buildCSV(app.DATA.slice(0, 2)).split('\r\n')[0].split(',').length === 23);

console.log('\n== PHASE 12 — single-file architecture & theme ==');
ok('no external scripts', !/<script[^>]+src=/.test(HTML));
ok('no external stylesheets', !/<link[^>]+stylesheet/.test(HTML));
ok('no network calls', !/\bfetch\s*\(|XMLHttpRequest/.test(HTML));
ok('no separate data file referenced', !/dashboard_data|\.json['"]/.test(HTML));
ok('single <table>', (HTML.match(/<table>/g) || []).length === 1);
ok('dark/light toggle present', /localStorage\.setItem\('crv-mode'/.test(HTML));
ok('theme button rendered', /Dark mode|Light mode/.test(els.theme.innerHTML));
ok('no WC/cage SKU data embedded', !/"s":"WC[A-Z0-9]/.test(HTML));

console.log('\n== PHASE 13 — Pendant Lamp Holder (398, sheet population) ==');
ok('PH_DATA has 398 SKUs', app.PH_DATA.length === 398, app.PH_DATA.length);
ok('398 distinct — no dashboard duplicate', new Set(app.PH_DATA.map(r => r.s)).size === 398);
ok('PHCGF1BMRBM appears exactly once',
   app.PH_DATA.filter(r => r.s === 'PHCGF1BMRBM').length === 1);
['PHBAF1BMRBM','PHCD1PBRBM','PHCD1PBRBW','PHFSH1PBRBM','PHSF1PBR20WH','PHTT1PBR5BM','PHTT1PWR5WH']
  .forEach(s => ok('duplicate ' + s + ' present once',
                   app.PH_DATA.filter(r => r.s === s).length === 1));
ok('0 bundle SKUs', app.PH_DATA.every(r => !r.s.includes('+')));
ok('0 pack SKUs', app.PH_DATA.every(r => !/[0-9]PK$/.test(r.s)));
ok('every SKU starts PH', app.PH_DATA.every(r => r.s.startsWith('PH')));
ok('100% image', app.PH_DATA.every(r => !!r.i));
ok('images absolute', app.PH_DATA.every(r => r.i.startsWith('https://sin1.contabostorage.com/')));
ok('100% description', app.PH_DATA.every(r => typeof r.d === 'string' && r.d.length > 0));
ok('Type is the section name, constant',
   app.PH_DATA.every(r => r.t === 'Pendant Lamp Holder'));
ok('100% Mount Type', app.PH_DATA.every(r => !!r.mt));

console.log('\n-- Mount Type: distinct-SKU counts (NOT the 294/112 row counts) --');
const pend = app.PH_DATA.filter(r => r.mt === 'Pendant').length;
const cpen = app.PH_DATA.filter(r => r.mt === 'Ceiling Pendant').length;
ok('Pendant = 291 distinct SKUs', pend === 291, pend);
ok('Ceiling Pendant = 107 distinct SKUs', cpen === 107, cpen);
ok('Mount Type total = 398', pend + cpen === 398, pend + cpen);
ok('only the two documented Mount Type values',
   new Set(app.PH_DATA.map(r => r.mt)).size === 2);

console.log('\n-- excluded populations must NOT appear --');
['PHCT80BMCBM','PHLSDG220BG','PHWPPBRBL','PHWC1PBRWO','PHCD1120PBRBW']
  .forEach(s => ok('DB-only single ' + s + ' excluded', !app.PH_DATA.some(r => r.s === s)));
['PHBB1BMRBM','PHMS1BMTBM','PHTD1BRTYB']
  .forEach(s => ok('DB-only EOL ' + s + ' excluded', !app.PH_DATA.some(r => r.s === s)));
['PHSF1AGTGB2PK','PHUH1HETBM2PK','PHAH2RBMBMEPK']
  .forEach(s => ok('pack/combo ' + s + ' excluded', !app.PH_DATA.some(r => r.s === s)));
ok('sheet EOL SKUs ARE kept (not silently removed)',
   ['PHBH1BRTYB','PHFH1PBRGS','PHHC1BMRYB'].every(s => app.PH_DATA.some(r => r.s === s)));

console.log('\n-- PH category declares no Level-1 --');
ok('PH fams is empty (sheet declares no category)', app.CATS.PH.fams.length === 0);
ok('PH exposes Mount Type as an attribute', app.CATS.PH.attr.label === 'Mount Type');
ok('PH declares no sub-category', !app.CATS.PH.sub2);
ok('Pendant Lamp Holder is no longer a GAP',
   parseCats().find(c => c.label === 'Pendant Lamp Holder').gap === false);

console.log('\n-- PH UI behaviour --');
choose('Pendant Lamp Holder', '*');
ok('switched to PH', app.state.cat === 'PH');
ok('total 398', String(els.total.textContent) === '398', els.total.textContent);
ok('shown 398', rowsShown() === 398, els.shown.textContent);
ok('breakdown falls back to Mount Type',
   els.breakdown.textContent === 'Ceiling Pendant 107 · Pendant 291', els.breakdown.textContent);
ok('table rendered 398 rows', (els.tb.innerHTML.match(/<tr>/g) || []).length === 398);
ok('no "undefined" rendered', !els.tb.innerHTML.includes('>undefined<'));
ok('category dropdown offers only All (no invented families)',
   cat('Pendant Lamp Holder').options.map(o => o.label).join('|') ===
   'Select|All Pendant Lamp Holder', cat('Pendant Lamp Holder').options.map(o => o.label).join('|'));
ok('Mount Type dropdown visible', els.attr.hidden === false);
ok('sub-category dropdown hidden (PH has none)', els.sub2.hidden === true);
ok('Mount Type dropdown offers All + 2', optsOf('attr').length === 3, optsOf('attr').length);
els.attr.value = 'Ceiling Pendant'; fire(els.attr, 'change', { target: { value: 'Ceiling Pendant' } });
ok('Mount Type filter -> 107', rowsShown() === 107, els.shown.textContent);
els.attr.value = 'Pendant'; fire(els.attr, 'change', { target: { value: 'Pendant' } });
ok('Mount Type filter -> 291', rowsShown() === 291, els.shown.textContent);
els.attr.value = ''; fire(els.attr, 'change', { target: { value: '' } });
ok('PH search by SKU', searchN('phtt1pbrbm') >= 1);
ok('PH search by description', searchN('umbrella holder') > 0);
ok('PH search by Mount Type', searchN('ceiling pendant') >= 107);
ok('PH search by product type', searchN('pendant lamp holder') === 398);
app.state.wh = 'a'; app.state.st = 'neg'; app.render();
const phNeg = app.PH_DATA.filter(r => r.a !== undefined && r.a !== null && r.a < 0).length;
ok('PH warehouse+stock filter matches dataset', rowsShown() === phNeg, els.shown.textContent + ' vs ' + phNeg);
app.state.wh = ''; app.state.st = ''; app.render();
const phCsv = app.buildCSV(app.PH_DATA.filter(app.matches)).split('\r\n');
ok('PH CSV has 24 columns (23 + Mount Type)', phCsv[0].split(',').length === 24, phCsv[0].split(',').length);
ok('PH CSV header ends with Mount Type', /Mount Type$/.test(phCsv[0]), phCsv[0].slice(-30));
ok('PH CSV has 398 data rows', phCsv.length === 399, phCsv.length);

console.log('\n== PHASE 14 — locked sections after PH added ==');
choose('Ceiling Rose', '*');
ok('CR total restored 332', String(els.total.textContent) === '332', els.total.textContent);
ok('CR breakdown restored', els.breakdown.textContent === 'CRSF 219 · CRFF 113', els.breakdown.textContent);
ok('CR CSV still 23 columns', app.buildCSV(app.DATA.slice(0,2)).split('\r\n')[0].split(',').length === 23);
choose('Lampshade', '*');
ok('LS total restored 451', String(els.total.textContent) === '451', els.total.textContent);
ok('LS breakdown restored',
   els.breakdown.textContent === 'Metal 352 · Glass 72 · Fabric 13 · Crystal Glass 9 · Natural Rope 5',
   els.breakdown.textContent);
ok('LS CSV still 25 columns',
   app.buildCSV(app.LS_DATA.slice(0,2)).split('\r\n')[0].split(',').length === 25);
choose('Ceiling Rose', '*');

console.log('\n== PHASE 15 — Wall Arm (180) & LED Bulbs (218) ==');
ok('WA_DATA has 180 SKUs', app.WA_DATA.length === 180, app.WA_DATA.length);
ok('WA 180 distinct', new Set(app.WA_DATA.map(r => r.s)).size === 180);
ok('WSFTWH (sheet duplicate) carried once', app.WA_DATA.filter(r => r.s === 'WSFTWH').length === 1);
ok('WA 100% image', app.WA_DATA.every(r => r.i && r.i.startsWith('https://sin1.contabostorage.com/')));
ok('WA 100% description', app.WA_DATA.every(r => r.d));
ok('WA 100% family', app.WA_DATA.every(r => r.f && r.t));
ok('WA 0 bundles/packs', app.WA_DATA.every(r => !r.s.includes('+') && !/[0-9A-Z]PK$/.test(r.s)));
ok('WA every SKU starts WS', app.WA_DATA.every(r => r.s.startsWith('WS')));
ok('LB_DATA has 218 SKUs', app.LB_DATA.length === 218, app.LB_DATA.length);
ok('LB 218 distinct', new Set(app.LB_DATA.map(r => r.s)).size === 218);
ok('LB 100% image', app.LB_DATA.every(r => r.i && r.i.startsWith('https://sin1.contabostorage.com/')));
ok('LB 100% description', app.LB_DATA.every(r => r.d));
ok('LB 100% family', app.LB_DATA.every(r => r.f && r.t));
ok('LB 0 bundles/packs', app.LB_DATA.every(r => !r.s.includes('+') && !/[0-9A-Z]PK$/.test(r.s)));
ok('LB every SKU starts LD', app.LB_DATA.every(r => r.s.startsWith('LD')));
['A60','Globe','ST64','Small-Shapes','WW-CW Range','Pin-Spot','Spiral-Filament','Filament-Deco','Deco-Colour','Exotic-Special']
  .forEach(f => ok('LB series present: ' + f, app.LB_DATA.some(r => r.t === f)));
ok('LB WW-CW Range = 51', app.LB_DATA.filter(r => r.t === 'WW-CW Range').length === 51);
ok('LB A60 = 22', app.LB_DATA.filter(r => r.t === 'A60').length === 22);
ok('WA main family = 118', app.WA_DATA.filter(r => r.f === 'WA').length === 118);
ok('Wall Arm is no longer a GAP', parseCats().find(c => c.label === 'Wall Arm').gap === false);
ok('LED Bulbs is no longer a GAP', parseCats().find(c => c.label === 'LED Bulbs').gap === false);
choose('Wall Arm', '*');
ok('WA total 180', String(els.total.textContent) === '180', els.total.textContent);
ok('WA rendered 180 rows', (els.tb.innerHTML.match(/<tr>/g) || []).length === 180);
ok('WA no "undefined"', !els.tb.innerHTML.includes('>undefined<'));
ok('WA CSV 23 columns', app.buildCSV(app.WA_DATA.slice(0,2)).split('\r\n')[0].split(',').length === 23);
ok('WA search works', searchN('swan neck') > 0);
choose('LED Bulbs', '*');
ok('LB total 218', String(els.total.textContent) === '218', els.total.textContent);
ok('LB rendered 218 rows', (els.tb.innerHTML.match(/<tr>/g) || []).length === 218);
ok('LB no "undefined"', !els.tb.innerHTML.includes('>undefined<'));
ok('LB CSV 23 columns', app.buildCSV(app.LB_DATA.slice(0,2)).split('\r\n')[0].split(',').length === 23);
ok('LB search works', searchN('filament') > 0);
choose('Ceiling Rose', '*');
ok('CR still 332 after WA/LB', String(els.total.textContent) === '332', els.total.textContent);
ok('CR breakdown still correct', els.breakdown.textContent === 'CRSF 219 · CRFF 113');

console.log('\n== PHASE 16 — Lamp Holder (226, validated sheet population) ==');
ok('LH_DATA has 226 SKUs', app.LH_DATA.length === 226, app.LH_DATA.length);
ok('LH 226 distinct', new Set(app.LH_DATA.map(r => r.s)).size === 226);
ok('LH 100% image', app.LH_DATA.every(r => r.i && r.i.startsWith('https://sin1.contabostorage.com/')));
ok('LH 100% description', app.LH_DATA.every(r => r.d));
ok('LH every SKU starts LH', app.LH_DATA.every(r => r.s.startsWith('LH')));
ok('LH 0 bundles', app.LH_DATA.every(r => !r.s.includes('+')));
ok('LH 0 packs', app.LH_DATA.every(r => !/[0-9A-Z]PK$/.test(r.s)));
ok('LH 0 "Combo Default Title." rows', app.LH_DATA.every(r => !/combo/i.test(r.d)));
console.log('\n-- the 21 excluded rows must NOT appear --');
['LHC1E27WH-IDE','LHNSE27BY-IDE','LHSHE27BY-IDE','LHCE27','LHNSE27']
  .forEach(s => ok('corrupt ' + s + ' excluded', !app.LH_DATA.some(r => r.s === s)));
['LHC1E27WH3PK','LHC1E27WH5PK','LHC1E27WHAPK','LHC6E27WH5PK','LHC6E27WHAPK']
  .forEach(s => ok('pack ' + s + ' excluded', !app.LH_DATA.some(r => r.s === s)));
ok('PHXSH1PBRWH stays in Pendant Lamp Holder only',
   !app.LH_DATA.some(r => r.s === 'PHXSH1PBRWH') &&
   app.PH_DATA.some(r => r.s === 'PHXSH1PBRWH'));
ok('base SKUs of the corrupt rows ARE kept',
   ['LHC1E27WH','LHNSE27BY','LHSHE27BY'].every(s => app.LH_DATA.some(r => r.s === s)));
console.log('\n-- no category invented --');
ok('LH fams is empty (sheet declares none)', app.CATS.LH.fams.length === 0);
ok('LH exposes Mount Type as an attribute', app.CATS.LH.attr.label === 'Mount Type');
ok('LH declares no sub-category', !app.CATS.LH.sub2);
ok('Type column is the constant section name', app.LH_DATA.every(r => r.t === 'Lamp Holder'));
ok('11 SKUs have no Mount Type and are NOT guessed',
   app.LH_DATA.filter(r => !r.mt).length === 11, app.LH_DATA.filter(r => !r.mt).length);
ok('Mount Type verbatim: Pendant = 139', app.LH_DATA.filter(r => r.mt === 'Pendant').length === 139);
ok('Mount Type verbatim: Ceiling = 25', app.LH_DATA.filter(r => r.mt === 'Ceiling').length === 25);
ok('Lamp Holder is no longer a GAP',
   parseCats().find(c => c.label === 'Lamp Holder').gap === false);
console.log('\n-- LH UI --');
choose('Lamp Holder', '*');
ok('LH total 226', String(els.total.textContent) === '226', els.total.textContent);
ok('LH rendered 226 rows', (els.tb.innerHTML.match(/<tr>/g) || []).length === 226);
ok('LH no "undefined"', !els.tb.innerHTML.includes('>undefined<'));
ok('LH category dropdown offers only All',
   cat('Lamp Holder').options.map(o => o.label).join('|') === 'Select|All Lamp Holder',
   cat('Lamp Holder').options.map(o => o.label).join('|'));
ok('Mount Type dropdown visible', els.attr.hidden === false);
ok('sub-category dropdown hidden', els.sub2.hidden === true);
ok('LH CSV has 24 columns (23 + Mount Type)',
   app.buildCSV(app.LH_DATA.slice(0,2)).split('\r\n')[0].split(',').length === 24);
ok('LH CSV header ends with Mount Type', /Mount Type$/.test(app.buildCSV(app.LH_DATA.slice(0,2)).split('\r\n')[0]));
ok('LH search by SKU', searchN('lhshe27yb') >= 1);
ok('LH search by description', searchN('bakelite') > 0);
els.attr.value = 'Pendant'; fire(els.attr, 'change', { target: { value: 'Pendant' } });
ok('Mount Type filter -> 139', rowsShown() === 139, els.shown.textContent);
els.attr.value = ''; fire(els.attr, 'change', { target: { value: '' } });
console.log('\n== PHASE 17 — all locked sections after Lamp Holder ==');
choose('Ceiling Rose', '*');
ok('CR 332 / CRSF 219 · CRFF 113', String(els.total.textContent) === '332' &&
   els.breakdown.textContent === 'CRSF 219 · CRFF 113');
ok('CR CSV still 23 columns', app.buildCSV(app.DATA.slice(0,2)).split('\r\n')[0].split(',').length === 23);
choose('Lampshade', '*');
ok('LS 451 restored', String(els.total.textContent) === '451');
choose('Pendant Lamp Holder', '*');
ok('PH 398 restored', String(els.total.textContent) === '398');
choose('Wall Arm', '*');
ok('WA 180 restored', String(els.total.textContent) === '180');
choose('LED Bulbs', '*');
ok('LB 218 restored', String(els.total.textContent) === '218');
ok('all six categories now live, 0 GAP chips',
   parseCats().filter(c => c.gap).length === 0, parseCats().filter(c => c.gap).length);
choose('Ceiling Rose', '*');

console.log('\n' + (fail ? 'FAILED' : 'ALL PASS') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
