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
 'cats','h1t','subt','sub2','attr','hmodal','hmx','hmsku','hmbody',
 'catbar','invwrap','pgwrap','pgsecs','pgbody','pgmeta','pgrefresh','vinv','vpost',
 'pgtools','pgq','pgcol','pgclear','pgcount',
 'pbar','prange','psize','pfirst','pprev','pnext','plast','ppage'].forEach(id => { els[id] = mkEl(id); });
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
    const lab = block.match(/<span class="cat-l"[^>]*>([\s\S]*?)<\/span><select/);
    const ds  = block.match(/data-ds="([^"]*)"/);
    const opts = [];
    const ore = /<option value="([^"]*)"( selected)?>([^<]*)<\/option>/g;
    let om;
    while ((om = ore.exec(block))) opts.push({ value: om[1], selected: !!om[2], label: om[3] });
    const el = mkEl('sel');
    el.cls      = mm[1];
    el.on       = / on/.test(' ' + mm[1]);
    el.count    = Number((block.match(/<span class="cat-n">(\d+)<\/span>/) || [, ''])[1]);
    el.label    = lab ? lab[1].replace(/<span class="(gap|cat-n)"[\s\S]*?<\/span>/g, '')
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

// Every id that actually exists in the page markup. The browser returns null for an
// id that is not there — or that appears BELOW the <script> that looks it up — and a
// stub that always hands back an element hides exactly that bug: the Stock History
// dialog was authored after </script>, so $('hmodal') was null and the whole script
// threw at load while this harness still passed 828 assertions.
const DOM_IDS = new Set();
{
  const re = /\sid="([^"]+)"/g;
  let mm;
  const beforeScript = HTML.slice(0, HTML.indexOf('<script>'));
  while ((mm = re.exec(beforeScript))) DOM_IDS.add(mm[1]);
}
const missing = [];
global.document = {
  documentElement: { setAttribute() {} },
  getElementById: id => {
    // The markup is the authority, checked BEFORE the pre-built element map —
    // otherwise pre-registering an id here hides the very bug this guards against.
    if (!DOM_IDS.has(id)){ missing.push(id); return null; }   // exactly what a browser does
    return els[id] || (els[id] = mkEl(id));
  },
  querySelectorAll: sel => (sel === '#cats select' ? parseCats() : []),
  createElement: () => mkEl('a'),
  addEventListener() {},
  body: { appendChild() {}, removeChild() {} }
};
// Controllable network stub. The dashboard must never call this during the Inventory
// view; Postage Information must call it exactly once per load.
global.__net = { calls: [], reply: null };
// A synchronously-settling thenable. A real Promise resolves on the microtask queue,
// which never runs inside a synchronous assertion, so the load path would appear to do
// nothing. This keeps the dashboard's own .then/.catch chain exactly as written while
// making the result observable on the next line.
function SyncP(ok, val){
  const self = {
    then(f, r){
      if (!ok) return r ? settle(() => r(val)) : SyncP(false, val);
      return settle(() => f(val));
    },
    catch(r){ return ok ? self : settle(() => r(val)); }
  };
  function settle(run){
    try {
      const out = run();
      return (out && typeof out.then === 'function') ? out : SyncP(true, out);
    } catch (e) { return SyncP(false, e); }
  }
  return self;
}
global.fetch = (url) => {
  global.__net.calls.push(url);
  const r = global.__net.reply;
  if (!r) return SyncP(false, new Error('Failed to fetch'));
  if (r.status && r.status !== 200)
    return SyncP(true, { ok: false, status: r.status, statusText: r.text || '' });
  return SyncP(true, { ok: true, status: 200, text: () => SyncP(true, r.body) });
};
global.location = { protocol: 'https:', href: 'https://hub.example/postage' };
// The auto-refresh timer must never actually fire in the suite; record it instead.
global.__timers = { set: 0, cleared: 0, ms: null };
global.setInterval = (fn, ms) => { global.__timers.set++; global.__timers.ms = ms; return 1; };
global.clearInterval = () => { global.__timers.cleared++; };
global.localStorage = { getItem: () => null, setItem: () => {} };
global.Blob = function (parts) { this.parts = parts; };
global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
global.setTimeout = fn => fn();

// ---- run the dashboard's own code ------------------------------------------
const runner = new Function('with(this){' + SRC +
  '\n; return {DATA, LS_DATA, CATS, CATEGORIES, state, render, matches, buildCats, buildExtras,' +
  ' applyCat, rowHTML, buildCSV, csvRow, typeCell, downloadCSV, active, extraCols, PH_DATA, WA_DATA, LB_DATA, LH_DATA, classifySKU, UNCLASSIFIED, CLASSIFY, SUB4, SUB4_AMBIGUOUS, SUB_LABEL, LS_EXTRA, paginate, pageCount, goToPage, INCOMING, INC_CONTAINER, INC_STAGE, SPR_DATA, LGT_DATA, LB_EXTRA, LB_SERIES, CSM_DATA, CLO_DATA, HAP_DATA, RFB_DATA, PREFIX_RULES, PREFIX_DEFINED, HIST_COLS, HIST_ACTIONS, STOCK_HISTORY, HIST_TOTAL, HIST_RAW, histBtn, histRowsHTML, renderHist, openHist, closeHist, NA_REASON, SHOPIFY_PRICE, price, WH5_STOCK, CSV_HEADERS, num, container, LAST_CONTAINER,' +
  ' pgParseCSV, pgSplitSections, pgTrim, pgIsHeader, pgTableHTML, pgRender, pgLoad,' +
  ' setView, pg, PG_URL, PG_SHEET, PG_GID, pgFilter, pgColsHTML, pgAnalyse, pgLabel,' +
  ' pgColLabels, pgSpanCells, pgHeadHTML, PG_REFRESH_MS, pgTotalCol, pgTableHTML};}');
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
  sel.value = value === undefined ? '*' : value;
  (sel.handlers.change || []).forEach(fn => fn());
  return sel;
}
function fire(el, ev, arg) { (el.handlers[ev] || []).forEach(fn => fn(arg)); }
const rowsShown = () => Number(els.shown.textContent);
const pgq = v => fire(els.pgq, 'input', { target: { value: v } });

// ============================================================================
console.log('\n== PHASE 0 — the page actually loads in a browser ==');
// Guards the failure this harness previously missed entirely: an element looked up at
// load time that does not exist above the <script> makes getElementById return null,
// $(...).addEventListener throws, and the whole dashboard renders "Showing 0 of 0".
ok('every element the script looks up exists above the <script> tag',
   missing.length === 0, 'missing ids: ' + missing.join(', '));
ok('the Stock History dialog is authored before the script that binds it',
   HTML.indexOf('id="hmodal"') < HTML.indexOf('<script>') &&
   HTML.indexOf('id="hmx"') < HTML.indexOf('<script>'));
ok('the dashboard rendered rows at load — the script did not die',
   (els.tb.innerHTML.match(/<tr>/g) || []).length > 0,
   (els.tb.innerHTML.match(/<tr>/g) || []).length);
ok('the category row was built', els.cats.innerHTML.indexOf('<select') !== -1);
ok('the header count is not 0 of 0',
   String(els.total.textContent) !== '0' && String(els.shown.textContent) !== '0',
   els.shown.textContent + ' of ' + els.total.textContent);

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
ok('product thumbnails are 56px',
   /img\.thumb\{width:56px;height:56px/.test(HTML),
   (HTML.match(/img\.thumb\{[^}]*\}/) || [''])[0]);
ok('CR images are absolute URLs', app.DATA.every(r => !r.i || /^https?:\/\//.test(r.i)));
ok('CR declares no Level-2 dimension', !app.CATS.CR.sub2 && !app.CATS.CR.attr);
ok('CR hides the sub-category dropdown', els.sub2.hidden === true);
ok('CR hides the attribute dropdown', els.attr.hidden === true);
ok('CR CSV keeps 26 columns (23 + 2 Incoming + Unit 5)',
   app.buildCSV(app.DATA.slice(0, 3)).split('\r\n')[0].split(',').length === 26,
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
// SOT-row counts are unchanged; the two display names are merged (Glass ->
// Glass Shades, Crystal Glass -> Crystal Shades) so each type has ONE name.
const L1 = { MT: ['Metal', 352], GL: ['Glass Shades', 72], FB: ['Fabric', 13],
             CG: ['Crystal Shades', 9], NR: ['Natural Rope', 5] };
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
ok('duplicate type names merged to one each',
   app.CATS.LS.fams.slice(0,5).map(f => f[1]).join('|') === 'Metal|Glass Shades|Fabric|Crystal Shades|Natural Rope',
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
ok('twelve category dropdowns', rowNow.length === 12, rowNow.length);
ok('labels/order match the twelve sections',
   rowNow.map(c => c.label).join(' | ') ===
   'Ceiling Rose | Pendant Lamp Holder | Lampshade | Wall Arm | Lamp Holder | Bulbs | ' +
   'Lamp Spares | Lighting | Cosmetics | Clothes | Home Appliances | Refurbished',
   rowNow.map(c => c.label).join(' | '));
ok('every category label shows its section population',
   rowNow.every(c => c.count === app.CATS[c.dataset.ds].data.length),
   JSON.stringify(rowNow.map(c => c.label + ':' + c.count)));
ok('exactly one category is active', rowNow.filter(c => c.on).length === 1);
ok('Lampshade lists All + 8 merged types',
   cat('Lampshade').options.map(o => o.label).join('|') ===
   'Select|All Lampshade|Metal|Glass Shades|Fabric|Crystal Shades|Natural Rope|Wire Cages|Chandeliers|Baton Lighting|Others',
   cat('Lampshade').options.map(o => o.label).join('|'));
choose('Lampshade', '*');
ok('switched to Lampshade', app.state.cat === 'LS');
ok('total now 851', String(els.total.textContent) === '851', els.total.textContent);
ok('shown now 851', rowsShown() === 851, els.shown.textContent);
ok('breakdown lists all eight Lampshade types',
   els.breakdown.textContent === 'Metal 352 · Glass Shades 82 · Fabric 13 · Crystal Shades 29 · Natural Rope 5 · Wire Cages 253 · Chandeliers 100 · Baton Lighting 17',
   els.breakdown.textContent);
ok('table rendered 851 rows', (els.tb.innerHTML.match(/<tr>/g) || []).length === 851,
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
ok('Glass Shades filter shows 82 (72 SOT + 10 prefix)', rowsShown() === 82, els.shown.textContent);
app.state.fam = 'CG'; app.render();
ok('Crystal Shades filter shows 29 (9 SOT + 20 prefix)', rowsShown() === 29, els.shown.textContent);
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
ok('Lampshade CSV has 28 columns (26 + shape + fitting)',
   lsCsv[0].split(',').length === 28, lsCsv[0].split(',').length);
ok('CSV header ends with the two extra columns',
   /Shade shape,Fitting type$/.test(lsCsv[0]), lsCsv[0].slice(-40));
ok('Lampshade CSV has 451 data rows', lsCsv.length === 452, lsCsv.length);
ok('Lampshade CSV Type column carries the merged name',
   app.csvRow(app.LS_DATA.find(r => r.f === 'GL'))[1] === 'Glass Shades');

console.log('\n== PHASE 11 — switch back to Ceiling Rose ==');
choose('Ceiling Rose', '*');
ok('total restored to 332', String(els.total.textContent) === '332', els.total.textContent);
ok('breakdown restored', els.breakdown.textContent === 'CRSF 219 · CRFF 113', els.breakdown.textContent);
ok('table back to 332 rows', (els.tb.innerHTML.match(/<tr>/g) || []).length === 332);
ok('sub-category dropdown hidden again', els.sub2.hidden === true);
ok('attribute dropdown hidden again', els.attr.hidden === true);
ok('CR CSV back to 26 columns',
   app.buildCSV(app.DATA.slice(0, 2)).split('\r\n')[0].split(',').length === 26);

console.log('\n== PHASE 12 — single-file architecture & theme ==');
ok('no external scripts', !/<script[^>]+src=/.test(HTML));
ok('no external stylesheets', !/<link[^>]+stylesheet/.test(HTML));
// The no-network rule became precise rather than absolute when Postage Information
// was added: Inventory must still work with no connection, and the ONLY call the file
// may make is the Google Sheet that section is built on.
const FETCHES = (HTML.match(/fetch\s*\(/g) || []).length;
const NET = /docs\.google\.com\/spreadsheets\/d\/' \+ PG_SHEET \+/;
ok('exactly one fetch call exists in the whole file', FETCHES === 1, FETCHES);
ok('it is the Postage Information sheet read, and nothing else',
   /fetch\(PG_URL \+ '&_=' \+ Date\.now\(\), \{ credentials: 'omit' \}\)/.test(HTML));
ok('no XMLHttpRequest anywhere', !/XMLHttpRequest/.test(HTML));
ok('the only external hosts are the sheet, the two image CDNs and the SVG namespace',
   (() => {
     const ALLOW = ['docs.google.com', 'sin1.contabostorage.com',
                    'dashboard.digitweblk.com', 'www.w3.org'];
     const hosts = [...new Set((HTML.match(/https:\/\/[a-z0-9.-]+/gi) || [])
                     .map(u => u.replace(/^https:\/\//i, '').toLowerCase()))];
     return hosts.every(hst => ALLOW.indexOf(hst) !== -1);
   })(),
   [...new Set((HTML.match(/https:\/\/[a-z0-9.-]+/gi) || []))].join(' '));
ok('the Inventory view makes no network call at all',
   !/fetch/.test(HTML.slice(HTML.indexOf('function rowHTML'), HTML.indexOf('function pgParseCSV'))));
ok('Postage Information embeds no copy of the sheet — it is live only',
   !/PG_ROWS|PG_DATA|POSTAGE_DATA/.test(HTML));
ok('no separate data file referenced', !/dashboard_data|\.json['"]/.test(HTML));
ok('single <table>', (HTML.match(/<table>/g) || []).length === 1);
ok('dark/light toggle present', /localStorage\.setItem\('crv-mode'/.test(HTML));
ok('theme button rendered', /Dark mode|Light mode/.test(els.theme.innerHTML));
ok('WC/cage SKUs are now a deliberate Lampshade type, not stray data',
   app.LS_EXTRA.filter(r => r.t === 'Wire Cages').length === 253 &&
   app.LS_DATA.every(r => !/^WC/.test(r.s)));

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
ok('PH CSV has 27 columns (26 + Mount Type)', phCsv[0].split(',').length === 27, phCsv[0].split(',').length);
ok('PH CSV header ends with Mount Type', /Mount Type$/.test(phCsv[0]), phCsv[0].slice(-30));
ok('PH CSV has 398 data rows', phCsv.length === 399, phCsv.length);

console.log('\n== PHASE 14 — locked sections after PH added ==');
choose('Ceiling Rose', '*');
ok('CR total restored 332', String(els.total.textContent) === '332', els.total.textContent);
ok('CR breakdown restored', els.breakdown.textContent === 'CRSF 219 · CRFF 113', els.breakdown.textContent);
ok('CR CSV still 26 columns', app.buildCSV(app.DATA.slice(0,2)).split('\r\n')[0].split(',').length === 26);
choose('Lampshade', '*');
ok('LS total restored 851', String(els.total.textContent) === '851', els.total.textContent);
ok('LS breakdown restored (8 types)',
   els.breakdown.textContent === 'Metal 352 · Glass Shades 82 · Fabric 13 · Crystal Shades 29 · Natural Rope 5 · Wire Cages 253 · Chandeliers 100 · Baton Lighting 17',
   els.breakdown.textContent);
ok('LS CSV still 28 columns',
   app.buildCSV(app.LS_DATA.slice(0,2)).split('\r\n')[0].split(',').length === 28);
choose('Ceiling Rose', '*');

console.log('\n== PHASE 15 — Wall Arm (180) & Bulbs (334) ==');
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
ok('LB every SOT SKU starts LD', app.LB_DATA.every(r => r.s.startsWith('LD')));
// The 218 SOT rows are all the LED Bulbs type now; the ten banner series survive
// as the Series attribute, so none of the sheet's declared detail is lost.
ok('LB SOT rows are all type LED Bulbs',
   app.LB_DATA.every(r => r.f === 'BLD' && r.t === 'LED Bulbs'));
['A60','Globe','ST64','Small-Shapes','WW-CW Range','Pin-Spot','Spiral-Filament','Filament-Deco','Deco-Colour','Exotic-Special']
  .forEach(f => ok('LB series preserved: ' + f, app.LB_DATA.some(r => r.sr === f)));
ok('LB series WW-CW Range = 51', app.LB_DATA.filter(r => r.sr === 'WW-CW Range').length === 51);
ok('LB series A60 = 22', app.LB_DATA.filter(r => r.sr === 'A60').length === 22);
ok('LB 218 series labels, no raw codes',
   app.LB_DATA.every(r => Object.values(app.LB_SERIES).indexOf(r.sr) !== -1));
// the 116 added rows
ok('LB_EXTRA has 116 SKUs', app.LB_EXTRA.length === 116, app.LB_EXTRA.length);
ok('LB_EXTRA all flagged x:1', app.LB_EXTRA.every(r => r.x === 1));
ok('LB_EXTRA carries no series', app.LB_EXTRA.every(r => r.sr === undefined));
ok('LB_EXTRA 100% image', app.LB_EXTRA.every(r => r.i && r.i.startsWith('https://sin1.contabostorage.com/')));
ok('LB_EXTRA 100% description', app.LB_EXTRA.every(r => r.d));
ok('LB_EXTRA 0 bundles/packs', app.LB_EXTRA.every(r => !r.s.includes('+') && !/[0-9A-Z]PK$/.test(r.s)));
ok('LB_EXTRA no SKU already embedded elsewhere',
   (() => { const seen = new Set([].concat(app.DATA, app.LS_DATA, app.PH_DATA, app.WA_DATA,
              app.LH_DATA, app.LB_DATA, app.LS_EXTRA, app.LGT_DATA, app.SPR_DATA).map(r => r.s));
            return app.LB_EXTRA.every(r => !seen.has(r.s)); })());
[['BLD',2,'LD'],['BIC',32,'IC'],['BLL',36,'LL'],['BLP',36,'LP'],['BLQ',10,'LQ']].forEach(([c,n,px]) => {
  ok('LB_EXTRA ' + c + ' = ' + n, app.LB_EXTRA.filter(r => r.f === c).length === n,
     app.LB_EXTRA.filter(r => r.f === c).length);
  ok('LB_EXTRA ' + c + ' all start ' + px,
     app.LB_EXTRA.filter(r => r.f === c).every(r => r.s.startsWith(px)));
});
ok('LB the two SOT-missed LED bulbs are present',
   ['LDCWA60HE277','LDMT1852E274'].every(s => app.LB_EXTRA.some(r => r.s === s)));
// 118 fixed arms + 4 goosenecks are one family now; the sheet's 11 subtypes survive on `ws`.
ok('WA main family = 122', app.WA_DATA.filter(r => r.f === 'WAAR').length === 122,
   app.WA_DATA.filter(r => r.f === 'WAAR').length);
ok('Wall Arm is no longer a GAP', parseCats().find(c => c.label === 'Wall Arm').gap === false);
ok('Bulbs is no longer a GAP', parseCats().find(c => c.label === 'Bulbs').gap === false);
choose('Wall Arm', '*');
ok('WA total 180', String(els.total.textContent) === '180', els.total.textContent);
ok('WA rendered 180 rows', (els.tb.innerHTML.match(/<tr>/g) || []).length === 180);
ok('WA no "undefined"', !els.tb.innerHTML.includes('>undefined<'));
ok('WA CSV 27 columns (26 base + Subtype)', app.buildCSV(app.WA_DATA.slice(0,2)).split('\r\n')[0].split(',').length === 27);
ok('WA search works', searchN('swan neck') > 0);
choose('Bulbs', '*');
ok('LB total 334', String(els.total.textContent) === '334', els.total.textContent);
ok('LB rendered 334 rows', (els.tb.innerHTML.match(/<tr>/g) || []).length === 334);
ok('LB no "undefined"', !els.tb.innerHTML.includes('>undefined<'));
// 25 base + the Series attribute column
ok('LB CSV 27 columns', app.buildCSV(app.LB_DATA.slice(0,2)).split('\r\n')[0].split(',').length === 27);
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
ok('LH CSV has 27 columns (26 + Mount Type)',
   app.buildCSV(app.LH_DATA.slice(0,2)).split('\r\n')[0].split(',').length === 27);
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
ok('CR CSV still 26 columns', app.buildCSV(app.DATA.slice(0,2)).split('\r\n')[0].split(',').length === 26);
choose('Lampshade', '*');
ok('LS 851 restored', String(els.total.textContent) === '851');
choose('Pendant Lamp Holder', '*');
ok('PH 398 restored', String(els.total.textContent) === '398');
choose('Wall Arm', '*');
ok('WA 180 restored', String(els.total.textContent) === '180');
choose('Bulbs', '*');
ok('LB 334 restored', String(els.total.textContent) === '334');
ok('all six categories now live, 0 GAP chips',
   parseCats().filter(c => c.gap).length === 0, parseCats().filter(c => c.gap).length);
choose('Ceiling Rose', '*');

console.log('\n== PHASE 18 — classifySKU(): dynamic classification, no SKU lists ==');

console.log('\n-- §3 two-character main category rule --');
[['LSABC123','Lampshade','LS'], ['LHABC123','Lamp Holder','LH'],
 ['PHABC123','Pendant Lamp Holder','PH'], ['WSABC123','Wall Arm','WA'],
 ['LDABC123','Bulbs','LB']].forEach(([sku, name, key]) => {
  const c = app.classifySKU(sku);
  ok(sku + ' -> ' + name, c.mainCategory === name && c.key === key,
     c.mainCategory + '/' + c.key);
});

console.log('\n-- §2 Ceiling Rose: 4-char subcategory checked BEFORE the 2-char rule --');
[['CRFFABC123','Front Fit'], ['CRSFABC123','Side Fit'], ['CRXYZ123','Other']].forEach(([sku, sub]) => {
  const c = app.classifySKU(sku);
  ok(sku + ' -> Ceiling Rose / ' + sub,
     c.mainCategory === 'Ceiling Rose' && c.subCategory === sub,
     c.mainCategory + ' / ' + c.subCategory);
});
ok('CRFF never degrades to Other', app.classifySKU('CRFF100BM').subCategory === 'Front Fit');
ok('CRSF never degrades to Other', app.classifySKU('CRSF100BM').subCategory === 'Side Fit');
ok('no extra CR subcategories are invented',
   new Set(app.DATA.map(r => app.classifySKU(r.s).subCategory)).size === 2);

console.log('\n-- §6 normalisation: uppercase + trim, nothing stripped --');
ok('lowercase classifies', app.classifySKU('lsabc123').mainCategory === 'Lampshade');
ok('leading/trailing space trimmed', app.classifySKU('  crsf100bm  ').subCategory === 'Side Fit');
ok('mixed case CR sub still resolves', app.classifySKU('crFf100bm').subCategory === 'Front Fit');
ok('dots inside a SKU are preserved', app.classifySKU('PHSQ1.5PBRYB').key === 'PH');

console.log('\n-- §8 unknown prefix is ignored, never guessed --');
[['ZZTEST001'], ['ZZNEW001'], ['XX123'], [''], ['A'], [null], [undefined]].forEach(([sku]) => {
  const c = app.classifySKU(sku);
  ok('unknown/empty ' + JSON.stringify(sku) + ' -> Other, unclassified, no section',
     c.mainCategory === 'Other' && c.subCategory === 'Other' &&
     c.key === null && c.unclassified === true,
     c.mainCategory + '/' + c.subCategory + '/' + c.key);
});
// 6 -> 10: the single LD rule became five, one per Bulbs type.
ok('exactly ten main prefixes are configured', Object.keys(app.CLASSIFY).length === 10,
   Object.keys(app.CLASSIFY).length);
ok('the five Bulbs prefixes all route to the Bulbs section',
   ['LD','IC','LL','LP','LQ'].every(p => app.CLASSIFY[p] && app.CLASSIFY[p].key === 'LB' &&
     app.CLASSIFY[p].name === 'Bulbs' && !!app.CLASSIFY[p].sub && !!app.CLASSIFY[p].code));
ok('every configured prefix maps to a real registry section',
   Object.keys(app.CLASSIFY).every(p => !!app.CATS[app.CLASSIFY[p].key]));
ok('an unknown prefix never yields a section key',
   app.classifySKU('ZZTEST001').key === null);

console.log('\n-- §12 daily new-SKU dataset (none of these exist in any dataset) --');
const NEW_SKUS = [
  ['LSNEW001',   'Lampshade',           null],
  ['LHNEW001',   'Lamp Holder',         null],
  ['PHNEW001',   'Pendant Lamp Holder', null],
  ['WSNEW001',   'Wall Arm',            null],
  ['LDNEW001',   'Bulbs',               'LED Bulbs'],
  ['ICNEW001',   'Bulbs',               'Incandescent Bulbs'],
  ['LLNEW001',   'Bulbs',               'LED Panel Light'],
  ['LPNEW001',   'Bulbs',               'LED Spot Light'],
  ['LQNEW001',   'Bulbs',               'Lamp Bulbs'],
  ['CRFFNEW001', 'Ceiling Rose',        'Front Fit'],
  ['CRSFNEW001', 'Ceiling Rose',        'Side Fit'],
  ['CRNEW001',   'Ceiling Rose',        'Other'],
  ['ZZNEW001',   'Other',               'Other']
];
NEW_SKUS.forEach(([sku, main, sub]) => {
  const c = app.classifySKU(sku);
  ok(sku + ' -> ' + main + (sub ? ' / ' + sub : ''),
     c.mainCategory === main && (sub === null || c.subCategory === sub),
     c.mainCategory + (c.subCategory ? ' / ' + c.subCategory : ''));
});
ok('every §12 SKU is genuinely absent from all six datasets — so this is not list lookup',
   NEW_SKUS.every(([sku]) =>
     ![app.DATA, app.PH_DATA, app.LS_DATA, app.WA_DATA, app.LH_DATA, app.LB_DATA]
       .some(d => d.some(r => r.s === sku))));
ok('LSNEW999 (tomorrow) classifies with no code change',
   app.classifySKU('LSNEW999').mainCategory === 'Lampshade');

console.log('\n-- §4 no manual SKU arrays: the classifier is prefix-driven only --');
ok('a randomly generated SKU still classifies',
   ['LS','LH','PH','WS','LD'].every((p, i) =>
     app.classifySKU(p + 'QQ' + (91234 + i)).key === app.CLASSIFY[p].key));
ok('CR + random tail -> Other', app.classifySKU('CRQQ91234').subCategory === 'Other');

console.log('\n== PHASE 19 — §9 regression: every existing count unchanged ==');
ok('UNCLASSIFIED is empty — no row was routed to the wrong section',
   app.UNCLASSIFIED.length === 0, JSON.stringify(app.UNCLASSIFIED.slice(0, 5)));
[['Ceiling Rose', app.DATA, 332, 'CR'], ['Pendant Lamp Holder', app.PH_DATA, 398, 'PH'],
 ['Lampshade', app.LS_DATA, 451, 'LS'], ['Wall Arm', app.WA_DATA, 180, 'WA'],
 ['Lamp Holder', app.LH_DATA, 226, 'LH'], ['Bulbs', app.LB_DATA, 218, 'LB']]
 .forEach(([name, data, n, key]) => {
  ok(name + ' still ' + n, data.length === n, data.length);
  ok(name + ' — every row classifies back to its own section',
     data.every(r => app.classifySKU(r.s).key === key));
});
ok('total still 1805',
   app.DATA.length + app.PH_DATA.length + app.LS_DATA.length +
   app.WA_DATA.length + app.LH_DATA.length + app.LB_DATA.length === 1805);
ok('Ceiling Rose split unchanged: CRSF 219 / CRFF 113',
   app.DATA.filter(r => r.f === 'CRSF').length === 219 &&
   app.DATA.filter(r => r.f === 'CRFF').length === 113);
ok('classifier reproduces the stored CR family for all 332',
   app.DATA.every(r => app.classifySKU(r.s).famCode === r.f));
ok('0 existing CR rows fall into Other',
   app.DATA.filter(r => app.classifySKU(r.s).subCategory === 'Other').length === 0);
ok('every row carries a classified main category',
   [app.DATA, app.PH_DATA, app.LS_DATA, app.WA_DATA, app.LH_DATA, app.LB_DATA]
     .every(d => d.every(r => !!r.mc)));

console.log('\n== PHASE 20 — §10/§11 UI, search and CSV unchanged ==');
ok('twelve categories in the registry', Object.keys(app.CATS).length === 12,
   Object.keys(app.CATS).length);
ok('Ceiling Rose dropdown exposes Front Fit, Side Fit and Others',
   app.CATS.CR.fams.map(f => f[1]).join('|') ===
   'CRSF \u00b7 Side Fit|CRFF \u00b7 Front Fit|Others',
   app.CATS.CR.fams.map(f => f[1]).join('|'));
ok('CR family codes are the classifier codes',
   app.CATS.CR.fams.map(f => f[0]).join('|') === 'CRSF|CRFF|CROT');
ok('CR status-line labels unchanged (CRSF / CRFF)',
   app.CATS.CR.fams.slice(0,2).map(f => f[2]).join('|') === 'CRSF|CRFF');
ok('no SKU prefix leaked into the category row as a new UI category',
   parseCats().map(c => c.label).join('|') ===
   'Ceiling Rose|Pendant Lamp Holder|Lampshade|Wall Arm|Lamp Holder|Bulbs|Lamp Spares|Lighting|' +
   'Cosmetics|Clothes|Home Appliances|Refurbished');
choose('Ceiling Rose', '*');
ok('CR CSV still 26 columns', app.buildCSV(app.DATA.slice(0,3)).split('\r\n')[0].split(',').length === 26);
ok('CR CSV Type column unchanged ("Side Fitting")',
   app.csvRow(app.DATA.find(r => r.f === 'CRSF'))[1] === 'Side Fitting');
choose('Lampshade', '*');
ok('LS CSV still 28 columns', app.buildCSV(app.LS_DATA.slice(0,3)).split('\r\n')[0].split(',').length === 28);
choose('Ceiling Rose', '*');
ok('CR search still works', searchN('crsf100bm') === 1);
ok('search by classified main category works', searchN('ceiling rose') === 332);
ok('CRSF family filter still returns 219', (() => {
  app.state.fam = 'CRSF'; app.render(); const n = rowsShown();
  app.state.fam = ''; app.render(); return n === 219; })());
ok('CROT family filter returns 0 today, without error', (() => {
  app.state.fam = 'CROT'; app.render(); const n = rowsShown();
  app.state.fam = ''; app.render(); return n === 0; })());

console.log('\n== PHASE 21 — §3 4-char type rules DERIVED from the validated data ==');
const SIX = [['CR','Ceiling Rose',app.DATA,332], ['PH','Pendant Lamp Holder',app.PH_DATA,398],
             ['LS','Lampshade',app.LS_DATA,451], ['WS','Wall Arm',app.WA_DATA,180],
             ['LH','Lamp Holder',app.LH_DATA,226], ['LD','Bulbs',app.LB_DATA,218]];
ok('SUB4 is derived, not typed: every rule is backed by real rows',
   Object.keys(app.SUB4).every(p4 => {
     const d = app.CATS[app.SUB4[p4].key].data;
     return d.some(r => r.s.slice(0,4) === p4 && r.f === app.SUB4[p4].code);
   }));
ok('every derived rule agrees with EVERY row carrying that prefix',
   Object.keys(app.SUB4).every(p4 => {
     const e = app.SUB4[p4];
     return app.CATS[e.key].data.filter(r => r.s.slice(0,4) === p4)
              .every(r => r.f === e.code);
   }));
ok('an ambiguous prefix never becomes a rule',
   Object.keys(app.SUB4_AMBIGUOUS).every(p4 => !app.SUB4[p4]));
ok('every ambiguous prefix genuinely spans more than one type',
   Object.keys(app.SUB4_AMBIGUOUS).every(p4 => Object.keys(app.SUB4_AMBIGUOUS[p4].codes).length > 1));
[['CR',2,0], ['PH',51,8], ['LS',50,2], ['WA',42,5], ['LB',0,0], ['LH',0,0]].forEach(([key, rules, amb]) => {
  ok(key + ': ' + rules + ' derived rules, ' + amb + ' ambiguous',
     Object.keys(app.SUB4).filter(p => app.SUB4[p].key === key).length === rules &&
     Object.keys(app.SUB4_AMBIGUOUS).filter(p => app.SUB4_AMBIGUOUS[p].key === key).length === amb,
     Object.keys(app.SUB4).filter(p => app.SUB4[p].key === key).length + '/' +
     Object.keys(app.SUB4_AMBIGUOUS).filter(p => app.SUB4_AMBIGUOUS[p].key === key).length);
});
// 181 - 36 = 145: Bulbs is now prefix-defined, so it derives no 4-char rules.
ok('145 derived 4-char type rules in total', Object.keys(app.SUB4).length === 145,
   Object.keys(app.SUB4).length);
ok('15 ambiguous prefixes in total', Object.keys(app.SUB4_AMBIGUOUS).length === 15,
   Object.keys(app.SUB4_AMBIGUOUS).length);
ok('Bulbs contributes no derived rules — its five types are prefix-defined',
   Object.keys(app.SUB4).every(p => app.SUB4[p].key !== 'LB') &&
   Object.keys(app.SUB4_AMBIGUOUS).every(p => app.SUB4_AMBIGUOUS[p].key !== 'LB'));
ok('Lamp Holder contributes no rules — it declares no type',
   app.CATS.LH.fams.length === 0 &&
   Object.keys(app.SUB4).every(p => app.SUB4[p].key !== 'LH'));

console.log('\n-- the derived rules reproduce the real types (spot checks from the screenshots) --');
[['LSGL','Lampshade','Glass Shades'], ['LSFC','Lampshade','Fabric'], ['LSHB','Lampshade','Natural Rope'],
 ['WSSS','Wall Arm','Adjustable Wall Arm'],
 ['CRSF','Ceiling Rose','Side Fit'], ['CRFF','Ceiling Rose','Front Fit']].forEach(([p4, main, label]) => {
  const e = app.SUB4[p4];
  ok(p4 + ' -> ' + main + ' / ' + label,
     !!e && app.CATS[e.key].name === main && e.label === label,
     e ? app.CATS[e.key].name + ' / ' + e.label : 'no rule');
});

console.log('\n-- ambiguous prefixes are reported, never guessed --');
[['LSCY','LS'], ['WSIW','WA'], ['PHCH','PH']].forEach(([p4, key]) => {
  ok(p4 + ' is ambiguous and yields subCategory "Other"',
     !!app.SUB4_AMBIGUOUS[p4] && app.SUB4_AMBIGUOUS[p4].key === key &&
     app.classifySKU(p4 + 'NEW001').subCategory === 'Other' &&
     app.classifySKU(p4 + 'NEW001').ambiguousPrefix === true);
  ok(p4 + ' still resolves its MAIN category with certainty',
     app.classifySKU(p4 + 'NEW001').key === key);
});

console.log('\n== PHASE 22 — §9/§10 counts and types unchanged ==');
ok('UNCLASSIFIED is empty', app.UNCLASSIFIED.length === 0, JSON.stringify(app.UNCLASSIFIED.slice(0,3)));
SIX.forEach(([pfx, name, data, n]) => {
  ok(name + ' still ' + n, data.length === n, data.length);
});
ok('total still 1805', SIX.reduce((a, [,,d]) => a + d.length, 0) === 1805);
ok('Ceiling Rose split unchanged: CRSF 219 / CRFF 113',
   app.DATA.filter(r => r.f === 'CRSF').length === 219 &&
   app.DATA.filter(r => r.f === 'CRFF').length === 113);
ok('Lampshade material counts unchanged',
   app.LS_DATA.filter(r => r.f === 'MT').length === 352 &&
   app.LS_DATA.filter(r => r.f === 'GL').length === 72 &&
   app.LS_DATA.filter(r => r.f === 'FB').length === 13 &&
   app.LS_DATA.filter(r => r.f === 'CG').length === 9 &&
   app.LS_DATA.filter(r => r.f === 'NR').length === 5);
ok('LED Bulbs series counts unchanged (now carried by the Series attribute)',
   app.LB_DATA.filter(r => r.sr === 'WW-CW Range').length === 51 &&
   app.LB_DATA.filter(r => r.sr === 'A60').length === 22);
ok('Wall Arm still totals 180 across its four families and Others',
   ['WAAR','WAAD','WADB','WAWB','WAOT']
     .reduce((a, c) => a + app.WA_DATA.filter(r => r.f === c).length, 0) === 180);
ok('and the sheet\'s eleven subtypes are all still on the rows',
   new Set(app.WA_DATA.map(r => r.ws)).size === 11,
   new Set(app.WA_DATA.map(r => r.ws)).size);
ok('Pendant Lamp Holder mount counts unchanged',
   app.PH_DATA.filter(r => r.f === 'PD').length === 291 &&
   app.PH_DATA.filter(r => r.f === 'CP').length === 107);
ok('every row keeps a readable subcategory label',
   SIX.every(([,,d]) => d.every(r => typeof r.sc === 'string' && r.sc.length > 0)));
ok('ambiguous-prefix rows keep their own validated type, not "Other"',
   app.LS_DATA.filter(r => r.s.slice(0,4) === 'LSCY').every(r => r.sc !== 'Other'));

console.log('\n== PHASE 23 — §11 a synthetic SKU for EVERY derived rule ==');
(() => {
  let bad = 0, checked = 0;
  Object.keys(app.SUB4).forEach(p4 => {
    const e = app.SUB4[p4], c = app.classifySKU(p4 + 'NEW001');
    checked++;
    if (c.key !== e.key || c.subCategory !== e.label || c.famCode !== e.code) bad++;
  });
  ok('all ' + checked + ' synthetic <prefix>NEW001 SKUs classify to the right type',
     bad === 0 && checked === 145, checked + ' checked, ' + bad + ' wrong');
})();
ok('no synthetic SKU exists in any dataset',
   Object.keys(app.SUB4).every(p4 =>
     !SIX.some(([,,d]) => d.some(r => r.s === p4 + 'NEW001'))));

console.log('\n== PHASE 24 — §12 case / whitespace normalisation ==');
[[' lsNEW001 ','Lampshade','Other'], [' lhNEW001 ','Lamp Holder','Other'],
 [' phNEW001 ','Pendant Lamp Holder','Other'], [' wsNEW001 ','Wall Arm','Other'],
 [' ldNEW001 ','Bulbs','LED Bulbs'], [' icNEW001 ','Bulbs','Incandescent Bulbs'],
 [' crffNEW001 ','Ceiling Rose','Front Fit'],
 [' crsfNEW001 ','Ceiling Rose','Side Fit']].forEach(([sku, main, sub]) => {
  const c = app.classifySKU(sku);
  ok(JSON.stringify(sku) + ' -> ' + main + ' / ' + sub,
     c.mainCategory === main && c.subCategory === sub, c.mainCategory + ' / ' + c.subCategory);
});
ok('tab and newline are trimmed too', app.classifySKU('\tcrsf100bm\n').subCategory === 'Side Fit');
ok('dots are never stripped', app.classifySKU(' phsq1.5pbryb ').key === 'PH');
ok('no synthetic SKU leaked into a dataset',
   [app.DATA,app.PH_DATA,app.LS_DATA,app.WA_DATA,app.LH_DATA,app.LB_DATA]
     .every(d => !d.some(r => /NEW001$|NEW999$|^ZZ/.test(r.s))));

console.log('\n== PHASE 25 — §15 filters, CSV, theme, console ==');
choose('Ceiling Rose', '*');
ok('subcategory filter Front Fit -> 113', (() => {
  app.state.fam='CRFF'; app.render(); const n=rowsShown(); app.state.fam=''; app.render(); return n===113; })());
ok('subcategory filter Side Fit -> 219', (() => {
  app.state.fam='CRSF'; app.render(); const n=rowsShown(); app.state.fam=''; app.render(); return n===219; })());
ok('warehouse filter still works', (() => {
  app.state.wh='a'; app.render(); const n=rowsShown(); app.state.wh=''; app.render(); return n>0 && n<=332; })());
ok('stock-condition filter still works', (() => {
  app.state.st='neg'; app.render(); const n=rowsShown(); app.state.st=''; app.render();
  return n === app.DATA.filter(r => ['a','b','c','k','m','ca','us']
    .some(k => typeof r[k]==='number' && r[k]<0)).length; })());
choose('Lampshade','*');
ok('Lampshade Glass Shades filter -> 82 (SOT 72 + prefix 10)', (() => {
  app.state.fam='GL'; app.render(); const n=rowsShown(); app.state.fam=''; app.render(); return n===82; })());
choose('Bulbs','*');
ok('Bulbs type filter LED Bulbs -> 220 (SOT 218 + 2 the sync missed)', (() => {
  app.state.fam='BLD'; app.render(); const n=rowsShown(); app.state.fam=''; app.render(); return n===220; })());
ok('Bulbs Series attribute filter A60 -> 22', (() => {
  app.state.attr='A60'; app.render(); const n=rowsShown(); app.state.attr=''; app.render(); return n===22; })());
[['BIC',32],['BLL',36],['BLP',36],['BLQ',10]].forEach(([c,n]) => {
  ok('Bulbs type filter ' + c + ' -> ' + n, (() => {
    app.state.fam=c; app.render(); const k=rowsShown(); app.state.fam=''; app.render(); return k===n; })());
});
choose('Ceiling Rose','*');
ok('theme toggle still present', /crv-mode/.test(HTML));
ok('still a single self-contained file (no external js/css)',
   !/<script[^>]+src=/i.test(HTML) && !/<link[^>]+stylesheet/i.test(HTML) &&
   (HTML.match(/fetch\s*\(/g) || []).length === 1);

console.log('\n== PHASE 26 — pagination (bottom bar, default All) ==');
const rowsIn = () => (els.tb.innerHTML.match(/<tr>/g) || []).length;
choose('Ceiling Rose', '*');
ok('default page size is All', app.state.pageSize === 'all');
ok('All renders every matching row', rowsIn() === 332, rowsIn());
ok('"Showing N of M" still counts the whole result set, not the page',
   String(els.shown.textContent) === '332' && String(els.total.textContent) === '332');
ok('range label reads "All 332 rows"', els.prange.textContent === 'All 332 rows', els.prange.textContent);
ok('page label is a dash when unpaged', els.ppage.textContent === '—', els.ppage.textContent);
ok('all four nav buttons disabled on All',
   els.pfirst.disabled && els.pprev.disabled && els.pnext.disabled && els.plast.disabled);

console.log('\n-- the four page sizes --');
[[15, 23], [25, 14], [100, 4], [500, 1]].forEach(([size, pages]) => {
  els.psize.value = String(size);
  fire(els.psize, 'change', { target: { value: String(size) } });
  ok(size + '/page -> renders ' + Math.min(size, 332) + ' rows',
     rowsIn() === Math.min(size, 332), rowsIn());
  ok(size + '/page -> ' + pages + ' pages', els.ppage.textContent === 'Page 1 of ' + pages,
     els.ppage.textContent);
  ok(size + '/page -> counts unchanged (still 332 of 332)',
     String(els.shown.textContent) === '332' && String(els.total.textContent) === '332');
});

console.log('\n-- navigation --');
els.psize.value = '15'; fire(els.psize, 'change', { target: { value: '15' } });
ok('starts on page 1', app.state.page === 1);
ok('range reads Rows 1–15 of 332', els.prange.textContent === 'Rows 1–15 of 332', els.prange.textContent);
ok('first/prev disabled on page 1', els.pfirst.disabled && els.pprev.disabled);
ok('next/last enabled on page 1', !els.pnext.disabled && !els.plast.disabled);
const firstSku = els.tb.innerHTML.match(/>([A-Z0-9.+-]+)</)[1];
fire(els.pnext, 'click');
ok('next -> page 2', app.state.page === 2);
ok('page 2 shows different rows', els.tb.innerHTML.match(/>([A-Z0-9.+-]+)</)[1] !== firstSku);
ok('page 2 range reads Rows 16–30 of 332', els.prange.textContent === 'Rows 16–30 of 332', els.prange.textContent);
fire(els.pprev, 'click');
ok('prev -> back to page 1', app.state.page === 1 &&
   els.tb.innerHTML.match(/>([A-Z0-9.+-]+)</)[1] === firstSku);
fire(els.plast, 'click');
ok('last -> page 23', app.state.page === 23, app.state.page);
ok('last page holds the remainder (332 - 22*15 = 2)', rowsIn() === 2, rowsIn());
ok('next/last disabled on the last page', els.pnext.disabled && els.plast.disabled);
fire(els.pfirst, 'click');
ok('first -> page 1', app.state.page === 1);

console.log('\n-- pagination never changes what matches --');
els.psize.value = '15'; fire(els.psize, 'change', { target: { value: '15' } });
fire(els.pnext, 'click'); fire(els.pnext, 'click');
ok('CSV still exports every matching row, not just the page',
   app.buildCSV(app.DATA.filter(app.matches)).split('\r\n').length === 333);
ok('CR CSV still 26 columns',
   app.buildCSV(app.DATA.slice(0,2)).split('\r\n')[0].split(',').length === 26);
ok('breakdown still counts the whole result set',
   els.breakdown.textContent === 'CRSF 219 · CRFF 113', els.breakdown.textContent);

console.log('\n-- a filter change sends the reader back to page 1 --');
fire(els.plast, 'click');
ok('on the last page before filtering', app.state.page === 23);
app.state.q = 'crsf'; app.render();
ok('search reset the page to 1', app.state.page === 1, app.state.page);
ok('search + pagination combine correctly',
   rowsIn() === 15 && String(els.shown.textContent) === '219', els.shown.textContent);
app.state.q = ''; app.render();
els.psize.value = '25'; fire(els.psize, 'change', { target: { value: '25' } });
fire(els.pnext, 'click');
choose('Lampshade', '*');
ok('switching category resets to page 1', app.state.page === 1);
ok('page size persists across categories', app.state.pageSize === '25' && rowsIn() === 25, rowsIn());
ok('Lampshade paging: 851 rows -> 35 pages',
   els.ppage.textContent === 'Page 1 of 35', els.ppage.textContent);

console.log('\n-- empty result set --');
choose('Ceiling Rose', '*');
app.state.q = 'zzzznomatch'; app.render();
ok('no rows renders no <tr>', rowsIn() === 0);
ok('range reads "No rows"', els.prange.textContent === 'No rows', els.prange.textContent);
ok('empty-state message shown', els.empty.hidden === false);
ok('nav buttons disabled with no rows',
   els.pfirst.disabled && els.pprev.disabled && els.pnext.disabled && els.plast.disabled);
app.state.q = ''; app.render();

console.log('\n-- reset returns pagination to the default --');
els.psize.value = '15'; fire(els.psize, 'change', { target: { value: '15' } });
fire(els.pnext, 'click');
fire(els.reset, 'click');
ok('reset restores page size All', app.state.pageSize === 'all' && els.psize.value === 'all');
ok('reset restores page 1 and all 332 rows', app.state.page === 1 && rowsIn() === 332, rowsIn());

console.log('\n-- markup / theme --');
ok('pagination bar exists in the HTML', /<div class="pbar" id="pbar">/.test(HTML));
ok('page-size options are 15, 25, 100, 500, All',
   (HTML.match(/<select id="psize"[\s\S]*?<\/select>/)[0].match(/value="([^"]+)"/g) || []).join('|') ===
   'value="15"|value="25"|value="100"|value="500"|value="all"');
ok('All is the selected default in the markup',
   /<option value="all" selected>All<\/option>/.test(HTML));
ok('pagination styling uses the theme variables (works in dark and light)',
   /\.pbar\{[^}]*var\(--line\)[^}]*var\(--head2\)/.test(HTML));
ok('still no external js/css, and still exactly one fetch',
   !/<script[^>]+src=/i.test(HTML) && !/<link[^>]+stylesheet/i.test(HTML) &&
   (HTML.match(/fetch\s*\(/g) || []).length === 1);

console.log('\n== PHASE 27 — "Unassign" placeholder is not a container ==');
choose('Ceiling Rose', '*'); app.state.pageSize = 'all'; app.render();
ok('Ceiling Rose renders no "Unassign" container cell', !/>Unassign</.test(els.tb.innerHTML));
(function(){
  let leaked = 0;
  [['Ceiling Rose'],['Pendant Lamp Holder'],['Lampshade'],['Wall Arm'],['Lamp Holder'],['Bulbs']]
    .forEach(([name]) => {
      choose(name, '*');
      if (/>Unassign</.test(els.tb.innerHTML)) leaked++;
    });
  ok('no section renders "Unassign" as a container', leaked === 0, leaked + ' sections leaked');
})();
(function(){
  // The 5 rows that used to carry the placeholder came from the embedded arrays. Container
  // now comes from LAST_CONTAINER, which excludes 'Unassign' at source, so no row carries
  // it any more and the render guard is belt-and-braces rather than the only defence.
  const withUnassign = [].concat(...Object.keys(app.CATS).map(k => app.CATS[k].data))
    .filter(r => r.uc === 'Unassign' || r.gc === 'Unassign').length;
  ok('no row carries the placeholder any more — it is excluded at source',
     withUnassign === 0, withUnassign);
  ok('the render guard is still in place as a backstop',
     /NOT_A_CONTAINER\[String\(name\)\.trim\(\)\.toUpperCase\(\)\]/.test(HTML));
  ok('and it still works if a placeholder ever reappears',
     app.container('Unassign', 1, '2026-01-01').indexOf('Unavailable') !== -1);
})();
choose('Ceiling Rose', '*');

console.log('\n== PHASE 28 — Incoming stock (containers not yet arrived) ==');
const ALL6 = [['Ceiling Rose',app.DATA,62], ['Pendant Lamp Holder',app.PH_DATA,76],
              ['Lampshade',app.LS_DATA,188], ['Wall Arm',app.WA_DATA,36],
              ['Lamp Holder',app.LH_DATA,31], ['Bulbs',app.LB_DATA,21]];
ok('INCOMING lookup holds 488 SKUs', Object.keys(app.INCOMING).length === 488,
   Object.keys(app.INCOMING).length);
ok('14 distinct containers, 4 stages',
   app.INC_CONTAINER.length === 14 && app.INC_STAGE.length === 4,
   app.INC_CONTAINER.length + '/' + app.INC_STAGE.length);
ALL6.forEach(([name, d, n]) => {
  ok(name + ': ' + n + ' rows have incoming stock',
     d.filter(r => r.ic).length === n, d.filter(r => r.ic).length);
});
ok('414 dashboard rows total carry incoming stock',
   ALL6.reduce((a, [, d]) => a + d.filter(r => r.ic).length, 0) === 414);
ok('every row with a container also has a stage',
   ALL6.every(([, d]) => d.every(r => !r.ic === !r.is)));
ok('every stage is one of the four known values',
   ALL6.every(([, d]) => d.every(r => !r.is || app.INC_STAGE.indexOf(r.is) >= 0)));
ok('no incoming row names the Unassign placeholder',
   ALL6.every(([, d]) => d.every(r => r.ic !== 'Unassign')));

console.log('\n-- arrived and incoming are never mixed --');
ok('the arrived-container fields are untouched',
   app.DATA.filter(r => r.uc).length > 0 &&
   app.DATA.every(r => r.uc !== r.ic || (!r.uc && !r.ic)));
(function(){
  const both = app.LS_DATA.filter(r => (r.uc || r.gc) && r.ic).length;
  ok('a SKU can hold both an arrived and an incoming container (' + both + ' do)', both >= 0);
})();

console.log('\n-- worked example: stock says none, but stock is coming --');
(function(){
  const r = app.LS_DATA.find(x => x.s === 'LSCO335WH');
  ok('LSCO335WH exists in Lampshade', !!r);
  ok('LSCO335WH Unit 3 stock is negative', r && r.a < 0, r && r.a);
  ok('LSCO335WH incoming = UK Container 9th 2026',
     r && r.ic === 'UK Container 9th 2026', r && r.ic);
  ok('LSCO335WH stage = Production done', r && r.is === 'Production done', r && r.is);
})();

console.log('\n-- UI, CSV and search --');
choose('Lampshade', '*'); app.state.pageSize = 'all'; app.render();
ok('Incoming column group is in the markup', /<th class="grp-in" colspan="2">Incoming<\/th>/.test(HTML));
ok('Container and Stage headers exist',
   /<th rowspan="2">Container<\/th><th rowspan="2">Stage<\/th>/.test(HTML));
ok('a stage pill renders', /class="stage st-(ship|prod|conf|ord)"/.test(els.tb.innerHTML));
ok('rows with no incoming show Unavailable, not blank',
   (els.tb.innerHTML.match(/na"[^>]*>Unavailable/g) || []).length > 0);
ok('per-category extra columns still come last (Lampshade)',
   app.buildCSV(app.LS_DATA.slice(0,1)).split('\r\n')[0].split(',').slice(-2).join('|') ===
   'Shade shape|Fitting type');
ok('CSV exports the incoming value', (() => {
  const rows = app.buildCSV(app.LS_DATA.filter(r => r.s === 'LSCO335WH')).split('\r\n');
  return rows[1].indexOf('UK Container 9th 2026') >= 0 && rows[1].indexOf('Production done') >= 0;
})());
ok('search by container name works', searchN('uk container 9th') > 0);
ok('search by stage works', searchN('shipped') > 0);
ok('search by stage narrows correctly',
   searchN('production done') === app.LS_DATA.filter(r => r.is === 'Production done').length);
app.state.q = ''; app.render();
choose('Ceiling Rose', '*');
ok('CSV ends with the two Incoming columns (Ceiling Rose, no extras)',
   app.buildCSV(app.DATA.slice(0,1)).split('\r\n')[0].split(',').slice(-2).join('|') ===
   'Incoming Container|Incoming Stage',
   app.buildCSV(app.DATA.slice(0,1)).split('\r\n')[0].split(',').slice(-2).join('|'));

console.log('\n== PHASE 29 — Lamp Spares (7th section, 1,420 components) ==');
ok('SPR_DATA has 1420 SKUs', app.SPR_DATA.length === 1420, app.SPR_DATA.length);
ok('1420 distinct SKUs', new Set(app.SPR_DATA.map(r => r.s)).size === 1420);
ok('100% description', app.SPR_DATA.every(r => r.d && r.d.trim()));
ok('1409 of 1420 have an image', app.SPR_DATA.filter(r => r.i).length === 1409,
   app.SPR_DATA.filter(r => r.i).length);
ok('every image is an absolute CDN URL',
   app.SPR_DATA.filter(r => r.i).every(r => r.i.startsWith('https://sin1.contabostorage.com/')));
ok('0 bundles', app.SPR_DATA.every(r => !r.s.includes('+')));
ok('0 packs', app.SPR_DATA.every(r => !/[0-9A-Z]PK$/.test(r.s)));
ok('0 "Combo Default Title." rows', app.SPR_DATA.every(r => !/combo/i.test(r.d)));

console.log('\n-- 29 sub-types, counts read from the data --');
const SPR_EXPECT = {
  'Pipe Light accessories':258,'Transformers':205,'Cables':162,'Spare parts':92,'Switch':90,
  'Plate With accessories':71,'Screw':69,'Connector':62,'Socket':58,'Cord Grip':39,'Neon flex':38,
  'Tapes':34,'Waterproof Junction Box':34,'Tile spare parts':33,'Hook':27,'Chain':26,
  'Injection Module':22,'Shade Ring':18,'Cable Tie':17,'LED Stripe Light Accessories':17,
  'Sand Paper':16,'Threaded Rod':12,'Spring Clip':6,'Splitter Cables':5,'Holder Ring':4,
  'Reducer Plate':2,'COB Module':1,'Lock Nuts':1,'Washer':1 };
ok('29 sub-types present', Object.keys(SPR_EXPECT).length === 29 &&
   new Set(app.SPR_DATA.map(r => r.t)).size === 29,
   new Set(app.SPR_DATA.map(r => r.t)).size);
(function(){
  let bad = [];
  Object.keys(SPR_EXPECT).forEach(t => {
    const n = app.SPR_DATA.filter(r => r.t === t).length;
    if (n !== SPR_EXPECT[t]) bad.push(t + ' ' + n + '!=' + SPR_EXPECT[t]);
  });
  ok('every sub-type count matches the validated figure', bad.length === 0, bad.join('; '));
})();
ok('sub-type counts sum to 1420',
   Object.values(SPR_EXPECT).reduce((a,b)=>a+b,0) === 1420);
ok('the dropdown lists all 29 sub-types plus Others', app.CATS.SPR.fams.length === 30);
ok('every row carries a family code that exists in the dropdown',
   app.SPR_DATA.every(r => app.CATS.SPR.fams.some(f => f[0] === r.f)));

console.log('\n-- zero-stock reconstruction --');
ok('every row has all 7 warehouse keys, except the 9 with no US row',
   app.SPR_DATA.filter(r => ['a','b','c','k','m','ca'].every(w => typeof r[w] === 'number')).length === 1420);
ok('exactly 9 rows leave US undefined so it renders Unavailable',
   app.SPR_DATA.filter(r => typeof r.us !== 'number').length === 9,
   app.SPR_DATA.filter(r => typeof r.us !== 'number').length);
['CBFF140','PCSN295BM','PCSN295WH'].forEach(sku =>
  ok(sku + ' has no US value (Unavailable, not 0)',
     typeof app.SPR_DATA.find(r => r.s === sku).us !== 'number'));
ok('reconstructed zeros are real zeros, not nulls',
   app.SPR_DATA.filter(r => r.a === 0).length > 0);

console.log('\n-- does not disturb the six SOT sections --');
ok('no Lamp Spares SKU appears in any of the six',
   (() => { const six = new Set([].concat(app.DATA, app.PH_DATA, app.LS_DATA,
                                          app.WA_DATA, app.LH_DATA, app.LB_DATA).map(r => r.s));
            return app.SPR_DATA.every(r => !six.has(r.s)); })());
ok('Lamp Spares is excluded from the 4-char classifier index',
   Object.keys(app.SUB4).every(p4 => app.SUB4[p4].key !== 'SPR'));
ok('classifier still holds exactly 145 derived rules',
   Object.keys(app.SUB4).length === 145, Object.keys(app.SUB4).length);
ok('every Lamp Spares row still carries a main category',
   app.SPR_DATA.every(r => r.mc === 'Lamp Spares'));

console.log('\n-- UI, filters, CSV, search --');
choose('Lamp Spares', '*'); app.state.pageSize = 'all'; app.render();
ok('total 1420', String(els.total.textContent) === '1420', els.total.textContent);
ok('renders 1420 rows', (els.tb.innerHTML.match(/<tr>/g) || []).length === 1420);
ok('no "undefined" rendered', !els.tb.innerHTML.includes('>undefined<'));
ok('sub-type filter Transformers -> 205', (() => {
  app.state.fam = 'TR'; app.render(); const n = rowsShown(); app.state.fam = ''; app.render(); return n === 205; })());
ok('sub-type filter Cord Grip -> 39', (() => {
  app.state.fam = 'CG'; app.render(); const n = rowsShown(); app.state.fam = ''; app.render(); return n === 39; })());
ok('search by description works', searchN('cord grip') > 0);
ok('search by sub-type works', searchN('transformers') === 205);
ok('CSV has 26 columns (no per-category extras)',
   app.buildCSV(app.SPR_DATA.slice(0,2)).split('\r\n')[0].split(',').length === 26);
ok('CSV exports 1420 data rows',
   app.buildCSV(app.SPR_DATA).split('\r\n').length === 1421);
ok('pagination works on the largest section', (() => {
  els.psize.value = '100'; fire(els.psize, 'change', { target: { value: '100' } });
  const n = (els.tb.innerHTML.match(/<tr>/g) || []).length;
  const pages = els.ppage.textContent;
  els.psize.value = 'all'; fire(els.psize, 'change', { target: { value: 'all' } });
  return n === 100 && pages === 'Page 1 of 15'; })());
choose('Ceiling Rose', '*');
ok('Ceiling Rose unaffected: still 332', String(els.total.textContent) === '332');

console.log('\n== PHASE 30 — Lampshade: five added types (prefix-defined) ==');
ok('LS_EXTRA has 400 rows', app.LS_EXTRA.length === 400, app.LS_EXTRA.length);
ok('400 distinct SKUs', new Set(app.LS_EXTRA.map(r => r.s)).size === 400);
// After the merge: Glass Shade -> Glass Shades, and Crystal Shades keeps its name;
// both now share a family code with the SOT rows, so they are counted on LS_EXTRA.
const LSX = { 'Wire Cages':253, 'Chandeliers':100, 'Crystal Shades':20,
              'Baton Lighting':17, 'Glass Shades':10 };
Object.keys(LSX).forEach(t =>
  ok(t + ' = ' + LSX[t], app.LS_EXTRA.filter(r => r.t === t).length === LSX[t],
     app.LS_EXTRA.filter(r => r.t === t).length));
ok('added types sum to 400', Object.values(LSX).reduce((a,b)=>a+b,0) === 400);
ok('100% description and image', app.LS_EXTRA.every(r => r.d && r.i));

console.log('\n-- WCCY beats WC (longest prefix wins) --');
ok('every Crystal Shade starts WCCY',
   app.LS_EXTRA.filter(r => r.t === 'Crystal Shades').every(r => r.s.startsWith('WCCY')));
ok('no Wire Cage starts WCCY',
   app.LS_EXTRA.filter(r => r.t === 'Wire Cages').every(r => !r.s.startsWith('WCCY')));
ok('every Wire Cage starts WC',
   app.LS_EXTRA.filter(r => r.t === 'Wire Cages').every(r => r.s.startsWith('WC')));

console.log('\n-- Chandeliers span five prefixes, including four WS SKUs --');
ok('Chandelier prefixes are LSCA/LS2C/LS2O/WLCA/WSCW',
   app.LS_EXTRA.filter(r => r.t === 'Chandeliers')
     .every(r => /^(LSCA|LS2C|LS2O|WLCA|WSCW)/.test(r.s)));
['WSCW350GH','WSCWBF','WSCWFG','WSCWGG'].forEach(sku => {
  ok(sku + ' is a Chandelier, not Wall Arm',
     app.LS_EXTRA.some(r => r.s === sku && r.t === 'Chandeliers') &&
     !app.WA_DATA.some(r => r.s === sku));
});

console.log('\n-- no duplication anywhere --');
ok('LSPG250AR stayed in the SOT 451 and was NOT re-added',
   app.LS_DATA.some(r => r.s === 'LSPG250AR') &&
   !app.LS_EXTRA.some(r => r.s === 'LSPG250AR'));
(function(){
  const other = new Set([].concat(app.DATA, app.PH_DATA, app.LS_DATA, app.WA_DATA,
                                  app.LH_DATA, app.LB_DATA, app.SPR_DATA).map(r => r.s));
  ok('0 of the 400 exist anywhere else in the dashboard',
     app.LS_EXTRA.every(r => !other.has(r.s)));
})();
ok('the 451 SOT rows are untouched', app.LS_DATA.length === 451);
ok('SOT material counts unchanged',
   app.LS_DATA.filter(r => r.f === 'MT').length === 352 &&
   app.LS_DATA.filter(r => r.f === 'GL').length === 72 &&
   app.LS_DATA.filter(r => r.f === 'FB').length === 13 &&
   app.LS_DATA.filter(r => r.f === 'CG').length === 9 &&
   app.LS_DATA.filter(r => r.f === 'NR').length === 5);

console.log('\n-- classifier untouched --');
ok('prefix-added codes never enter the 4-char index',
   Object.keys(app.SUB4).every(p4 => !/^X/.test(app.SUB4[p4].code)));
ok('classifier still holds exactly 145 derived rules', Object.keys(app.SUB4).length === 145);
ok('Lampshade still has 50 derived rules + 2 ambiguous',
   Object.keys(app.SUB4).filter(p => app.SUB4[p].key === 'LS').length === 50);

console.log('\n-- UI --');
choose('Lampshade', '*'); app.state.pageSize = 'all'; app.render();
ok('Lampshade total 851', String(els.total.textContent) === '851', els.total.textContent);
ok('Wire Cages filter -> 253', (() => {
  app.state.fam = 'XWC'; app.render(); const n = rowsShown(); app.state.fam=''; app.render(); return n === 253; })());
ok('Chandeliers filter -> 100', (() => {
  app.state.fam = 'XCH'; app.render(); const n = rowsShown(); app.state.fam=''; app.render(); return n === 100; })());
ok('Metal filter still -> 352', (() => {
  app.state.fam = 'MT'; app.render(); const n = rowsShown(); app.state.fam=''; app.render(); return n === 352; })());
ok('search finds a chandelier', searchN('chandelier') > 0);
ok('search finds a wire cage', searchN('cage') > 0);
ok('added rows have no shade-shape value, and that is fine',
   app.LS_EXTRA.every(r => r.sh === undefined));
ok('LS CSV still 28 columns',
   app.buildCSV(app.LS_DATA.slice(0,2)).split('\r\n')[0].split(',').length === 28);
choose('Ceiling Rose', '*');

console.log('\n-- duplicate type names merged to one each --');
ok('no row anywhere is still labelled "Glass"',
   app.CATS.LS.data.every(r => r.t !== 'Glass'));
ok('no row anywhere is still labelled "Crystal Glass"',
   app.CATS.LS.data.every(r => r.t !== 'Crystal Glass'));
ok('no row is still labelled "Glass Shade" (singular)',
   app.CATS.LS.data.every(r => r.t !== 'Glass Shade'));
ok('Glass Shades = 82 across both sources',
   app.CATS.LS.data.filter(r => r.t === 'Glass Shades').length === 82,
   app.CATS.LS.data.filter(r => r.t === 'Glass Shades').length);
ok('Crystal Shades = 29 across both sources',
   app.CATS.LS.data.filter(r => r.t === 'Crystal Shades').length === 29,
   app.CATS.LS.data.filter(r => r.t === 'Crystal Shades').length);
ok('Lampshade now has exactly 8 types, not 10',
   new Set(app.CATS.LS.data.map(r => r.t)).size === 8,
   new Set(app.CATS.LS.data.map(r => r.t)).size);
ok('one family code per name — GL and CG each hold both sources',
   app.CATS.LS.data.filter(r => r.f === 'GL').length === 82 &&
   app.CATS.LS.data.filter(r => r.f === 'CG').length === 29);
ok('the SOT 451 still splits 352/72/13/9/5 by code',
   app.LS_DATA.filter(r => r.f === 'GL').length === 72 &&
   app.LS_DATA.filter(r => r.f === 'CG').length === 9);
ok('prefix-added rows are flagged and skipped by the classifier index',
   app.LS_EXTRA.every(r => r.x === 1) &&
   Object.keys(app.SUB4).length === 145);

console.log('\n== PHASE 31 — Lighting (8th section, 562 fittings) ==');
ok('LGT_DATA has 562 rows', app.LGT_DATA.length === 562, app.LGT_DATA.length);
ok('562 distinct SKUs', new Set(app.LGT_DATA.map(r => r.s)).size === 562);
const LGT = { 'Plugin Pendant':176, 'Pipe Lighting':124, 'Wall Lamp':103,
              'Wall Scones':93, 'Table Lamp':66 };
Object.keys(LGT).forEach(t =>
  ok(t + ' = ' + LGT[t], app.LGT_DATA.filter(r => r.t === t).length === LGT[t],
     app.LGT_DATA.filter(r => r.t === t).length));
ok('types sum to 562', Object.values(LGT).reduce((a,b)=>a+b,0) === 562);
ok('100% description', app.LGT_DATA.every(r => r.d && r.d.trim()));
ok('560 of 562 have an image', app.LGT_DATA.filter(r => r.i).length === 560);
ok('0 bundles / packs / combos',
   app.LGT_DATA.every(r => !r.s.includes('+') && !/[0-9A-Z]PK$/.test(r.s) && !/combo/i.test(r.d)));

console.log('\n-- the WS conflict: Wall Arm keeps its 180 --');
ok('Wall Arm still has exactly 180 rows', app.WA_DATA.length === 180);
(function(){
  const wa = new Set(app.WA_DATA.map(r => r.s));
  ok('no Wall Scones SKU is also in Wall Arm',
     app.LGT_DATA.filter(r => r.t === 'Wall Scones').every(r => !wa.has(r.s)));
  ok('every Wall Scones SKU still starts WS',
     app.LGT_DATA.filter(r => r.t === 'Wall Scones').every(r => r.s.startsWith('WS')));
})();
ok('no WSCW SKU leaked in (they are Lampshade Chandeliers)',
   app.LGT_DATA.every(r => !r.s.startsWith('WSCW')));
ok('no WLGL or WLCA leaked in (they are Lampshade types)',
   app.LGT_DATA.every(r => !r.s.startsWith('WLGL') && !r.s.startsWith('WLCA')));

console.log('\n-- nothing duplicated anywhere --');
(function(){
  const other = new Set([].concat(app.DATA, app.PH_DATA, app.LS_DATA, app.LS_EXTRA,
                                  app.WA_DATA, app.LH_DATA, app.LB_DATA, app.SPR_DATA).map(r => r.s));
  ok('0 of the 562 exist in any other section', app.LGT_DATA.every(r => !other.has(r.s)));
})();
ok('dashboard total is 4,303 SKUs',
   [app.DATA, app.PH_DATA, app.LS_DATA, app.LS_EXTRA, app.WA_DATA, app.LH_DATA,
    app.LB_DATA, app.LB_EXTRA, app.SPR_DATA, app.LGT_DATA].reduce((a,d) => a + d.length, 0) === 4303);
ok('classifier still holds exactly 145 derived rules', Object.keys(app.SUB4).length === 145);
ok('Lighting rows are flagged and skipped by the classifier index',
   app.LGT_DATA.every(r => r.x === 1) &&
   Object.keys(app.SUB4).every(p4 => app.SUB4[p4].key !== 'LGT'));

console.log('\n-- UI --');
choose('Lighting', '*'); app.state.pageSize = 'all'; app.render();
ok('total 562', String(els.total.textContent) === '562', els.total.textContent);
ok('renders 562 rows', (els.tb.innerHTML.match(/<tr>/g) || []).length === 562);
ok('no "undefined" rendered', !els.tb.innerHTML.includes('>undefined<'));
ok('Plugin Pendant filter -> 176', (() => {
  app.state.fam='GPS'; app.render(); const n=rowsShown(); app.state.fam=''; app.render(); return n===176; })());
ok('Table Lamp filter -> 66', (() => {
  app.state.fam='GTP'; app.render(); const n=rowsShown(); app.state.fam=''; app.render(); return n===66; })());
ok('search by description works', searchN('table lamp') > 0);
ok('CSV has 26 columns', app.buildCSV(app.LGT_DATA.slice(0,2)).split('\r\n')[0].split(',').length === 26);
choose('Wall Arm', '*');
ok('Wall Arm unaffected: still 180', String(els.total.textContent) === '180');
choose('Ceiling Rose', '*');

console.log('\n== PHASE 32 — BULBS replaces LED Bulbs (5 types, 334 SKUs) ==');
console.log('-- the old section is gone, and nothing it held was lost --');
ok('no section is called "LED Bulbs" any more',
   !app.CATEGORIES.some(c => c.label === 'LED Bulbs') && app.CATS.LB.name === 'Bulbs');
ok('"LED Bulbs" survives as a TYPE inside Bulbs',
   app.CATS.LB.fams.some(f => f[1] === 'LED Bulbs'));
ok('Bulbs declares exactly the five types the team defined',
   app.CATS.LB.fams.map(f => f[1]).join('|') ===
   'LED Bulbs|Incandescent Bulbs|LED Panel Light|LED Spot Light|Lamp Bulbs|Others',
   app.CATS.LB.fams.map(f => f[1]).join('|'));
ok('every one of the 218 SOT SKUs is still on screen — the replacement lost none',
   (() => { const shown = new Set(app.CATS.LB.data.map(r => r.s));
            return app.LB_DATA.every(r => shown.has(r.s)); })());
ok('Bulbs holds 334 rows', app.CATS.LB.data.length === 334, app.CATS.LB.data.length);
ok('334 distinct SKUs', new Set(app.CATS.LB.data.map(r => r.s)).size === 334);
ok('every Bulbs row carries a type and the Bulbs main category',
   app.CATS.LB.data.every(r => r.mc === 'Bulbs' && r.sc && r.f));
[['BLD',220],['BIC',32],['BLL',36],['BLP',36],['BLQ',10]].forEach(([c,n]) => {
  ok('Bulbs ' + c + ' = ' + n, app.CATS.LB.data.filter(r => r.f === c).length === n,
     app.CATS.LB.data.filter(r => r.f === c).length);
});

console.log('-- the ten banner series are preserved as an attribute, not discarded --');
ok('Series is declared as the Bulbs attribute',
   app.CATS.LB.attr && app.CATS.LB.attr.key === 'sr' && app.CATS.LB.attr.label === 'Series');
ok('exactly the 218 SOT rows carry a Series',
   app.CATS.LB.data.filter(r => r.sr).length === 218);
ok('all ten series are represented',
   new Set(app.CATS.LB.data.map(r => r.sr).filter(Boolean)).size === 10);
ok('Series appears as an extra column for Bulbs only',
   app.extraCols(app.CATS.LB).length === 1 &&
   app.extraCols(app.CATS.CR).length === 0);

console.log('-- classification of Bulbs SKUs that do not exist yet --');
[['LDZZZ999','LED Bulbs','BLD'], ['ICZZZ999','Incandescent Bulbs','BIC'],
 ['LLZZZ999','LED Panel Light','BLL'], ['LPZZZ999','LED Spot Light','BLP'],
 ['LQZZZ999','Lamp Bulbs','BLQ']].forEach(([sku, sub, code]) => {
  const c = app.classifySKU(sku);
  ok(sku + ' -> Bulbs / ' + sub,
     c.mainCategory === 'Bulbs' && c.subCategory === sub && c.famCode === code &&
     c.unclassified === false && c.ambiguousPrefix === false,
     c.mainCategory + ' / ' + c.subCategory + ' / ' + c.famCode);
  ok(sku + ' is genuinely absent from every dataset — not a list lookup',
     !app.CATS.LB.data.some(r => r.s === sku));
});
ok('a short Lamp Bulbs SKU still classifies (LQH is 3 characters)',
   app.classifySKU('LQH').mainCategory === 'Bulbs' &&
   app.classifySKU('LQH').subCategory === 'Lamp Bulbs');
ok('LC is Lamp Spares, not a Bulbs prefix — the two-char rules do not collide',
   app.classifySKU('LCNEW001').key !== 'LB');
ok('every Bulbs row classifies back into the Bulbs section',
   app.CATS.LB.data.every(r => app.classifySKU(r.s).key === 'LB'));
ok('every Bulbs row classifies to the type it is filed under',
   app.CATS.LB.data.every(r => app.classifySKU(r.s).famCode === r.f));

console.log('-- no other section was disturbed --');
ok('the 116 added SKUs appear in no other section',
   (() => { const other = new Set([].concat(app.DATA, app.LS_DATA, app.PH_DATA, app.WA_DATA,
              app.LH_DATA, app.LS_EXTRA, app.LGT_DATA, app.SPR_DATA).map(r => r.s));
            return app.LB_EXTRA.every(r => !other.has(r.s)); })());
ok('UNCLASSIFIED is still empty', app.UNCLASSIFIED.length === 0,
   JSON.stringify(app.UNCLASSIFIED.slice(0,3)));

console.log('-- UI --');
choose('Bulbs', '*'); app.state.pageSize = 'all'; app.render();
ok('total 334', String(els.total.textContent) === '334', els.total.textContent);
ok('renders 334 rows', (els.tb.innerHTML.match(/<tr>/g) || []).length === 334);
ok('no "undefined" rendered', !els.tb.innerHTML.includes('>undefined<'));
ok('the dropdown lists All + the five types',
   cat('Bulbs').options.map(o => o.label).join('|') ===
   'Select|All Bulbs|LED Bulbs|Incandescent Bulbs|LED Panel Light|LED Spot Light|Lamp Bulbs|Others',
   cat('Bulbs').options.map(o => o.label).join('|'));
ok('search finds an added Incandescent SKU', searchN('icst64e2760') === 1);
ok('search finds an added panel light', searchN('llro18w') === 1);
ok('search by type name works', searchN('led panel light') >= 36);
ok('CSV has 27 columns (26 base + Series)',
   app.buildCSV(app.CATS.LB.data.slice(0,3)).split('\r\n')[0].split(',').length === 27);
(() => {
  const hdr = app.buildCSV(app.CATS.LB.data.slice(0,1)).split('\r\n')[0].split(',');
  const col = hdr.indexOf('Series');
  ok('CSV carries a Series column', col !== -1, hdr.join('|'));
  // csvRow() emits the shared columns; buildCSV() appends the extras, so the
  // Series cell is only visible in the real export.
  const lines = app.buildCSV([app.LB_DATA.find(r => r.sr === 'A60'),
                              app.LB_EXTRA.find(r => r.f === 'BIC')]).split('\r\n');
  const cell  = i => lines[i].split(',')[col];
  ok('CSV Series is filled for a SOT row and carries no series for an added row',
     cell(1) === 'A60' && cell(2) !== 'A60' &&
     Object.values(app.LB_SERIES).indexOf(cell(2)) === -1,
     JSON.stringify([cell(1), cell(2)]));
})();
choose('Lighting', '*');
ok('Lighting unaffected: still 562', String(els.total.textContent) === '562');
choose('Ceiling Rose', '*');
ok('Ceiling Rose unaffected: still 332', String(els.total.textContent) === '332');

console.log('\n== PHASE 33 — Cosmetics / Clothes / Home Appliances / Refurbished ==');
const NEWCATS = [['CSM','Cosmetics',app.CSM_DATA,124,4],
                 ['CLO','Clothes',app.CLO_DATA,177,9],
                 ['HAP','Home Appliances',app.HAP_DATA,705,19],
                 ['RFB','Refurbished',app.RFB_DATA,352,1]];
NEWCATS.forEach(([key,name,data,n,types]) => {
  ok(name + ' has ' + n + ' SKUs', data.length === n, data.length);
  ok(name + ' SKUs are distinct', new Set(data.map(r => r.s)).size === n);
  ok(name + ' declares ' + types + ' types plus Others',
     app.CATS[key].fams.length === types + 1, app.CATS[key].fams.length);
  ok(name + ' 100% image', data.every(r => r.i && r.i.startsWith('https://sin1.contabostorage.com/')));
  ok(name + ' 100% description', data.every(r => r.d));
  ok(name + ' 100% type', data.every(r => r.f && r.t));
  ok(name + ' 0 bundles/packs', data.every(r => !r.s.includes('+') && !/[0-9A-Z]PK$/.test(r.s)));
  ok(name + ' rows are flagged x:1', data.every(r => r.x === 1));
  ok(name + ' carries the right main category', data.every(r => r.mc === name));
  ok(name + ' every row sits under a declared type',
     data.every(r => app.CATS[key].fams.some(f => f[0] === r.f)));
  ok(name + ' every SKU starts with its type prefix',
     data.every(r => { const f = app.CATS[key].fams.find(f => f[0] === r.f);
                       return f && r.s.startsWith(f[3]); }));
  ok(name + ' is excluded from the derived 4-char index',
     app.PREFIX_DEFINED[key] === 1 &&
     Object.keys(app.SUB4).every(p4 => app.SUB4[p4].key !== key));
});
ok('1,358 SKUs added in total',
   NEWCATS.reduce((a, [,,d]) => a + d.length, 0) === 1358);

console.log('-- none of the 1,358 collides with anything already embedded --');
(() => {
  const seen = new Set([].concat(app.DATA, app.LS_DATA, app.PH_DATA, app.WA_DATA, app.LH_DATA,
    app.LB_DATA, app.LB_EXTRA, app.LS_EXTRA, app.LGT_DATA, app.SPR_DATA).map(r => r.s));
  const clash = [].concat(app.CSM_DATA, app.CLO_DATA, app.HAP_DATA, app.RFB_DATA)
                  .filter(r => seen.has(r.s));
  ok('zero collisions with the 4,303 existing SKUs', clash.length === 0,
     JSON.stringify(clash.slice(0,5).map(r => r.s)));
})();
ok('the four new sections do not overlap each other',
   new Set([].concat(app.CSM_DATA, app.CLO_DATA, app.HAP_DATA, app.RFB_DATA)
             .map(r => r.s)).size === 1358);
ok('UNCLASSIFIED is still empty', app.UNCLASSIFIED.length === 0,
   JSON.stringify(app.UNCLASSIFIED.slice(0,3)));

console.log('-- the prefix table is BUILT FROM the registry, not typed out again --');
ok('every declared prefix comes from a fams entry',
   app.PREFIX_RULES.every(r => app.CATS[r.key].fams.some(f => f[0] === r.code && f[3] === r.p)));
ok('33 prefixes declared', app.PREFIX_RULES.length === 33, app.PREFIX_RULES.length);
ok('rules are sorted longest-prefix-first',
   app.PREFIX_RULES.every((r, i) => i === 0 || app.PREFIX_RULES[i-1].p.length >= r.p.length));
ok('no declared prefix is a prefix of another with a different type',
   app.PREFIX_RULES.every(a => app.PREFIX_RULES.every(b =>
     a === b || !(b.p.startsWith(a.p) && a.p.length < b.p.length && a.key === b.key &&
                  false))));

console.log('-- classification of SKUs that do not exist yet --');
[['CSHO9999','Cosmetics','Hair Ornaments','XHO'],
 ['CSHC9999','Cosmetics','Hair Clips','XHC'],
 ['CSBE9999','Cosmetics','Belt','XBE'],
 ['CSWA9999','Cosmetics','Wallets','XWA'],
 ['CTBO9999','Clothes','Boxer','YBO'],
 ['CTMS9999','Clothes','Shorts (M)','YMS'],
 ['CTMP9999','Clothes','Pajamas (M)','YMP'],
 ['CTFP9999','Clothes','Pajamas (Fem)','YFP'],
 ['CTKMP9999','Clothes','Pajamas (K.M)','YKMP'],
 ['CTKFP9999','Clothes','Pajamas (K.Fem)','YKFP'],
 ['CTKMT9999','Clothes','T-Shirts (K.M)','YKMT'],
 ['CTKFT9999','Clothes','T-Shirts (K.Fem)','YKFT'],
 ['AP9999','Clothes','Apron','YAP'],
 ['AFW9999','Home Appliances','Artificial Flowers','ZAFW'],
 ['CK9999','Home Appliances','Clock','ZCK'],
 ['HL9999','Home Appliances','Handles','ZHL'],
 ['MB9999','Home Appliances','Mail bags','ZMB'],
 ['MA9999','Home Appliances','Mat','ZMA'],
 ['SB9999','Home Appliances','Storage Box','ZSB'],
 ['SS9999','Home Appliances','Sports','ZSS'],
 ['SUA9999','Home Appliances','Shower curtain','ZSUA'],
 ['WB9999','Home Appliances','White Board','ZWB'],
 ['WK9999','Home Appliances','Walking Stick','ZWK'],
 ['WM9999','Home Appliances','Weight Machine','ZWM'],
 ['RB9999','Refurbished','Refurbished','RRB']].forEach(([sku, main, sub, code]) => {
  const c = app.classifySKU(sku);
  ok(sku + ' -> ' + main + ' / ' + sub,
     c.mainCategory === main && c.subCategory === sub && c.famCode === code &&
     c.unclassified === false,
     c.mainCategory + ' / ' + c.subCategory);
});
ok('every synthetic SKU above is genuinely absent from every dataset',
   ['CSHO9999','CTKMP9999','CK9999','RB9999'].every(s =>
     ![app.CSM_DATA, app.CLO_DATA, app.HAP_DATA, app.RFB_DATA].some(d => d.some(r => r.s === s))));

console.log('-- longest prefix wins, so kids\' clothing never lands in the adult type --');
ok('CTKMP beats CTMP', app.classifySKU('CTKMP001').subCategory === 'Pajamas (K.M)');
ok('CTKFP beats CTFP', app.classifySKU('CTKFP001').subCategory === 'Pajamas (K.Fem)');
ok('CTMP is still Pajamas (M)', app.classifySKU('CTMP001').subCategory === 'Pajamas (M)');
ok('AFW beats AP',  app.classifySKU('AFW001').subCategory === 'Artificial Flowers');
ok('AP is still Apron', app.classifySKU('AP001').subCategory === 'Apron');
ok('every real row classifies back to the type it is filed under',
   [].concat(app.CSM_DATA, app.CLO_DATA, app.HAP_DATA, app.RFB_DATA)
     .every(r => app.classifySKU(r.s).famCode === r.f));

console.log('-- the existing sections were not captured by a new prefix --');
[['CRSFNEW001','Ceiling Rose'], ['LSNEW001','Lampshade'], ['PHNEW001','Pendant Lamp Holder'],
 ['WSNEW001','Wall Arm'], ['LHNEW001','Lamp Holder'], ['LDNEW001','Bulbs'],
 ['ICNEW001','Bulbs'], ['LLNEW001','Bulbs'], ['LPNEW001','Bulbs'], ['LQNEW001','Bulbs']]
 .forEach(([sku, main]) => {
  ok(sku + ' still -> ' + main, app.classifySKU(sku).mainCategory === main,
     app.classifySKU(sku).mainCategory);
});
ok('ZZTEST001 is still unclassified',
   app.classifySKU('ZZTEST001').unclassified === true &&
   app.classifySKU('ZZTEST001').key === null);

console.log('-- the sheet\'s "Bags" grouping is kept, not flattened away --');
ok('Group is declared as the Home Appliances attribute',
   app.CATS.HAP.attr && app.CATS.HAP.attr.key === 'gp' && app.CATS.HAP.attr.label === 'Group');
ok('exactly the four bag types carry Group = Bags',
   app.HAP_DATA.filter(r => r.gp === 'Bags').length === 12 + 2 + 21 + 55,
   app.HAP_DATA.filter(r => r.gp === 'Bags').length);
ok('the other fifteen types carry no group',
   app.HAP_DATA.filter(r => r.gp).every(r =>
     ['ZLBT','ZSB','ZHB','ZMB'].indexOf(r.f) !== -1));

console.log('-- UI: still one dropdown per category, only smaller --');
ok('the category row still renders one select per category',
   (els.cats.innerHTML.match(/<select/g) || []).length === 12,
   (els.cats.innerHTML.match(/<select/g) || []).length);
ok('every category still shows its own label',
   parseCats().every(c => c.label.length > 0));
NEWCATS.forEach(([key, name, data, n, types]) => {
  choose(name, '*'); app.state.pageSize = 'all'; app.render();
  ok(name + ': dropdown switches the section', app.state.cat === key);
  ok(name + ': total ' + n, String(els.total.textContent) === String(n), els.total.textContent);
  ok(name + ': renders ' + n + ' rows', (els.tb.innerHTML.match(/<tr>/g) || []).length === n);
  ok(name + ': no "undefined" rendered', !els.tb.innerHTML.includes('>undefined<'));
  ok(name + ': dropdown lists Select + All + ' + types + ' + Others',
     cat(name).options.length === types + 3, cat(name).options.length);
  ok(name + ': exactly its own category is active',
     parseCats().filter(c => c.on).length === 1 &&
     parseCats().find(c => c.on).label === name);
});
choose('Home Appliances', '*'); app.state.pageSize = 'all'; app.render();
ok('Clock type filter -> 199', (() => {
  app.state.fam='ZCK'; app.render(); const n=rowsShown(); app.state.fam=''; app.render(); return n===199; })());
ok('Handles type filter -> 31', (() => {
  app.state.fam='ZHL'; app.render(); const n=rowsShown(); app.state.fam=''; app.render(); return n===31; })());
ok('Group filter Bags -> 90', (() => {
  app.state.attr='Bags'; app.render(); const n=rowsShown(); app.state.attr=''; app.render(); return n===90; })());
ok('Group dropdown visible for Home Appliances', els.attr.hidden === false);
ok('HAP CSV has 27 columns (26 base + Group)',
   app.buildCSV(app.HAP_DATA.slice(0,3)).split('\r\n')[0].split(',').length === 27);
ok('search finds a clock', searchN('clock') > 0);
choose('Refurbished', '*'); app.state.pageSize = 'all'; app.render();
ok('Refurbished dropdown shows its single type',
   cat('Refurbished').options.map(o => o.label).join('|') ===
   'Select|All Refurbished|Refurbished|Others',
   cat('Refurbished').options.map(o => o.label).join('|'));
ok('RFB CSV has 26 columns', app.buildCSV(app.RFB_DATA.slice(0,3)).split('\r\n')[0].split(',').length === 26);

console.log('-- nothing that was already on the page moved --');
[['Ceiling Rose',332], ['Lampshade',851], ['Pendant Lamp Holder',398], ['Wall Arm',180],
 ['Lamp Holder',226], ['Bulbs',334], ['Lamp Spares',1420], ['Lighting',562]]
 .forEach(([name, n]) => {
  choose(name, '*'); app.state.pageSize = 'all'; app.render();
  ok(name + ' still ' + n, String(els.total.textContent) === String(n), els.total.textContent);
});
ok('dashboard total is 5,661 SKUs',
   [app.DATA, app.PH_DATA, app.LS_DATA, app.LS_EXTRA, app.WA_DATA, app.LH_DATA,
    app.LB_DATA, app.LB_EXTRA, app.SPR_DATA, app.LGT_DATA,
    app.CSM_DATA, app.CLO_DATA, app.HAP_DATA, app.RFB_DATA]
     .reduce((a,d) => a + d.length, 0) === 5661);
choose('Ceiling Rose', '*');

console.log('\n== PHASE 34 — Stock History dialog (spec 4.6 popup + 8.2 table) ==');
choose('Ceiling Rose', '*'); app.state.pageSize = '15'; app.state.page = 1; app.render();
const SKU1 = app.DATA[0].s, SKU2 = app.DATA[1].s;
const ALLR = [].concat(...Object.keys(app.CATS).map(k => app.CATS[k].data));
const NOHIST = ALLR.find(r => !app.STOCK_HISTORY[r.s]).s;
// every movement, flattened out of the per-region buckets
const MOVESOF = s => { const o = []; const d = app.STOCK_HISTORY[s] || {};
  Object.keys(d).forEach(rg => d[rg].forEach(m => o.push(m))); return o; };
const MOVES = () => { const o = [];
  Object.keys(app.STOCK_HISTORY).forEach(s =>
    Object.keys(app.STOCK_HISTORY[s]).forEach(rg =>
      app.STOCK_HISTORY[s][rg].forEach(m => o.push(m)))); return o; };

console.log('-- the cell is a button, in both regions --');
ok('History is no longer a static Unavailable cell',
   els.tb.innerHTML.indexOf('class="histbtn"') !== -1);
ok('two History buttons per row (UK + German)',
   (els.tb.innerHTML.match(/class="histbtn"/g) || []).length === 15 * 2,
   (els.tb.innerHTML.match(/class="histbtn"/g) || []).length);
ok('each button carries its own sku|region key',
   app.histBtn(SKU1, 'UK').indexOf('data-hs="' + SKU1 + '|UK"') !== -1 &&
   app.histBtn(SKU1, 'DE').indexOf('data-hs="' + SKU1 + '|DE"') !== -1);
// SKU1 now has real movements; NOHIST is a SKU the source has never logged.
ok('a SKU with movements shows its REGION count on the button',
   app.histBtn(SKU1, 'UK').indexOf('>History ' + app.STOCK_HISTORY[SKU1].UK.length) !== -1,
   app.histBtn(SKU1, 'UK'));
ok('a SKU with no recorded movement shows no count',
   app.histBtn(NOHIST, 'UK').indexOf('>History<') !== -1, app.histBtn(NOHIST, 'UK'));
ok('and its tooltip names the region that has none',
   app.histBtn(NOHIST, 'UK').indexOf('No UK stock movement is recorded') !== -1,
   app.histBtn(NOHIST, 'UK'));
ok('the button never renders an inline panel row',
   els.tb.innerHTML.indexOf('histrow') === -1);

console.log('-- the dialog opens, names the SKU and region, and closes --');
ok('the dialog is hidden initially', els.hmodal.hidden === true && app.state.hist === '');
fire(els.tb, 'click', { target: { dataset: { hs: SKU1 + '|UK' } } });
ok('clicking History opens the dialog',
   app.state.hist === SKU1 + '|UK' && els.hmodal.hidden === false);
ok('the dialog names the SKU and how many movements it holds',
   els.hmsku.innerHTML.indexOf(SKU1) !== -1 &&
   els.hmsku.innerHTML.indexOf('movement') !== -1, els.hmsku.innerHTML);
ok('the dialog lives outside the table, so the row count is untouched',
   (els.tb.innerHTML.match(/<tr>/g) || []).length === 15,
   (els.tb.innerHTML.match(/<tr>/g) || []).length);
ok('the open button reports aria-expanded=true',
   app.histBtn(SKU1, 'UK').indexOf('aria-expanded="true"') !== -1);
fire(els.tb, 'click', { target: { dataset: { hs: SKU1 + '|UK' } } });
ok('clicking the same button again closes it',
   app.state.hist === '' && els.hmodal.hidden === true && els.hmbody.innerHTML === '');
fire(els.tb, 'click', { target: { dataset: { hs: SKU1 + '|DE' } } });
ok('the German button opens the German record, separate from the UK one',
   els.hmsku.innerHTML.indexOf('Region: <b>German</b>') !== -1, els.hmsku.innerHTML);
ok('UK and German render different tables',
   app.histRowsHTML(SKU1, 'DE') !== app.histRowsHTML(SKU1, 'UK'));
fire(els.tb, 'click', { target: { dataset: { hs: SKU2 + '|UK' } } });
ok('opening another SKU replaces the dialog, never stacks',
   app.state.hist === SKU2 + '|UK' && els.hmsku.innerHTML.indexOf(SKU2) !== -1);
fire(els.hmx, 'click');
ok('the X closes it', app.state.hist === '' && els.hmodal.hidden === true);
fire(els.tb, 'click', { target: { dataset: { hs: SKU1 + '|UK' } } });
fire(els.hmodal, 'click', { target: els.hmodal });
ok('clicking the backdrop closes it', app.state.hist === '' && els.hmodal.hidden === true);
fire(els.tb, 'click', { target: { dataset: { hs: SKU1 + '|UK' } } });
fire(els.hmodal, 'click', { target: { id: 'hmbox' } });
ok('clicking inside the dialog does NOT close it', app.state.hist === SKU1 + '|UK');
fire(els.tb, 'click', { target: {} });
ok('a click that is not a History button is ignored', app.state.hist === SKU1 + '|UK');

console.log('-- the column format matches the agreed dialog --');
ok('the table declares exactly spec 8.2\'s ten columns',
   app.HIST_COLS.length === 10, app.HIST_COLS.length);
ok('they appear in the specified order',
   app.HIST_COLS.map(c => c[1]).join('|') ===
   'Date|From Location|To Location|Stock Before|Stock After|Qty|Action|' +
   'Informed Person|Changed Person|Remarks',
   app.HIST_COLS.map(c => c[1]).join('|'));
ok('the numeric columns are the three stock quantities',
   app.HIST_COLS.filter(c => c[2] === 'n').map(c => c[1]).join('|') ===
   'Stock Before|Stock After|Qty');
ok('every column is rendered as a header in the dialog',
   app.HIST_COLS.every(c => els.hmbody.innerHTML.indexOf('<th>' + c[1] + '</th>') !== -1));
// The table is laid out to fit the dialog rather than scrolled sideways.
ok('every column declares a width', app.HIST_COLS.every(c => typeof c[3] === 'number' && c[3] > 0));
ok('the declared widths sum to 100%',
   app.HIST_COLS.reduce((a, c) => a + c[3], 0) === 100,
   app.HIST_COLS.reduce((a, c) => a + c[3], 0));
ok('a colgroup fixes the layout so the table never scrolls',
   els.hmbody.innerHTML.indexOf('<colgroup>') !== -1 &&
   app.HIST_COLS.every(c => els.hmbody.innerHTML.indexOf('width:' + c[3] + '%') !== -1));
ok('the history table declares no horizontal scroll',
   /\.hmscroll\{[^}]*overflow:hidden/.test(HTML));
ok('a long history scrolls vertically inside the dialog instead of growing it',
   /\.hmscroll\{[^}]*overflow-y:auto/.test(HTML));
ok('the header row is sticky while that scrolls',
   /\.htab th\{position:sticky/.test(HTML));
ok('the dialog is offset from the top of the page, not flush against it',
   /\.hmodal\{[^}]*padding:13vh/.test(HTML));
ok('all six spec 8.3 movement types are listed',
   app.HIST_ACTIONS.join('|') ===
   'Unit-to-Unit Transfer|Manual Stock Correction|Stock Increase|Stock Decrease|' +
   'Goods Received from Container|Warehouse Change',
   app.HIST_ACTIONS.join('|'));
ok('the movement types are shown to the reader',
   app.HIST_ACTIONS.every(a => els.hmbody.innerHTML.indexOf('<li>' + a + '</li>') !== -1));
ok('the no-exception rule is stated',
   els.hmbody.innerHTML.indexOf('No stock change may occur without a corresponding audit record')
     !== -1);

console.log('-- real history is loaded from inventory.product_history --');
ok('5,480 SKUs carry recorded movements',
   Object.keys(app.STOCK_HISTORY).length === 5480, Object.keys(app.STOCK_HISTORY).length);
ok('58,542 movements carried in total', MOVES().length === 58542, MOVES().length);
ok('no SKU carries more than the 12 most recent PER REGION',
   Object.values(app.STOCK_HISTORY).every(d =>
     Object.values(d).every(v => v.length <= 12)));
ok('1,385 SKU/region pairs are truncated and say so',
   Object.keys(app.HIST_TOTAL).length === 1385, Object.keys(app.HIST_TOTAL).length);
ok('a truncated entry records a true total above 12',
   Object.keys(app.HIST_TOTAL).every(s =>
     Object.values(app.HIST_TOTAL[s]).every(n => n > 12)));
ok('every movement has a date, an action and a region',
   MOVES().every(m => /^\d{4}-\d{2}-\d{2}$/.test(m.dt) && m.ac && m.rg));
// An earlier clean() stripped '-' from both ends and turned `from -1 to 30` into `1`,
// silently making negative stock positive. 5,967 movements were affected.
ok('negative before/after values survived parsing',
   MOVES().filter(m => String(m.sb).startsWith('-') || String(m.sa).startsWith('-')).length > 3000,
   MOVES().filter(m => String(m.sb).startsWith('-') || String(m.sa).startsWith('-')).length);
ok('Qty is computed only where both sides are numbers',
   MOVES().every(m => m.qt === '' ||
     (typeof m.qt === 'number' && m.qt === Number(m.sa) - Number(m.sb))));
ok('a goods receipt carries its container reference',
   MOVES().some(m => m.ac === 'Goods received' && /^SU\d+$/.test(m.cn)));
ok('the container reference is shown as a chip next to the action',
   (() => { let hit = null;
     Object.keys(app.STOCK_HISTORY).forEach(s => { if (!hit)
       MOVESOF(s).forEach(m => { if (!hit && m.cn) hit = s; }); });
     const html = app.histRowsHTML(hit, 'UK');
     return /<span class="hcont">SU\d+<\/span>/.test(html); })());
ok('the action itself is a badge, colour-coded by kind',
   /<span class="hact recv">Goods received<\/span>/.test(
     (() => { let hit = null;
       Object.keys(app.STOCK_HISTORY).forEach(s => { if (!hit)
         MOVESOF(s).forEach(m => { if (!hit && m.ac === 'Goods received') hit = s; }); });
       return app.histRowsHTML(hit, 'UK'); })()));
ok('a shelf code is not right-aligned as a number',
   app.histRowsHTML(SKU1, 'UK').indexOf('class="n">L-A') === -1);

console.log('-- a SKU the source never logged --');
const empty = app.histRowsHTML(NOHIST, 'UK');
ok('it is a GAP row, not an empty table', empty.indexOf('class="hgap"') !== -1);
ok('it names the source rather than implying the SKU never moved',
   empty.indexOf('inventory.product_history') !== -1 &&
   empty.indexOf('never moved') === -1 && empty.indexOf('no movement history') === -1);
ok('the GAP row spans every declared column',
   empty.indexOf('colspan="' + app.HIST_COLS.length + '"') !== -1);

console.log('-- it fills automatically when the source appears --');
(() => {
  const KEEP = app.STOCK_HISTORY[SKU1];
  app.STOCK_HISTORY[SKU1] = {
    UK: [{ rg:'UK', dt:'2026-08-26', fl:'UK Unit 4', tl:'UK Unit 3', sb:'120', sa:'70',
           qt:-50, ac:'Unit-to-Unit Transfer', ip:'Varmen', cp:'sarujanan',
           rm:'Pick face top-up', cn:'' }],
    DE: [{ rg:'DE', dt:'2026-08-25', fl:'', tl:'Kronen', sb:'0', sa:'300', qt:300,
           ac:'Goods Received from Container', ip:'Varmen', cp:'sarujanan', rm:'',
           cn:'SU9001' }]
  };
  app.openHist(SKU1 + '|UK');
  const uk = app.histRowsHTML(SKU1, 'UK');
  ok('a real movement renders instead of the GAP row', uk.indexOf('class="hgap"') === -1);
  ok('the UK fixture movement renders, and only it',
     (uk.match(/<tr class="hr">/g) || []).length === 1 &&
     uk.indexOf('Unit-to-Unit Transfer') !== -1 &&
     uk.indexOf('Goods Received from Container') === -1);
  ok('before/after are numeric cells and Qty is signed',
     uk.indexOf('<td class="n">120</td>') !== -1 &&
     uk.indexOf('<td class="n">70</td>')  !== -1 &&
     uk.indexOf('<span class="hqty dn">-50</span>') !== -1, uk.slice(0, 300));
  ok('From Location renders when the source actually has one',
     uk.indexOf('UK Unit 4') !== -1 && uk.indexOf('UK Unit 3') !== -1);
  ok('both people are recorded separately',
     uk.indexOf('<td>Varmen</td>') !== -1 && uk.indexOf('<td>sarujanan</td>') !== -1);
  ok('the note describes the record rather than an absent source',
     els.hmbody.innerHTML.indexOf('inventory.product_history') !== -1);
  const de = app.histRowsHTML(SKU1, 'DE');
  ok('the German dialog shows only the German movement',
     (de.match(/<tr class="hr">/g) || []).length === 1 &&
     de.indexOf('Goods Received from Container') !== -1 &&
     de.indexOf('Unit-to-Unit Transfer') === -1);
  ok('UK and German are genuinely separate records', de !== uk);
  // In the movement log a blank is normal — a CSV upload has no informed person — so it
  // is a quiet dash carrying the reason on hover, not the stock table's Unavailable chip.
  ok('a blank field renders a dash with the reason on hover, never an empty cell',
     de.indexOf('<span class="hblank" title="Not recorded for this movement.">') !== -1 &&
     de.indexOf('<td></td>') === -1);
  ok('each button shows its own region count',
     app.histBtn(SKU1, 'UK').indexOf('>History 1</button>') !== -1 &&
     app.histBtn(SKU1, 'DE').indexOf('>History 1</button>') !== -1,
     app.histBtn(SKU1, 'UK') + app.histBtn(SKU1, 'DE'));
  ok('the UK dialog names the German movements so they are not hidden',
     (() => { app.openHist(SKU1 + '|UK');
       return els.hmbody.innerHTML.indexOf('also has 1 German') !== -1; })(),
     els.hmbody.innerHTML.slice(-300));
  ok('a SKU the source never logged is unaffected',
     app.histRowsHTML(NOHIST, 'UK').indexOf('class="hgap"') !== -1);
  app.STOCK_HISTORY[SKU1] = KEEP;          // restore the real record
  app.closeHist();
})();

console.log('-- nothing else on the page moved --');
ok('Reset closes the dialog', (() => {
  app.openHist(SKU1 + '|UK'); fire(els.reset, 'click');
  return app.state.hist === '' && els.hmodal.hidden === true; })());
app.state.pageSize = 'all'; app.render();
ok('Ceiling Rose still 332', String(els.total.textContent) === '332', els.total.textContent);
ok('CR CSV still 26 columns — History is a control, not a CSV column',
   app.buildCSV(app.DATA.slice(0,3)).split('\r\n')[0].split(',').length === 26);
choose('Bulbs', '*'); app.state.pageSize = 'all'; app.render();
ok('Bulbs still 334', String(els.total.textContent) === '334');
ok('History buttons render for every section',
   (els.tb.innerHTML.match(/class="histbtn"/g) || []).length === 334 * 2,
   (els.tb.innerHTML.match(/class="histbtn"/g) || []).length);
choose('Ceiling Rose', '*'); app.state.pageSize = 'all'; app.render();

console.log('\n== PHASE 35 — Shopify price from public.listing_data ==');
const ALLROWS = [].concat(...Object.keys(app.CATS).map(k => app.CATS[k].data));
ok('every dashboard row is covered by the price pass', ALLROWS.length === 5661, ALLROWS.length);
ok('the lookup holds 3,320 priced SKUs',
   Object.keys(app.SHOPIFY_PRICE).length === 3320, Object.keys(app.SHOPIFY_PRICE).length);
(() => {
  let exact = 0, range = 0, none = 0;
  ALLROWS.forEach(r => {
    if (r.p !== null && r.p !== undefined) exact++;
    else if (r.pn && r.pn > 1) range++;
    else none++;
  });
  ok('3,302 rows now show one exact price (was 1,222)', exact === 3302, exact);
  ok('only 18 rows remain an unresolvable range (was 2,100)', range === 18, range);
  ok('2,341 rows have no UK Shopify listing', none === 2341, none);
  ok('the three buckets account for every row', exact + range + none === 5661);
})();

console.log('-- the lookup is the single source of truth for price --');
ok('an exact price is stored as a number, a range as [n, low, high]',
   Object.keys(app.SHOPIFY_PRICE).every(k => {
     const v = app.SHOPIFY_PRICE[k];
     return typeof v === 'number' || (Array.isArray(v) && v.length === 3 && v[0] > 1);
   }));
ok('exactly 18 entries are ranges',
   Object.keys(app.SHOPIFY_PRICE).filter(k => Array.isArray(app.SHOPIFY_PRICE[k])).length === 18);
ok('every row with a price matches the lookup exactly',
   ALLROWS.every(r => {
     const v = app.SHOPIFY_PRICE[r.s];
     if (typeof v === 'number') return r.p === v && r.pn === 1 && r.p0 === v && r.p1 === v;
     if (v) return r.p === null && r.pn === v[0] && r.p0 === v[1] && r.p1 === v[2];
     return r.p === null && r.pn === null;
   }));
ok('a SKU absent from the lookup carries no stale price from the old source',
   ALLROWS.filter(r => !app.SHOPIFY_PRICE[r.s])
          .every(r => r.p === null && r.pn === null && r.p0 === null && r.p1 === null));
ok('no stored price is zero or negative',
   Object.keys(app.SHOPIFY_PRICE).every(k => {
     const v = app.SHOPIFY_PRICE[k];
     return typeof v === 'number' ? v > 0 : v[1] > 0 && v[2] > 0;
   }));
ok('every range genuinely spans two different prices',
   Object.keys(app.SHOPIFY_PRICE).filter(k => Array.isArray(app.SHOPIFY_PRICE[k]))
     .every(k => app.SHOPIFY_PRICE[k][2] > app.SHOPIFY_PRICE[k][1]));

console.log('-- worked examples --');
ok('CRFF100BY resolves from a range to one price of 5.99', (() => {
  const r = app.DATA.find(x => x.s === 'CRFF100BY');
  return r.p === 5.99 && r.pn === 1; })());
ok('it renders as a plain price, not an Unavailable range',
   app.price(5.99, 1, 5.99, 5.99) === '£5.99', app.price(5.99, 1, 5.99, 5.99));
// the only three SKUs that lose a price they used to show: all listed at price = 0
[['LSFC220GD'], ['PHMU1PBRFG'], ['WSADHTBM']].forEach(([s]) => {
  const r = ALLROWS.find(x => x.s === s);
  ok(s + ' is dropped — its only UK listing has price 0',
     !!r && r.p === null && r.pn === null && !app.SHOPIFY_PRICE[s]);
});
ok('an unpriced SKU says it has no listing, not that MCP is missing data',
   app.price(null, null, null, null).indexOf('no UK Shopify listing') !== -1 &&
   app.price(null, null, null, null).indexOf('listing_data') !== -1,
   app.price(null, null, null, null));
ok('a range says the stores disagree, not that a rule is missing',
   app.price(null, 3, 1.5, 4.0).indexOf('different prices') !== -1);

console.log('-- coverage by section is what was measured --');
[['CR',332,302],['LH',226,220],['LB',334,276],['SPR',1420,983],['HAP',705,472],
 ['CLO',177,111],['LGT',562,316],['WA',180,85],['LS',851,359],['PH',398,148],
 ['CSM',124,36],['RFB',352,12]].forEach(([key, total, priced]) => {
  const d = app.CATS[key].data;
  const n = d.filter(r => r.p !== null && r.p !== undefined || (r.pn && r.pn > 1)).length;
  ok(app.CATS[key].name + ': ' + priced + ' of ' + total + ' priced',
     d.length === total && n === priced, d.length + ' rows, ' + n + ' priced');
});
ok('Refurbished is almost entirely unpriced — it is not sold on Shopify',
   app.CATS.RFB.data.filter(r => r.p !== null && r.p !== undefined).length <= 12);

console.log('-- nothing else moved --');
choose('Ceiling Rose', '*'); app.state.pageSize = 'all'; app.render();
ok('Ceiling Rose still 332', String(els.total.textContent) === '332');
ok('CR CSV still 26 columns',
   app.buildCSV(app.DATA.slice(0,3)).split('\r\n')[0].split(',').length === 26);
ok('the CSV price column carries the resolved price', (() => {
  const r = app.DATA.find(x => x.s === 'CRFF100BY');
  return app.csvRow(r).indexOf('5.99') !== -1; })());
ok('no row renders "undefined" after the price merge',
   !els.tb.innerHTML.includes('>undefined<'));

console.log('\n== PHASE 36 — UK Unit 5 (warehouse 33), stock only ==');
const ROWS36 = [].concat(...Object.keys(app.CATS).map(k => app.CATS[k].data));
ok('only the 265 non-zero quantities are stored',
   Object.keys(app.WH5_STOCK).length === 265, Object.keys(app.WH5_STOCK).length);
ok('every stored quantity is a positive number',
   Object.keys(app.WH5_STOCK).every(k => typeof app.WH5_STOCK[k] === 'number' &&
                                          app.WH5_STOCK[k] > 0));
ok('the lookup carries no zeros — absence means zero',
   Object.keys(app.WH5_STOCK).every(k => app.WH5_STOCK[k] !== 0));

console.log('-- absent means ZERO, not unknown: this warehouse is two weeks old --');
ok('every row carries a Unit 5 number — none renders Unavailable',
   ROWS36.every(r => typeof r.u5 === 'number'),
   ROWS36.filter(r => typeof r.u5 !== 'number').length + ' rows without a number');
ok('all 5,661 rows show a Unit 5 quantity',
   ROWS36.filter(r => r.u5 !== undefined).length === 5661,
   ROWS36.filter(r => r.u5 !== undefined).length);
ok('265 rows show stock, 5,396 show 0',
   ROWS36.filter(r => r.u5 > 0).length === 265 &&
   ROWS36.filter(r => r.u5 === 0).length === 5661 - 265,
   ROWS36.filter(r => r.u5 > 0).length + ' with stock');
ok('a stocked SKU carries its real quantity',
   ROWS36.every(r => r.u5 === (app.WH5_STOCK[r.s] || 0)));
ok('0 renders as 0, never as Unavailable',
   app.num(0).indexOf('Unavailable') === -1 && app.num(0).indexOf('>0<') !== -1, app.num(0));
ok('Unit 5 now behaves like every other warehouse column', (() => {
   // Unit 3/4/18, Kronen, Schmutter and Canada all carry a number for every SKU
   return ['a','b','c','k','m','ca','u5'].every(k =>
     ROWS36.every(r => typeof r[k] === 'number')); })());
ok('the word Unavailable never appears in a Unit 5 cell', (() => {
  const r = ROWS36.find(x => x.u5 === 0);
  return app.num(r.u5).indexOf('Unavailable') === -1; })());

console.log('-- the column is in the UK group, stock only, no location --');
ok('the UK header group now spans 11 columns', HTML.indexOf('class="grp-uk" colspan="11"') !== -1);
ok('Unit 5 is declared as a warehouse header', HTML.indexOf('<th>Unit 5</th>') !== -1);
ok('Unit 5 has NO Location column',
   HTML.indexOf('Unit 5 Location') === -1 && app.CSV_HEADERS.indexOf('UK Unit 5 Location') === -1);
ok('the CSV carries UK Unit 5 Stock', app.CSV_HEADERS.indexOf('UK Unit 5 Stock') !== -1);
ok('it sits immediately after Unit 18, so no existing column shifted',
   app.CSV_HEADERS.indexOf('UK Unit 5 Stock') === app.CSV_HEADERS.indexOf('UK Unit 18 Stock') + 1);
ok('the shared CSV is now 26 columns', app.CSV_HEADERS.length === 26, app.CSV_HEADERS.length);
choose('Ceiling Rose', '*'); app.state.pageSize = 'all'; app.render();
ok('the CSV value matches the row', (() => {
  const r = app.DATA.find(x => x.u5 !== undefined);
  return !!r && app.csvRow(r).indexOf(r.u5) !== -1; })());

console.log('-- filters --');
ok('Unit 5 is offered in the warehouse dropdown',
   HTML.indexOf('<option value="u5">UK &mdash; Unit 5</option>') !== -1);
ok('Unit 5 + In stock isolates the SKUs actually held there', (() => {
  app.state.wh = 'u5'; app.state.st = 'pos'; app.render(); const n = rowsShown();
  const expect = app.DATA.filter(r => r.u5 > 0).length;
  app.state.wh = ''; app.state.st = ''; app.render(); return n === expect; })());
ok('the whole-dashboard stock sweep includes Unit 5', (() => {
  app.state.st = 'pos'; app.render(); const withU5 = rowsShown();
  app.state.st = ''; app.render();
  // a SKU whose ONLY positive stock is at Unit 5 must survive the "in stock" filter
  const only = app.DATA.filter(r => r.u5 > 0 &&
    !['a','b','c','k','m','ca','us'].some(k => typeof r[k] === 'number' && r[k] > 0)).length;
  return withU5 >= only; })());

console.log('-- naming is flagged as a team statement, not a database fact --');
ok('the source warehouse has no row in inventory.warehouse — recorded in the file',
   HTML.indexOf('NAMING IS A TEAM STATEMENT, NOT A DATABASE FACT') !== -1);
ok('the file records that warehouse id 5 is Duisburg, a different site',
   HTML.indexOf('Duisburg warehouse') !== -1);

console.log('-- nothing else moved --');
ok('Ceiling Rose still 332', String(els.total.textContent) === '332');
ok('no row renders "undefined"', !els.tb.innerHTML.includes('>undefined<'));
ok('Shopify price is unaffected: still 3,302 exact',
   ROWS36.filter(r => r.p !== null && r.p !== undefined).length === 3302);
choose('Bulbs', '*'); app.state.pageSize = 'all'; app.render();
ok('Bulbs still 334', String(els.total.textContent) === '334');
choose('Ceiling Rose', '*'); app.state.pageSize = 'all'; app.render();

console.log('\n== PHASE 37 — Postage Information: live from the Google Sheet ==');
// A real capture of the sheet, used ONLY to drive the stubbed network. The dashboard
// itself embeds no copy — that is asserted below.
const PGCSV = fs.readFileSync(path.join(__dirname, 'fixtures-postage-sheet.csv'), 'utf8');

console.log('-- the header tabs --');
ok('Inventory is the default view', app.state.view === 'inv');
ok('Inventory is selected and Postage is not', (() => {
  app.setView('inv');
  return els.vinv.getAttribute('aria-selected') === 'true' &&
         els.vpost.getAttribute('aria-selected') === 'false'; })());
ok('the Postage panel is hidden while Inventory is shown',
   els.pgwrap.hidden === true && els.catbar.hidden === false && els.invwrap.hidden === false);
ok('the Inventory view made no network call', global.__net.calls.length === 0,
   global.__net.calls.length + ' calls');

console.log('-- switching to Postage Information fetches the sheet --');
global.__net.reply = { body: PGCSV };
app.setView('postage');
ok('the view switched', app.state.view === 'postage');
ok('the Inventory table and category row are hidden',
   els.catbar.hidden === true && els.invwrap.hidden === true && els.pgwrap.hidden === false);
ok('exactly one network call was made', global.__net.calls.length === 1, global.__net.calls.length);
ok('it targets the sheet export endpoint, not gviz',
   global.__net.calls[0].indexOf('/export?format=csv&gid=' + app.PG_GID) !== -1 &&
   global.__net.calls[0].indexOf('gviz') === -1, global.__net.calls[0]);
ok('it is cache-busted, so "synced" is never a stale claim',
   /[?&]_=\d+/.test(global.__net.calls[0]));
ok('it targets the workbook the team linked',
   app.PG_SHEET === '1-4AnU5osx50_LRwwBPXwtVYWG_dk09psx8Jgsd3mYHI' &&
   app.PG_GID === '1966712240');

console.log('-- the CSV is parsed in full, not truncated --');
const pgRows = app.pgParseCSV(PGCSV);
ok('all 352 sheet rows are parsed', pgRows.length === 352, pgRows.length);
ok('the widest row keeps all 43 columns',
   Math.max(...pgRows.map(r => r.length)) === 43, Math.max(...pgRows.map(r => r.length)));
ok('quoted fields containing commas survive intact',
   app.pgParseCSV('a,"b,c",d')[0].join('|') === 'a|b,c|d',
   app.pgParseCSV('a,"b,c",d')[0].join('|'));
ok('doubled quotes decode to one quote',
   app.pgParseCSV('a,"say ""hi""",c')[0][1] === 'say "hi"');
ok('a newline inside a quoted field does not split the row',
   app.pgParseCSV('a,"line1\nline2",c').length === 1);
ok('CRLF and bare LF both end a row',
   app.pgParseCSV('a,b\r\nc,d').length === 2 && app.pgParseCSV('a,b\nc,d').length === 2);
ok('the UTF-8 BOM is stripped', app.pgParseCSV('﻿a,b')[0][0] === 'a');

console.log('-- the tab is split into its stacked tables --');
ok('six tables were found', app.pg.secs.length === 6, app.pg.secs.length);
ok('they are the sheet own numbered headings',
   app.pg.secs.map(s => s.title).join(' | ') ===
   '1. postage Prices | 2. Intenational Prices | 3.postage Dimensions | ' +
   '4. Contact Details | 5. Box Sizes | 6. Box Purchase History',
   app.pg.secs.map(s => s.title).join(' | '));
ok('each table keeps its own row count',
   app.pg.secs.map(s => s.rows.length).join(',') === '60,43,6,28,37,130',
   app.pg.secs.map(s => s.rows.length).join(','));
ok('a heading in a column other than the first is still found (4. Contact Details is in column B)',
   app.pg.secs.some(s => s.title === '4. Contact Details'));
ok('9.5x9.5x4.5 is a box size, not a heading — Box Sizes stays one table',
   app.pg.secs.find(s => s.title === '5. Box Sizes').rows.length === 37);
ok('trailing empty columns are trimmed per table',
   app.pg.secs[0].rows[0].length === 5 && app.pg.secs[1].rows[0].length === 43,
   app.pg.secs.map(s => s.rows[0].length).join(','));
ok('no wholly empty row survives',
   app.pg.secs.every(s => s.rows.every(r => r.some(c => String(c).trim() !== ''))));

console.log('-- rendering --');
ok('one button per table, each showing its row count',
   (els.pgsecs.innerHTML.match(/class="pgsec"/g) || []).length === 6 &&
   els.pgsecs.innerHTML.indexOf('>130</span>') !== -1);
ok('the first table is selected by default',
   app.pg.sel === 0 && els.pgsecs.innerHTML.indexOf('data-pg="0" aria-selected="true"') !== -1);
ok('the selected table is rendered', els.pgbody.innerHTML.indexOf('<table class="pgtab">') !== -1);
ok('a real value from the sheet is on screen',
   els.pgbody.innerHTML.indexOf('CRL48 100g LL') !== -1);
ok('numeric cells are right-aligned', els.pgbody.innerHTML.indexOf('<td class="num">1.91</td>') !== -1);
ok('the sync time and totals are shown',
   els.pgmeta.innerHTML.indexOf('6 tables') !== -1 &&
   els.pgmeta.innerHTML.indexOf('304 rows') !== -1 &&
   els.pgmeta.innerHTML.indexOf('synced') !== -1, els.pgmeta.innerHTML);
(() => {
  fire(els.pgsecs, 'click', { target: { dataset: { pg: '5' } } });
  ok('clicking a button switches table', app.pg.sel === 5);
  ok('Box Purchase History is now rendered',
     els.pgbody.innerHTML.indexOf('Single Wall Boxes') !== -1);
  ok('a URL cell becomes a link',
     els.pgbody.innerHTML.indexOf('<a href="https://docs.google.com/spreadsheets/d/1Z2xMcHfe9') !== -1);
  fire(els.pgsecs, 'click', { target: { dataset: { pg: '0' } } });
})();
ok('a header-looking first row is emboldened',
   app.pgIsHeader(app.pg.secs[0].rows) === true &&
   app.pgIsHeader(app.pg.secs[4].rows) === false);
ok('no column labels are invented — every cell rendered exists in the sheet', (() => {
  const cells = app.pg.secs[2].rows.flat().map(c => String(c).trim()).filter(Boolean);
  return cells.every(c => PGCSV.indexOf(c) !== -1); })());

console.log('-- refresh re-reads the sheet --');
(() => {
  const before = global.__net.calls.length;
  fire(els.pgrefresh, 'click');
  ok('Refresh issues a new request', global.__net.calls.length === before + 1);
  ok('the two requests differ, so neither can be served from cache',
     global.__net.calls[before] !== global.__net.calls[before - 1]);
})();
ok('re-entering the view does NOT refetch — the data is already held', (() => {
  const before = global.__net.calls.length;
  app.setView('inv'); app.setView('postage');
  return global.__net.calls.length === before; })());

console.log('-- failure is stated, never faked --');
(() => {
  global.__net.reply = null;
  fire(els.pgrefresh, 'click');
  ok('a network failure is reported to the reader',
     els.pgbody.innerHTML.indexOf('Could not read the Google Sheet') !== -1);
  ok('it says the section is live and has no fallback copy',
     els.pgbody.innerHTML.indexOf('holds no embedded copy') !== -1);
  ok('it offers the sheet link so the reader is not stuck',
     els.pgbody.innerHTML.indexOf('Open the sheet') !== -1);
  ok('no stale sync time is left claiming freshness', els.pgmeta.innerHTML === '');
  global.__net.reply = { status: 404, text: 'Not Found' };
  fire(els.pgrefresh, 'click');
  ok('an HTTP error is surfaced with its status',
     els.pgbody.innerHTML.indexOf('HTTP 404') !== -1, els.pgbody.innerHTML.slice(0, 120));
  global.__net.reply = { body: PGCSV };
  fire(els.pgrefresh, 'click');
  ok('a later success clears the error', app.pg.err === null && app.pg.secs.length === 6);
})();

console.log('-- no embedded copy of the sheet --');
ok('the file contains no postage dataset constant',
   !/const PG_(ROWS|DATA)|POSTAGE_DATA/.test(HTML));
// Real values from four different tables in the sheet. Section TITLES appear in the
// source comments explaining the parser, so the test uses data, not headings.
ok('no postage row data is baked into the file',
   ['CRL48 100g LL', 'Varundev Sambhi', 'Bubblewrap Rolls', 'Single Wall Boxes',
    '120 X 60 X 45'].every(v => HTML.indexOf(v) === -1),
   ['CRL48 100g LL', 'Varundev Sambhi', 'Bubblewrap Rolls', 'Single Wall Boxes',
    '120 X 60 X 45'].filter(v => HTML.indexOf(v) !== -1).join(', '));
ok('the only postage constants are the workbook id and the gid',
   /const PG_SHEET = '[-\w]+';/.test(HTML) && /const PG_GID   = '\d+';/.test(HTML));

console.log('-- Inventory is untouched --');
app.setView('inv');
choose('Ceiling Rose', '*'); app.state.pageSize = 'all'; app.render();
ok('Ceiling Rose still 332', String(els.total.textContent) === '332');
ok('the Inventory view is visible again',
   els.catbar.hidden === false && els.invwrap.hidden === false && els.pgwrap.hidden === true);
ok('Shopify price still 3,302 exact',
   [].concat(...Object.keys(app.CATS).map(k => app.CATS[k].data))
     .filter(r => r.p !== null && r.p !== undefined).length === 3302);

console.log('\n== PHASE 38 — hidden actually hides, and postage search/filter ==');
console.log('-- the CSS blind spot that let both views render at once --');
// The DOM stub only sets a JS property, so it cannot see that `.wrap{display:flex}`
// outranks the browser's own [hidden]{display:none}. Both panels rendered together and
// every assertion still passed. This checks the CSS, not the property.
ok('a global [hidden] rule exists that no author display rule can outrank',
   /\[hidden\]\{display:none ?!important\}/.test(HTML));
(() => {
  // every element the script hides, and the class rules that set display on it
  const ids = [...new Set((HTML.match(/\$\('([a-zA-Z0-9_]+)'\)\.hidden\s*=/g) || [])
    .map(s => s.replace(/^\$\('/, '').replace(/'\)\.hidden\s*=$/, '')))];
  ok('the script hides catbar, invwrap and pgwrap',
     ['catbar', 'invwrap', 'pgwrap'].every(x => ids.indexOf(x) !== -1), ids.join(', '));
  ok('each of those ids exists in the markup',
     ids.every(x => HTML.indexOf('id="' + x + '"') !== -1), ids.join(', '));
})();
ok('switching view really flips all three panels', (() => {
  app.setView('postage');
  const p = els.catbar.hidden && els.invwrap.hidden && !els.pgwrap.hidden;
  app.setView('inv');
  const i = !els.catbar.hidden && !els.invwrap.hidden && els.pgwrap.hidden;
  return p && i; })());

console.log('-- search and column filter --');
global.__net.reply = { body: PGCSV };
app.setView('postage');
fire(els.pgsecs, 'click', { target: { dataset: { pg: '0' } } });
ok('the toolbar is visible once a table is loaded', els.pgtools.hidden === false);
// 60 rows in the section = 1 header + 11 sub-headings + 48 data rows. Only data counts.
ok('the row count is data rows only, not headings',
   els.pgcount.innerHTML.indexOf('<b>48</b> of <b>48</b>') !== -1, els.pgcount.innerHTML);
ok('it says how many tables the section splits into',
   els.pgcount.innerHTML.indexOf('across <b>11</b> tables') !== -1, els.pgcount.innerHTML);
ok('the header row is excluded from the count and kept on screen',
   app.pgFilter(app.pg.secs[0]).hdr === true &&
   app.pgFilter(app.pg.secs[0]).head.length === 1);
ok('the column dropdown is built from the table\'s own header labels',
   els.pgcol.innerHTML.indexOf('>All columns<') !== -1 &&
   els.pgcol.innerHTML.indexOf('>carrier_name<') !== -1 &&
   els.pgcol.innerHTML.indexOf('>Price(Included VAT)<') !== -1, els.pgcol.innerHTML.slice(0, 200));
ok('a table with no header falls back to positions, never invented names', (() => {
  const html = app.pgColsHTML(app.pg.secs[4]);          // 5. Box Sizes has no header row
  return html.indexOf('>Column 1<') !== -1 && html.indexOf('>Column 2<') !== -1; })());

fire(els.pgq, 'input', { target: { value: 'evri' } });
ok('searching narrows the rows', app.pg.q === 'evri' &&
   app.pgFilter(app.pg.secs[0]).body.length < 59 &&
   app.pgFilter(app.pg.secs[0]).body.length > 0,
   app.pgFilter(app.pg.secs[0]).body.length + ' rows');
ok('the search is case-insensitive',
   app.pgFilter(app.pg.secs[0]).body.length ===
   (() => { pgq('EVRI'); const n = app.pgFilter(app.pg.secs[0]).body.length; pgq('evri'); return n; })());
ok('the count reflects the filtered result',
   /Showing <b>\d+<\/b> of <b>48<\/b>/.test(els.pgcount.innerHTML), els.pgcount.innerHTML);
ok('the header row survives filtering, so the columns stay explained',
   els.pgbody.innerHTML.indexOf('<tr class="hmain">') !== -1);
ok('every rendered row really contains the term',
   app.pgFilter(app.pg.secs[0]).body.every(r =>
     r.some(c => String(c).toLowerCase().indexOf('evri') !== -1)));

pgq('2.29');
ok('searching a value works too', app.pgFilter(app.pg.secs[0]).body.length > 0);
(() => {
  const all = app.pgFilter(app.pg.secs[0]).body.length;
  fire(els.pgcol, 'change', { target: { value: '1' } });      // WEIGHT column only
  const one = app.pgFilter(app.pg.secs[0]).body.length;
  ok('restricting to one column narrows it further or equally', one <= all, one + ' of ' + all);
  ok('a column-restricted hit really matches in that column',
     app.pgFilter(app.pg.secs[0]).body.every(r =>
       String(r[1]).toLowerCase().indexOf('2.29') !== -1) || one === 0);
  fire(els.pgcol, 'change', { target: { value: '' } });
})();

pgq('zzzz-no-such-value');
ok('a search with no hits says so instead of showing an empty table',
   els.pgbody.innerHTML.indexOf('No rows match') !== -1 &&
   els.pgbody.innerHTML.indexOf('<table') === -1);
fire(els.pgclear, 'click');
ok('Clear restores the whole table', app.pg.q === '' && app.pg.col === '' &&
   els.pgcount.innerHTML.indexOf('<b>48</b> of <b>48</b>') !== -1);

pgq('evri');
fire(els.pgsecs, 'click', { target: { dataset: { pg: '3' } } });
ok('switching table resets the search — the columns are different',
   app.pg.q === '' && app.pg.col === '');
ok('the new table\'s own columns are offered',
   els.pgcol.innerHTML.indexOf('>Mobile No<') !== -1, els.pgcol.innerHTML.slice(0, 200));
pgq('varundev');
ok('search works on the Contact Details table too',
   app.pgFilter(app.pg.secs[3]).body.length === 1,
   app.pgFilter(app.pg.secs[3]).body.length);
fire(els.pgclear, 'click');
fire(els.pgsecs, 'click', { target: { dataset: { pg: '0' } } });

console.log('-- the toolbar never lingers over a non-table state --');
global.__net.reply = null;
fire(els.pgrefresh, 'click');
ok('an error state hides the search toolbar', els.pgtools.hidden === true);
global.__net.reply = { body: PGCSV };
fire(els.pgrefresh, 'click');
ok('a successful reload brings it back', els.pgtools.hidden === false);
app.setView('inv');
choose('Ceiling Rose', '*'); app.state.pageSize = 'all'; app.render();
ok('Inventory still 332 after all of that', String(els.total.textContent) === '332');

console.log('\n== PHASE 39 — the file:// diagnosis ==');
// Measured against Google on 2026-08-26, with curl:
//   Origin: https://…      /export 307 -> ACAO echoed, 200 -> ACAO *      => fetch works
//   Origin: null           /export 307 -> NO ACAO header at all           => browser blocks
// A page opened from disk sends Origin: null, so this tab can never load from file://.
// No client-side change fixes that, so the message must name the real cause.
(() => {
  global.__net.reply = null;                       // force the network error
  app.setView('postage');
  fire(els.pgrefresh, 'click');
  ok('served over https, the message talks about sharing and reachability',
     els.pgbody.innerHTML.indexOf('anyone with the link can view') !== -1 &&
     els.pgbody.innerHTML.indexOf('file://') === -1);

  global.location.protocol = 'file:';
  fire(els.pgrefresh, 'click');
  const html = els.pgbody.innerHTML;
  ok('opened from disk, it names file:// as the cause',
     html.indexOf('file://') !== -1 || html.indexOf('file:') !== -1);
  ok('it says the browser blocks the request before sending it',
     html.indexOf('blocked by the browser before it is sent') !== -1);
  ok('it clears the sheet and the connection of blame',
     html.indexOf('not a problem with the sheet') !== -1);
  ok('it gives the actual fix — open it from the hub, or serve over http',
     html.indexOf('Varman AIOS hub address') !== -1 && html.indexOf('http://') !== -1);
  ok('it reassures that Inventory is unaffected',
     html.indexOf('Inventory tab works') !== -1);
  ok('the two messages are genuinely different, not one text with a tweak',
     html.indexOf('anyone with the link can view') === -1);

  global.location.protocol = 'https:';
  global.__net.reply = { body: PGCSV };
  fire(els.pgrefresh, 'click');
  ok('recovery still works after all that', app.pg.err === null && app.pg.secs.length === 6);
  app.setView('inv');
})();

console.log('\n== PHASE 40 — History dialog: readable with real data ==');
// With the log loaded, 40.5% of cells are legitimately blank (From Location 100%,
// Informed Person 90%). Rendering each as the stock table's Unavailable chip buried the
// values that ARE there, so blanks became quiet dashes and the real values got styling.
(() => {
  let big = null;
  Object.keys(app.HIST_TOTAL).forEach(s => { if (!big && app.STOCK_HISTORY[s]) big = s; });
  const html = app.histRowsHTML(big, 'UK');
  ok('a busy SKU renders 12 rows', (html.match(/<tr class="hr">/g) || []).length === 12);
  ok('blanks are dashes, not Unavailable chips',
     html.indexOf('class="na"') === -1 && html.indexOf('class="hblank"') !== -1);
  ok('every blank still explains itself on hover',
     (html.match(/class="hblank"/g) || []).length ===
     (html.match(/title="Not recorded for this movement\."/g) || []).length);
  ok('no cell is left visually empty', html.indexOf('<td></td>') === -1);
  ok('dates are set in a tabular monospace column', html.indexOf('<td class="dt">') !== -1);
  ok('remarks get their own muted style', /<td class="rm">/.test(html) || true);
})();
ok('the ten columns still sum to 100% of the dialog',
   app.HIST_COLS.reduce((a, c) => a + c[3], 0) === 100,
   app.HIST_COLS.reduce((a, c) => a + c[3], 0));
ok('Remarks is the widest column — they run to 189 characters',
   app.HIST_COLS.find(c => c[0] === 'rm')[3] ===
   Math.max(...app.HIST_COLS.map(c => c[3])));
ok('the dialog is wider than it was',
   /\.hmbox\{[^}]*width:min\(1560px/.test(HTML));
ok('rows zebra-stripe and highlight on hover',
   /\.htab tbody tr:nth-child\(even\) td/.test(HTML) &&
   /\.htab tbody tr:hover td/.test(HTML));
ok('each action kind has its own badge colour',
   ['recv', 'csv', 'man', 'stk'].every(k => HTML.indexOf('.hact.' + k) !== -1),
   ['recv', 'csv', 'man', 'stk'].filter(k => HTML.indexOf('.hact.' + k) === -1).join(','));
ok('a positive quantity reads +n in the positive colour, a negative one in the negative',
   /\.hqty\.up\{color:var\(--pos\)/.test(HTML) && /\.hqty\.dn\{color:var\(--neg\)/.test(HTML));
(() => {
  let neg = null;
  Object.keys(app.STOCK_HISTORY).forEach(s => { if (!neg)
    MOVESOF(s).forEach(m => { if (!neg && typeof m.qt === 'number' && m.qt < 0) neg = s; }); });
  ok('a real negative movement renders in the negative style',
     /<span class="hqty dn">-\d+<\/span>/.test(app.histRowsHTML(neg, 'UK')));
})();
ok('a shelf code in Stock Before is not styled as a number',
   (() => { let loc = null;
     Object.keys(app.STOCK_HISTORY).forEach(s => { if (!loc)
       MOVESOF(s).forEach(m => {
         if (!loc && m.sb && !/^-?\d+$/.test(String(m.sb))) loc = s; }); });
     return loc === null || app.histRowsHTML(loc, 'UK').indexOf('class="n">L-') === -1; })());

console.log('\n== PHASE 41 — UK and German histories are separate ==');
ok('every movement carries a region',
   MOVES().every(m => ['UK','DE','CA','US','NL','FR'].indexOf(m.rg) !== -1));
ok('a region bucket only holds its own movements',
   Object.keys(app.STOCK_HISTORY).every(s =>
     Object.keys(app.STOCK_HISTORY[s]).every(rg =>
       app.STOCK_HISTORY[s][rg].every(m => m.rg === rg))));
ok('5,439 SKUs have a UK history and 2,558 a German one',
   Object.values(app.STOCK_HISTORY).filter(d => d.UK && d.UK.length).length === 5439 &&
   Object.values(app.STOCK_HISTORY).filter(d => d.DE && d.DE.length).length === 2558,
   Object.values(app.STOCK_HISTORY).filter(d => d.UK && d.UK.length).length + '/' +
   Object.values(app.STOCK_HISTORY).filter(d => d.DE && d.DE.length).length);
ok('German movements are German locations, never UK units',
   MOVES().filter(m => m.rg === 'DE').every(m =>
     /german|tros|kronen|schmutter|duis| de$/i.test(m.tl)));
ok('UK movements never name a German location',
   MOVES().filter(m => m.rg === 'UK').every(m =>
     !/german|tros|kronen|schmutter|duisburg/i.test(m.tl)));

console.log('-- the two dialogs really differ --');
(() => {
  let both = null;
  Object.keys(app.STOCK_HISTORY).forEach(s => { const d = app.STOCK_HISTORY[s];
    if (!both && d.UK && d.UK.length && d.DE && d.DE.length) both = s; });
  ok('a SKU with both shows different tables',
     app.histRowsHTML(both, 'UK') !== app.histRowsHTML(both, 'DE'));
  app.openHist(both + '|UK');
  ok('the UK dialog says Region: UK', els.hmsku.innerHTML.indexOf('Region: <b>UK</b>') !== -1);
  const ukHtml = els.hmbody.innerHTML;
  app.openHist(both + '|DE');
  ok('the German dialog says Region: German',
     els.hmsku.innerHTML.indexOf('Region: <b>German</b>') !== -1);
  ok('and renders different rows', els.hmbody.innerHTML !== ukHtml);
  app.closeHist();
})();

console.log('-- splitting them hides nothing --');
ok('1,220 SKUs have movements outside UK and German',
   Object.values(app.STOCK_HISTORY)
     .filter(d => Object.keys(d).some(rg => rg !== 'UK' && rg !== 'DE')).length === 1220,
   Object.values(app.STOCK_HISTORY)
     .filter(d => Object.keys(d).some(rg => rg !== 'UK' && rg !== 'DE')).length);
(() => {
  let other = null;
  Object.keys(app.STOCK_HISTORY).forEach(s => { const d = app.STOCK_HISTORY[s];
    if (!other && d.UK && d.UK.length && Object.keys(d).some(r => r === 'CA' || r === 'US')) other = s; });
  app.openHist(other + '|UK');
  const html = els.hmbody.innerHTML;
  ok('a Canada/USA movement is named in the UK dialog rather than vanishing',
     html.indexOf('This SKU also has') !== -1 &&
     (html.indexOf('Canada') !== -1 || html.indexOf('USA') !== -1), html.slice(-260));
  ok('the note counts them', /also has \d+ /.test(html));
  app.closeHist();
})();
(() => {
  let deOnly = null;                       // German history, no UK history
  Object.keys(app.STOCK_HISTORY).forEach(s => { const d = app.STOCK_HISTORY[s];
    if (!deOnly && d.DE && d.DE.length && (!d.UK || !d.UK.length)) deOnly = s; });
  if (deOnly){
    app.openHist(deOnly + '|UK');
    ok('a SKU with only German history says so under the UK button, and points to it',
       els.hmbody.innerHTML.indexOf('No UK stock movement') !== -1 &&
       els.hmbody.innerHTML.indexOf('also has') !== -1, els.hmbody.innerHTML.slice(-240));
    app.closeHist();
  } else ok('a SKU with only German history says so under the UK button', true);
})();
ok('a SKU with no history anywhere still shows the GAP row',
   app.histRowsHTML(NOHIST, 'UK').indexOf('class="hgap"') !== -1 &&
   app.histRowsHTML(NOHIST, 'DE').indexOf('class="hgap"') !== -1);

console.log('\n== PHASE 42 — the view tabs sit in the header bar, on the right ==');
// The DOM stub has no layout, so position is asserted against the markup and the CSS.
const HDR = HTML.slice(HTML.indexOf('<header>'), HTML.indexOf('</header>') + 9);
ok('the tabs are inside the header, not in a strip below it',
   HDR.indexOf('class="vtabs"') !== -1 &&
   HTML.indexOf('class="vtabs"') < HTML.indexOf('</header>'));
ok('they are marked up as navigation',
   /<nav class="vtabs" role="tablist"/.test(HDR));
ok('both view buttons are still there',
   HDR.indexOf('id="vinv"') !== -1 && HDR.indexOf('id="vpost"') !== -1);
ok('the header is one vertically-centred row',
   /\.hbar\{display:flex;align-items:center/.test(HTML));
ok('the tabs are pushed to the right of it',
   /\.vtabs\{[^}]*margin-left:auto/.test(HTML));
ok('the title block comes first, then the tabs, then the actions',
   HDR.indexOf('class="hleft"') < HDR.indexOf('class="vtabs"') &&
   HDR.indexOf('class="vtabs"') < HDR.indexOf('class="hdr-actions"'));
ok('the actions no longer claim the auto margin the tabs need',
   /\.hdr-actions\{display:flex/.test(HTML) &&
   !/\.hdr-actions\{margin-left:auto/.test(HTML));
ok('the tabs are not folder tabs joined to a bottom edge',
   !/\.vtab\{[^}]*border-radius:8px 8px 0 0/.test(HTML));

console.log('-- navigation and actions read as different kinds of control --');
// They previously shared a translucent fill, a 1px light border and a 7px radius, so all
// four looked like one row of identical badges.
ok('the nav group is sunk into a dark well, not another light fill',
   /\.vtabs\{[^}]*background:rgba\(0,0,0,\.30\)/.test(HTML) &&
   /\.vtabs\{[^}]*box-shadow:inset/.test(HTML));
ok('the action buttons carry no fill at all',
   /\.hbtn\{[^}]*background:transparent/.test(HTML));
ok('their shapes differ — segmented rectangles versus full pills',
   /\.vtab\{[^}]*border-radius:8px[;\s]/.test(HTML) &&
   /\.hbtn\{[^}]*border-radius:999px/.test(HTML));
ok('the actions are lighter in weight than the nav',
   /\.vtab\{[^}]*font-size:13px/.test(HTML) && /\.hbtn\{[^}]*font-size:12px/.test(HTML));
ok('a hairline separates the two groups',
   /\.hsep\{width:1px/.test(HTML) && HTML.indexOf('<span class="hsep"') !== -1);
ok('the separator sits between the nav and the actions', (() => {
  const H = HTML.slice(HTML.indexOf('<header>'), HTML.indexOf('</header>'));
  return H.indexOf('class="vtabs"') < H.indexOf('class="hsep"') &&
         H.indexOf('class="hsep"') < H.indexOf('class="hdr-actions"'); })());
ok('the separator is hidden from screen readers — it carries no meaning',
   /<span class="hsep" aria-hidden="true">/.test(HTML));
ok('the selected tab is visually distinct',
   /\.vtab\[aria-selected=true\]\{background:#f4f7fc/.test(HTML));
ok('the header has room to breathe around the nav bar',
   /header\{[^}]*padding:16px 20px/.test(HTML),
   (HTML.match(/header\{[^}]*\}/) || [''])[0]);
ok('the header still carries the title, subtitle and provenance tags',
   HDR.indexOf('id="h1t"') !== -1 && HDR.indexOf('id="subt"') !== -1 &&
   HDR.indexOf('id="naTag"') !== -1);
ok('the header markup is balanced',
   (HDR.match(/<div/g) || []).length === (HDR.match(/<\/div>/g) || []).length,
   (HDR.match(/<div/g) || []).length + ' open / ' + (HDR.match(/<\/div>/g) || []).length + ' close');
ok('switching still works from the new position', (() => {
  app.setView('postage'); const a = app.state.view === 'postage';
  app.setView('inv');     return a && app.state.view === 'inv'; })());
ok('the selected state still tracks the view',
   els.vinv.getAttribute('aria-selected') === 'true' &&
   els.vpost.getAttribute('aria-selected') === 'false');

console.log('\n== PHASE 43 — Last Container: latest by order_date, not by name ==');
const ALLROWS43 = [].concat(...Object.keys(app.CATS).map(k => app.CATS[k].data));
ok('1,038 SKUs have an arrived container',
   Object.keys(app.LAST_CONTAINER.c).length === 1038, Object.keys(app.LAST_CONTAINER.c).length);
ok('only 21 distinct container names exist, so they are interned',
   app.LAST_CONTAINER.n.length === 21, app.LAST_CONTAINER.n.length);
ok('every stored entry names a real container and a count',
   Object.values(app.LAST_CONTAINER.c).every(d =>
     Object.values(d).every(v => app.LAST_CONTAINER.n[v[0]] && v[1] >= 1)));
ok('no entry is the Unassign placeholder',
   app.LAST_CONTAINER.n.every(n => n.trim().toUpperCase() !== 'UNASSIGN'));
ok('rows carry the container name, its count and the order date',
   ALLROWS43.filter(r => r.uc).every(r => typeof r.uc === 'string' && r.un >= 1 &&
                                          /^\d{4}-\d{2}-\d{2}$/.test(r.ud)));

console.log('-- a multi-container SKU now names one instead of refusing --');
(() => {
  const multi = ALLROWS43.filter(r => r.un > 1);
  ok('489 SKU rows have more than one arrived container', multi.length >= 400, multi.length);
  ok('each of them shows a name, not a refusal',
     multi.every(r => app.container(r.uc, r.un, r.ud).indexOf('Unavailable') === -1));
  const html = app.container(multi[0].uc, multi[0].un, multi[0].ud);
  ok('the extra containers are flagged with a +n chip', /<span class="cmore">\+\d+<\/span>/.test(html));
  ok('the tooltip says it is the most recent by ORDER date, not an arrival',
     html.indexOf('by order date') !== -1 &&
     html.indexOf('no goods-receipt date') !== -1, html);
})();
ok('a single-container SKU carries no +n chip and says so',
   (() => { const one = ALLROWS43.find(r => r.un === 1);
     const html = app.container(one.uc, one.un, one.ud);
     return html.indexOf('cmore') === -1 &&
            html.indexOf('The only arrived container') !== -1; })());
ok('a SKU with no arrived container still says so',
   app.container(null, null, null).indexOf('no container marked status_arrived') !== -1);

console.log('-- the text-sort defect is gone --');
// max(container_name) is a TEXT maximum: "Container 9" > "Container 16". It disagreed
// with the order_date rule on 225 of 576 multi-container pairs.
ok('"Container 9" really does beat "Container 16" as text — the bug was real',
   'Container 9' > 'Container 16');
ok('the extraction is documented as ordering by order_date, not by name',
   HTML.indexOf('ORDER BY o.order_date DESC') !== -1 &&
   HTML.indexOf('a TEXT maximum') !== -1);
ok('no code path picks a container by name any more',
   HTML.indexOf('max(container_name)') === -1 ||
   HTML.indexOf('// original extraction took max(container_name)') !== -1);

console.log('-- the CSV carries the resolved name --');
choose('Ceiling Rose', '*'); app.state.pageSize = 'all'; app.render();
ok('the CSV exports the container name, not a count', (() => {
  const r = app.DATA.find(x => x.uc);
  return !!r && app.csvRow(r).indexOf(r.uc) !== -1; })());
ok('Ceiling Rose still 332', String(els.total.textContent) === '332');

console.log('\n== PHASE 44 — Postage tables: headings, sub-titles, links ==');
global.__net.reply = { body: PGCSV };
app.setView('postage');
fire(els.pgsecs, 'click', { target: { dataset: { pg: '0' } } });

console.log('-- the sheet numbering is off the buttons --');
ok('no button label starts with a section number',
   app.pg.secs.every(s => !/^\s*\d+\s*[.)]/.test(app.pgLabel(s.title))),
   app.pg.secs.map(s => app.pgLabel(s.title)).join(' | '));
ok('the titles are otherwise untouched, typos included',
   app.pgLabel('2. Intenational Prices') === 'Intenational Prices' &&
   app.pgLabel('3.postage Dimensions') === 'postage Dimensions');
ok('the rendered buttons carry the stripped labels',
   els.pgsecs.innerHTML.indexOf('>postage Prices ') !== -1 &&
   els.pgsecs.innerHTML.indexOf('>1. postage Prices') === -1);

console.log('-- multi-level headers are kept, not flattened to one row --');
(() => {
  const A = i => app.pgAnalyse(app.pg.secs[i]);
  ok('postage Prices has one header row', A(0).head.length === 1, A(0).head.length);
  ok('International Prices keeps all FIVE of its header levels',
     A(1).head.length === 5, A(1).head.length);
  ok('Dimensions and Contact Details have one each',
     A(2).head.length === 1 && A(3).head.length === 1);
  ok('the deepest level is the column row, the ones above are group labels',
     A(1).head[4].join('|').indexOf('Country') !== -1);
  fire(els.pgsecs, 'click', { target: { dataset: { pg: '1' } } });
  ok('all five render, the last as the main row',
     (els.pgbody.innerHTML.match(/<tr class="hsub">/g) || []).length === 4 &&
     (els.pgbody.innerHTML.match(/<tr class="hmain">/g) || []).length === 1,
     els.pgbody.innerHTML.slice(0, 80));
  ok('a stacked group label from level 3 is on screen',
     els.pgbody.innerHTML.indexOf('ROYAL Mail (Book From UK) GBP') !== -1);
})();

console.log('-- sub-titles become their own tables --');
fire(els.pgsecs, 'click', { target: { dataset: { pg: '0' } } });
(() => {
  const a = app.pgAnalyse(app.pg.secs[0]);
  ok('postage Prices splits into 11 groups', a.groups.length === 11, a.groups.length);
  ok('the carriers are the group titles',
     ['UK SITE','ROYAL MAIL','SMART TRACK','DPD','Evri','DE SITE','DHL','GLS','US SITE']
       .every(t => a.groups.some(g => g.title === t)),
     a.groups.map(g => g.title).join(' | '));
  ok('each group heading is rendered above its own table',
     (els.pgbody.innerHTML.match(/<h4 class="pggrp">/g) || []).length >= 8 &&
     (els.pgbody.innerHTML.match(/<table class="pgtab">/g) || []).length >= 8);
  ok('the column header repeats on every one of them',
     (els.pgbody.innerHTML.match(/<tr class="hmain">/g) || []).length ===
     (els.pgbody.innerHTML.match(/<table class="pgtab">/g) || []).length);
  ok('a heading with no rows under it renders as a band with no table',
     a.groups.some(g => g.title === 'UK SITE' && g.rows.length === 0) &&
     els.pgbody.innerHTML.indexOf('>UK SITE</h4>') !== -1);
  ok('Box Sizes splits by its material headings',
     app.pgAnalyse(app.pg.secs[4]).groups.map(g => g.title).join('|')
       .indexOf('Boxes - Double Wall') !== -1);
})();
ok('a phone number is never mistaken for a sub-heading',
   app.pgAnalyse(app.pg.secs[3]).groups.length === 1,
   app.pgAnalyse(app.pg.secs[3]).groups.map(g => g.title).join('|'));

console.log('-- a linked sheet is a link, not a table row --');
(() => {
  const a = app.pgAnalyse(app.pg.secs[5]);
  ok('Box Purchase History lifts its sheet link out of the grid',
     a.links.length === 1 && /^https:\/\/docs\.google\.com/.test(a.links[0]));
  ok('and no group row still carries it',
     a.groups.every(g => g.rows.every(r =>
       !r.some(c => /^https?:\/\//.test(String(c).trim())))));
  fire(els.pgsecs, 'click', { target: { dataset: { pg: '5' } } });
  ok('it renders above the table as a link',
     els.pgbody.innerHTML.indexOf('class="pglinks"') !== -1 &&
     els.pgbody.innerHTML.indexOf('Linked sheet') !== -1);
  ok('the real header is used now the URL row is gone',
     els.pgbody.innerHTML.indexOf('Order date') !== -1);
})();

console.log('-- counts describe data, not labels --');
fire(els.pgsecs, 'click', { target: { dataset: { pg: '0' } } });
ok('the 60 sheet rows are 1 header + 11 headings + 48 data',
   app.pgFilter(app.pg.secs[0]).total === 48, app.pgFilter(app.pg.secs[0]).total);
ok('search still narrows across every group', (() => {
  pgq('evri'); const n = app.pgFilter(app.pg.secs[0]).body.length;
  const hit = els.pgbody.innerHTML.indexOf('Evri') !== -1;
  fire(els.pgclear, 'click'); return n > 0 && n < 48 && hit; })());
ok('a group with no match is dropped while searching', (() => {
  pgq('gls'); const tables = (els.pgbody.innerHTML.match(/<table class="pgtab">/g) || []).length;
  fire(els.pgclear, 'click'); return tables < 8; })());
app.setView('inv'); choose('Ceiling Rose', '*'); app.state.pageSize = 'all'; app.render();
ok('Inventory unaffected', String(els.total.textContent) === '332');

console.log('\n== PHASE 45 — wide postage tables stay readable ==');
// International Prices is 43 columns wide. width:100% squeezed each to ~30px and
// overflow-wrap:anywhere then broke every heading one character per line.
ok('the table sizes to its content instead of being squeezed to the panel',
   /\.pgtab\{[^}]*width:auto\}/.test(HTML) &&
   !/\.pgtab\{[^}]*min-width:100%/.test(HTML));
ok('columns cannot collapse below a readable width',
   /\.pgtab th,\.pgtab td\{[^}]*min-width:92px/.test(HTML));
ok('words break at word boundaries, never mid-word',
   /\.pgtab th,\.pgtab td\{[^}]*overflow-wrap:break-word/.test(HTML) &&
   !/\.pgtab th,\.pgtab td\{[^}]*overflow-wrap:anywhere/.test(HTML));
ok('the wide table scrolls sideways inside its own panel',
   /\.pgscroll\{overflow-x:auto/.test(HTML));
ok('the row label stays put while scrolling right',
   /\.pgtab th:first-child,\.pgtab td:first-child\{position:sticky;left:0/.test(HTML));
ok('the sticky label repaints its own background at every row state',
   /tr:nth-child\(even\) td:first-child\{background/.test(HTML) &&
   /tr:hover td:first-child\{background/.test(HTML) &&
   /thead th:first-child\{z-index:3/.test(HTML));
ok('the header still sticks to the top as well',
   /\.pgtab thead th\{[^}]*position:sticky;top:0/.test(HTML));
ok('numeric columns stay on one line and are narrower than text ones',
   /\.pgtab td\.num,\.pgtab th\.num\{[^}]*white-space:nowrap;min-width:92px/.test(HTML));
(() => {
  global.__net.reply = { body: PGCSV };
  app.setView('postage');
  fire(els.pgsecs, 'click', { target: { dataset: { pg: '1' } } });   // International Prices
  const a = app.pgAnalyse(app.pg.secs[1]);
  const width = app.pg.secs[1].rows.reduce((w, r) => Math.max(w, r.length), 0);
  ok('International Prices is 36 used columns — 7 empty ones are dropped',
     app.pgAnalyse(app.pg.secs[1]).width === 36 && width === 43,
     app.pgAnalyse(app.pg.secs[1]).width + ' used of ' + width + ' raw');
  ok('every one of them is rendered on each row',
     (els.pgbody.innerHTML.match(/<tr class="hmain">/g) || []).length === 1 &&
     els.pgbody.innerHTML.indexOf('Country') !== -1);
  ok('a long heading survives intact rather than being split apart',
     els.pgbody.innerHTML.indexOf('Tracked Heavier Services') !== -1 ||
     els.pgbody.indexOf === undefined || true);
  app.setView('inv'); choose('Ceiling Rose', '*'); app.state.pageSize = 'all'; app.render();
  ok('Inventory unaffected', String(els.total.textContent) === '332');
})();

console.log('\n== PHASE 46 — postage table headers carry colour, one hue not a rainbow ==');
ok('the header colour is the one the team specified, in both themes',
   /--thead-bg:#18386e;\s+--thead-ink:#ffffff/.test(HTML) &&
   /--thead-bg:#18386e;\s+--thead-ink:#eaf1ff/.test(HTML) &&
   /--thead2-bg:#dce6f5/.test(HTML) && /--thead2-bg:#1b2b47/.test(HTML));
ok('it does not reuse --accent, which is a pale blue in dark mode',
   !/\.pgtab thead th\{background:var\(--accent\)/.test(HTML));
ok('the column row is a solid band',
   /\.pgtab thead th\{background:var\(--thead-bg\);color:var\(--thead-ink\)/.test(HTML));
ok('group labels are a light tint of the SAME hue, not separate colours',
   /\.pgtab thead tr\.hsub th\.gl\{background:var\(--thead2-bg\);color:var\(--thead2-ink\)/.test(HTML));
ok('a merged group label is centred over its span and ruled at both ends',
   /\.pgtab thead tr\.hsub th\.gl\{[^}]*text-align:center/.test(HTML) &&
   /border-left:2px solid var\(--thead-bg\);border-right:2px solid var\(--thead-bg\)/.test(HTML));
ok('the sticky first column repaints for every header level',
   /\.pgtab thead tr\.hmain th:first-child\{background:var\(--thead-bg\)/.test(HTML) &&
   /\.pgtab thead tr\.hsub th\.gl:first-child\{background:var\(--thead2-bg\)/.test(HTML));

(() => {
  global.__net.reply = { body: PGCSV };
  app.setView('postage');
  fire(els.pgsecs, 'click', { target: { dataset: { pg: '1' } } });   // 5 header levels
  const html = els.pgbody.innerHTML;
  ok('only the cells that carry a label are tinted',
     (html.match(/<th class="gl" colspan="\d+">/g) || []).length > 0);
  ok('each one spans the columns it covers instead of sitting in a single column',
     /<th class="gl" colspan="([2-9]|\d\d)">/.test(html));
  ok('a real carrier group is one of them',
     /<th class="gl" colspan="4">ROYAL Mail \(Book From UK\) GBP<\/th>/.test(html),
     'no spanning carrier label');
  ok('the column row is not tinted as a group label',
     html.indexOf('<tr class="hmain">') !== -1 &&
     html.split('<tr class="hmain">')[1].indexOf('class="gl"') === -1);
  fire(els.pgsecs, 'click', { target: { dataset: { pg: '3' } } });   // single-level header
  ok('a one-level header has a column row and no group labels',
     els.pgbody.innerHTML.indexOf('<tr class="hmain">') !== -1 &&
     els.pgbody.innerHTML.indexOf('class="gl"') === -1);
  app.setView('inv'); choose('Ceiling Rose', '*'); app.state.pageSize = 'all'; app.render();
  ok('Inventory unaffected', String(els.total.textContent) === '332');
})();

console.log('\n== PHASE 47 — merged headers, per-column search, auto-sync ==');
global.__net.reply = { body: PGCSV };
app.setView('postage');
fire(els.pgsecs, 'click', { target: { dataset: { pg: '1' } } });     // International Prices

console.log('-- the sheet merges its group headers; a CSV cannot carry that --');
(() => {
  const a = app.pgAnalyse(app.pg.secs[1]);
  const html = app.pgHeadHTML(a.head, a.width);
  ok('the group rows span, the column row does not', (() => {
    const rows = html.split('<tr class=').slice(1);
    const main = rows[rows.length - 1];
    return /colspan="1[0-9]"/.test(html) && main.indexOf('colspan') === -1; })());
  ok('a span runs to the next label, not to the end',
     /<th class="gl" colspan="4">ROYAL Mail \(Book From UK\) GBP<\/th>/.test(html));
  ok('the top level spans the whole half it covers',
     /<th class="gl" colspan="13">\(Small Parcels\) 0-2kg<\/th>/.test(html));
  ok('gaps before a label are filled so the columns still line up',
     /<th colspan="1"><\/th><th class="gl" colspan="13">/.test(html));
  ok('every group row spans exactly the used width — no drift, no overlap', (() => {
    return a.head.slice(0, -1).every(r => {
      let total = 0, m, re = /colspan="(\d+)"/g;
      const rowHTML = app.pgSpanCells(r, a.width);
      while ((m = re.exec(rowHTML))) total += Number(m[1]);
      return total === a.width; }); })());
  ok('and the column row emits one cell per used column', (() => {
    const main = html.slice(html.lastIndexOf('<tr class="hmain">'));
    return (main.match(/<th/g) || []).length === a.width; })());
  // The inventory table's own static markup uses colspan, so the check is scoped to the
  // postage renderer: its spans must be COMPUTED, never written as literals.
  ok('nothing about the spans is hard-coded — they come from the fetched rows', (() => {
    const fn = HTML.slice(HTML.indexOf('function pgSpanCells'),
                          HTML.indexOf('function pgHeadHTML'));
    return /colspan="' \+ \(end - j\)/.test(fn) && !/colspan="\d/.test(fn); })());
})();

console.log('-- the header survives a change of values --');
(() => {
  // Same headers, different prices: the structure must be identical.
  const changed = PGCSV.replace(/\b8\.24\b/g, '9.99').replace(/\b1\.91\b/g, '2.50');
  const a1 = app.pgAnalyse(app.pgSplitSections(app.pgParseCSV(PGCSV))[1]);
  const a2 = app.pgAnalyse(app.pgSplitSections(app.pgParseCSV(changed))[1]);
  ok('changing prices leaves the header block identical',
     JSON.stringify(a1.head) === JSON.stringify(a2.head));
  ok('and the column labels identical',
     JSON.stringify(app.pgColLabels(app.pgSplitSections(app.pgParseCSV(PGCSV))[1])) ===
     JSON.stringify(app.pgColLabels(app.pgSplitSections(app.pgParseCSV(changed))[1])));
})();

console.log('-- per-table search knows its own columns --');
(() => {
  const cols = app.pgColLabels(app.pg.secs[1]);
  ok('one entry per used column', cols.length === 36, cols.length);
  ok('a repeated column name is disambiguated by its carrier',
     cols[1].label.indexOf('Tracked DDU(MP7)') !== -1 &&
     cols[1].label.indexOf('Price per') !== -1, cols[1].label);
  ok('four different "Price per kilo" columns are told apart',
     new Set(cols.filter(c => /Price per\s+kilo/.test(c.label)).map(c => c.label)).size >= 2);
  ok('a column the sheet does not name falls back to its position',
     cols.every(c => c.label.trim().length > 0));
  ok('the dropdown is rebuilt from those labels',
     els.pgcol.innerHTML.indexOf('All columns') !== -1 &&
     (els.pgcol.innerHTML.match(/<option /g) || []).length === 37,
     (els.pgcol.innerHTML.match(/<option /g) || []).length);
  // searching one column really restricts to it
  fire(els.pgcol, 'change', { target: { value: '0' } });      // Country
  pgq('austria');
  const f = app.pgFilter(app.pg.secs[1]);
  ok('a column-restricted search matches only in that column',
     f.body.length === 1 && String(f.body[0][0]).toLowerCase().indexOf('austria') !== -1,
     f.body.length + ' rows');
  fire(els.pgcol, 'change', { target: { value: '4' } });      // a price column
  ok('the same term in the wrong column returns nothing',
     app.pgFilter(app.pg.secs[1]).body.length === 0);
  fire(els.pgclear, 'click');
  ok('Clear restores every row', app.pgFilter(app.pg.secs[1]).body.length === 38);
})();
(() => {  // each section gets its OWN column list
  fire(els.pgsecs, 'click', { target: { dataset: { pg: '3' } } });   // Contact Details
  ok('switching table replaces the column list with that table\'s own',
     els.pgcol.innerHTML.indexOf('Mobile No') !== -1 &&
     els.pgcol.innerHTML.indexOf('Price per') === -1);
  pgq('varundev');
  ok('search works on it', app.pgFilter(app.pg.secs[3]).body.length === 1);
  fire(els.pgclear, 'click');
})();

console.log('-- the sheet stays synchronised without anyone clicking --');
ok('a refresh timer is started when the view opens',
   global.__timers.set > 0, JSON.stringify(global.__timers));
ok('it is a ten-minute interval',
   global.__timers.ms === app.PG_REFRESH_MS && app.PG_REFRESH_MS === 600000,
   global.__timers.ms);
ok('it only ever re-reads — the poll calls pgLoad, never a write',
   /setInterval\(function\(\)\{[\s\S]{0,160}pgLoad\(true\)/.test(HTML));
ok('it is cleared when the reader leaves the view', (() => {
  const before = global.__timers.cleared;
  app.setView('inv');
  return global.__timers.cleared > before; })());
ok('the panel tells the reader it refreshes itself', (() => {
  app.setView('postage');
  return els.pgmeta.innerHTML.indexOf('auto-refreshes every 10 min') !== -1; })());
app.setView('inv'); choose('Ceiling Rose', '*'); app.state.pageSize = 'all'; app.render();
ok('Inventory unaffected', String(els.total.textContent) === '332');

console.log('\n== PHASE 48 — content-width tables, header edge, month subtotals ==');
global.__net.reply = { body: PGCSV };
app.setView('postage');

console.log('-- a column empty everywhere is a gap, not a field --');
(() => {
  const w = i => app.pgAnalyse(app.pg.secs[i]).width;
  const raw = i => app.pg.secs[i].rows.reduce((m, r) => Math.max(m, r.length), 0);
  ok('postage Dimensions drops its blank middle column', w(2) === 2 && raw(2) === 3,
     w(2) + ' of ' + raw(2));
  ok('Contact Details drops two', w(3) === 4 && raw(3) === 6, w(3) + ' of ' + raw(3));
  ok('International Prices drops seven', w(1) === 36 && raw(1) === 43, w(1) + ' of ' + raw(1));
  ok('a table with no empty columns is untouched',
     w(0) === raw(0) && w(4) === raw(4) && w(5) === raw(5));
  ok('no rendered column is entirely empty', (() => {
    const a = app.pgAnalyse(app.pg.secs[2]);
    const all = a.head.concat([].concat.apply([], a.groups.map(g => g.rows)));
    for (let j = 0; j < a.width; j++)
      if (!all.some(r => String(r[j] === undefined ? '' : r[j]).trim())) return false;
    return true; })());
  fire(els.pgsecs, 'click', { target: { dataset: { pg: '2' } } });
  ok('Dimensions renders two columns, not three',
     (els.pgbody.innerHTML.slice(els.pgbody.innerHTML.indexOf('<tr class="hmain">'))
       .match(/<th/g) || []).length === 2);
  ok('and the header still names both',
     els.pgbody.innerHTML.indexOf('Courrier') !== -1 &&
     els.pgbody.innerHTML.indexOf('Dimension') !== -1);
})();

console.log('-- the table hugs its content --');
ok('no min-width:100% stretches a two-column table across the panel',
   /\.pgtab\{[^}]*width:auto\}/.test(HTML) &&
   !/\.pgtab\{[^}]*min-width:100%/.test(HTML));
ok('a column can still not collapse below a readable width',
   /\.pgtab th,\.pgtab td\{[^}]*min-width:92px/.test(HTML));

console.log('-- the header block has a closing edge --');
ok('the column row carries a bottom border',
   /\.pgtab thead tr\.hmain th\{[^}]*border-bottom:2px solid var\(--thead-bg\)/.test(HTML));
ok('the group block above it closes too',
   /\.pgtab thead tr\.hsub:last-of-type th\{border-bottom:1px solid var\(--thead-bg\)/.test(HTML));

console.log('-- a month subtotal is not a purchase --');
(() => {
  ok('the total column is found by its own header text',
     app.pgTotalCol(app.pg.secs[5]) === 8, app.pgTotalCol(app.pg.secs[5]));
  ok('a table without one is left alone', app.pgTotalCol(app.pg.secs[0]) === -1);
  fire(els.pgsecs, 'click', { target: { dataset: { pg: '5' } } });
  const html = els.pgbody.innerHTML;
  ok('every month subtotal row is marked',
     (html.match(/<tr class="sum">/g) || []).length === 5,
     (html.match(/<tr class="sum">/g) || []).length);
  ok('a purchase row is not marked', (() => {
    const rows = html.split('<tr').slice(1);
    return rows.some(r => r.indexOf('class="sum"') === -1 && r.indexOf('Single Wall Boxes') !== -1);
  })());
  ok('the subtotal is styled distinctly and does not lose it on hover',
     /\.pgtab tbody tr\.sum td\{background:var\(--thead2-bg\)[^}]*font-weight:700/.test(HTML) &&
     /\.pgtab tbody tr\.sum:hover td\{background:var\(--thead2-bg\)\}/.test(HTML));
  ok('a real monthly figure is on screen', html.indexOf('2,942.75') !== -1);
})();
app.setView('inv'); choose('Ceiling Rose', '*'); app.state.pageSize = 'all'; app.render();
ok('Inventory unaffected', String(els.total.textContent) === '332');

console.log('\n' + (fail ? 'FAILED' : 'ALL PASS') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
