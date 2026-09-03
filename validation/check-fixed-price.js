'use strict';
// Drives the SKU Fixed Price tab the way a reader does — render, search, sort, filter,
// paginate — against the page's OWN code, and checks what it produces. Read-only.
//
//   node validation/check-fixed-price.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const FILE = process.env.DASHBOARD || path.join(ROOT, 'dashboard', 'inventory-dashboard.html');
const html = fs.readFileSync(FILE, 'utf8');

const above = html.slice(0, html.indexOf('<script>'));
const DOM_IDS = new Set();
above.replace(/id="([^"]+)"/g, (m, id) => { DOM_IDS.add(id); return m; });

const els = {}; const missing = []; const handlers = {};
function mkEl(id){
  return { id, innerHTML: '', textContent: '', value: '', hidden: false, attrs: {},
           options: [], selectedOptions: [{ textContent: '' }], dataset: {}, style: {},
           classList: { add(){}, remove(){}, toggle(){}, contains: () => false },
           addEventListener(t, fn){ (handlers[id] = handlers[id] || {})[t] = fn; },
           appendChild(){},
           setAttribute(k, v){ this.attrs[k] = v; }, getAttribute(k){ return this.attrs[k] || ''; },
           insertAdjacentHTML(pos, h){ this.innerHTML += h; },
           querySelector: () => null, querySelectorAll: () => [], replaceWith(){}, focus(){} };
}
const document = {
  getElementById: id => { if (!DOM_IDS.has(id)){ missing.push(id); return null; }
                          return els[id] || (els[id] = mkEl(id)); },
  querySelector: () => null, querySelectorAll: () => [],
  createElement: () => mkEl('new'), addEventListener(){},
  documentElement: mkEl('html'), body: mkEl('body')
};
const src = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
const sb = { console, out: null };
const timers = [];
new Function('sandbox','document','window','localStorage','setInterval','clearInterval',
             'setTimeout','clearTimeout','fetch','alert',
  src + '\n; sandbox.out = { FIXED_PRICE, fx, fxRender, fxFilter, fxDraw, fxName, fxDate, FX_MK, FX_ABSENT, setView, fxPageCount, fxPageList, FX_SIZES, fxEffSize, fxAutoRows, FX_AUTO_MIN, FX_AUTO_MAX, fxCat, FX_CATS, FX_RULES, FX_ICON, renderFreshness, FRESH_SRC, state, pg, freshStamp };')
  (sb, document, { addEventListener(){}, matchMedia: () => ({ matches:false, addEventListener(){} }) },
   { getItem: () => null, setItem(){} }, () => 0, () => 0,
   fn => { timers.push(fn); return timers.length; }, () => 0,
   () => ({ then(){ return this; }, catch(){ return this; } }), () => 0);

const { FIXED_PRICE, fx, fxRender, fxFilter, fxDraw, fxName, fxDate, FX_MK, FX_ABSENT, setView,
        fxPageCount, fxPageList, FX_SIZES, fxEffSize, fxAutoRows, FX_AUTO_MIN, FX_AUTO_MAX,
        fxCat, FX_CATS, FX_RULES, FX_ICON, renderFreshness, FRESH_SRC, state, pg, freshStamp } = sb.out;
const fail = [];
const chk = (name, ok, note) => { console.log('  ' + (ok ? 'OK  ' : '*** ') + name +
  (note !== undefined ? '  — ' + note : '')); if (!ok) fail.push(name); };

console.log('ids looked up but absent from markup:', missing.length,
            missing.length ? '*** ' + [...new Set(missing)].join(', ') : '');

// ---- 1. the data block ------------------------------------------------------
console.log('\n=== data ===');
const R = FIXED_PRICE.r, D = FIXED_PRICE.d, U = FIXED_PRICE.u;
chk('FIXED_PRICE is populated', R.length > 20000, R.length.toLocaleString() + ' rows, ' +
    D.length.toLocaleString() + ' name parts');
chk('every row carries at least one price', R.every(r => r[4] || r[5] || r[6] || r[7]));
chk('prices are integers (pence, no float noise)',
    R.every(r => [4,5,6,7].every(i => !r[i] || Number.isInteger(r[i]))));
chk('no duplicate SKU', new Set(R.map(r => r[0])).size === R.length);
chk('every date index resolves', R.every(r => Array.isArray(U[r[8]]) && U[r[8]].length === 4),
    U.length.toLocaleString() + ' distinct date tuples');
chk('a date is only present where that marketplace has a price',
    R.every(r => U[r[8]].every((d, i) => !d || r[4 + i])),
    'no row borrows a date from a channel it is not listed on');
const single = R.filter(r => r[1] === 1).length;
chk('both single and combo SKUs are present', single > 0 && single < R.length,
    single.toLocaleString() + ' single, ' + (R.length - single).toLocaleString() + ' combo');

// ---- 2. render --------------------------------------------------------------
console.log('\n=== render ===');
setView('fx');
chk('the tab renders rows', /<tr>/.test(els.fxbody.innerHTML),
    fx.drawn.toLocaleString() + ' of ' + fx.view.length.toLocaleString() + ' drawn');
chk('it opens on Single SKUs', fx.type === 'single' && fx.view.every(r => r.t === 1),
    fx.view.length.toLocaleString() + ' single SKUs');
chk('the Single button is the pressed one at open',
    els.fxtSingle.getAttribute('aria-pressed') === 'true' &&
    els.fxtAll.getAttribute('aria-pressed') === 'false');
chk('it opens on the window-fitting page size', fx.size === 'auto',
    'auto -> ' + fxEffSize() + ' rows');
chk('the fitted size never drops below the floor', fxEffSize() >= FX_AUTO_MIN,
    fxEffSize() + ' (floor ' + FX_AUTO_MIN + ')');
chk('  and never runs past the ceiling', fxEffSize() <= FX_AUTO_MAX,
    fxEffSize() + ' (ceiling ' + FX_AUTO_MAX + ')');
chk('the drawn rows match the fitted size', fx.drawn === fxEffSize(), fx.drawn + ' rows in the DOM');
const headHTML = els.fxhead.innerHTML;
['SKU','Image','Product Name','SKU Type','Shopify','eBay','Amazon','B&amp;Q','Wayfair','Temu','Last Updated']
  .forEach(h => chk('header column ' + h.replace('&amp;','&'), headHTML.indexOf('>' + h) !== -1));
// the cells show a dash like any unpriced marketplace; the coverage strip is where the
// distinction is made, so that is what must state it
chk('Wayfair and Temu are declared as having no data source',
    (els.fxcov.innerHTML.match(/No data source/g) || []).length === FX_ABSENT.length,
    FX_ABSENT.map(a => a.n).join(' and '));
chk('no coverage percentage is invented for them',
    FX_ABSENT.every(a => !new RegExp(a.n + '</b>[^<]*\\d+%').test(els.fxcov.innerHTML)));
chk('every marketplace has a real mark, not a letter',
    FX_MK.concat(FX_ABSENT).every(o => FX_ICON[o.n] && FX_ICON[o.n].length > 200),
    FX_MK.concat(FX_ABSENT).map(o => o.n + ' ' + (FX_ICON[o.n] || '').slice(0, 4)).join(', '));
chk('every mark is embedded, none fetched at runtime',
    Object.keys(FX_ICON).every(k => !/https?:\/\//.test(FX_ICON[k])),
    'no CDN or remote URL in any icon');
chk('all six marks render in the coverage strip',
    FX_MK.concat(FX_ABSENT).every(o => els.fxcov.innerHTML.indexOf(FX_ICON[o.n]) !== -1));
chk('the four real marketplaces do show coverage',
    (els.fxcov.innerHTML.match(/\d+\.\d%/g) || []).length === FX_MK.length,
    (els.fxcov.innerHTML.match(/\d+\.\d%/g) || []).join('  '));

// ---- 3. names ---------------------------------------------------------------
console.log('\n=== product names ===');
const named = R.filter(r => fxName(r[2]) !== r[0]).length;
chk('most rows have a real product name, not the bare SKU', named / R.length > 0.75,
    named.toLocaleString() + ' of ' + R.length.toLocaleString() +
    ' (' + (100 * named / R.length).toFixed(1) + '%)');
const packRow = R.find(r => Array.isArray(r[2]) && r[2].length === 2 && r[2][1] < 0);
chk('pack combos name their base product', !!packRow && / \(\d+ Pack\)$/.test(fxName(packRow[2])),
    packRow ? packRow[0] + ' -> ' + fxName(packRow[2]) : 'none');
const comboRow = R.find(r => Array.isArray(r[2]) && r[2].length > 1 && r[2][1] >= 0);
chk('multi-part combos join their components', !!comboRow && fxName(comboRow[2]).indexOf(' + ') !== -1,
    comboRow ? comboRow[0] + ' -> ' + fxName(comboRow[2]).slice(0, 70) : 'none');
chk('no name is the literal placeholder', !R.some(r => fxName(r[2]) === 'Combo Default Title.'));

// ---- 4. search --------------------------------------------------------------
console.log('\n=== search ===');
const probe = R.find(r => r[1] === 1 && fxName(r[2]).length > 12);
fx.q = probe[0].toLowerCase(); fxFilter();
chk('search by SKU finds it', fx.view.some(r => r.s === probe[0]),
    probe[0] + ' -> ' + fx.view.length + ' row(s)');
const word = fxName(probe[2]).split(/\s+/).find(w => w.length > 4).toLowerCase();
fx.q = word; fxFilter();
chk('search by product name matches', fx.view.length > 0 && fx.view.every(r => r.k.indexOf(word) !== -1),
    '"' + word + '" -> ' + fx.view.length.toLocaleString() + ' rows');
fx.q = 'zzzz-no-such-sku'; fxFilter(); fxDraw();
chk('a search with no match says so', /No SKU matches/.test(els.fxbody.innerHTML));
fx.q = '';

// ---- 5. filters -------------------------------------------------------------
console.log('\n=== filters ===');
fx.type = 'single'; fxFilter();
chk('Single filter returns only singles', fx.view.length > 0 && fx.view.every(r => r.t === 1),
    fx.view.length.toLocaleString() + ' rows');
fx.type = 'combo'; fxFilter();
chk('Combo filter returns only combos', fx.view.length > 0 && fx.view.every(r => r.t === 0),
    fx.view.length.toLocaleString() + ' rows');
fx.type = 'all';
for (let i = 0; i < FX_MK.length; i++){
  fx.mk = String(i); fxFilter();
  chk('"Listed on ' + FX_MK[i].n + '" filter', fx.view.length > 0 && fx.view.every(r => r.p[i] > 0),
      fx.view.length.toLocaleString() + ' rows');
}
fx.mk = 'd'; fxFilter();
chk('"Prices disagree" returns only genuine disagreements',
    fx.view.length > 0 && fx.view.every(r => r.hi > r.lo),
    fx.view.length.toLocaleString() + ' rows where marketplaces differ');
fx.mk = '';

// ---- 5b. category filter --------------------------------------------------
console.log('\n=== category filter ===');
fx.type = 'all'; fx.q = ''; fx.mk = '';
chk('longest prefix wins', fxCat('12IP20100') === 'Transformers' && fxCat('12BO100') === 'Transformers' &&
    fxCat('FCB123') === 'Home Appliances', '12IP before 12, FCB before FW');
chk('PH resolves to the dedicated category, not Lighting', fxCat('PHBK1PBRBA') === 'Pendant Lamp Holder');
chk('a combo takes its first component\'s category',
    fxCat('CRSF100GR+LHFHE2720WH') === fxCat('CRSF100GR'), 'CRSF100GR+… -> ' + fxCat('CRSF100GR+LHFHE2720WH'));
chk('an unmatched SKU falls to Others', fxCat('ENC9790') === 'Others');
let catTotal = 0;
Object.keys(FX_CATS).concat(['Others']).forEach(c => {
  fx.cat = c; fxFilter();
  catTotal += fx.view.length;
  chk('  ' + c.padEnd(20) + String(fx.view.length).padStart(6) + ' SKUs',
      fx.view.length > 0 && fx.view.every(r => r.c === c));
});
fx.cat = ''; fxFilter();
chk('every SKU lands in exactly one category', catTotal === fx.rows.length,
    catTotal.toLocaleString() + ' of ' + fx.rows.length.toLocaleString());
chk('the category filter composes with the others',
    (() => { fx.cat = 'Bulbs'; fx.type = 'single'; fxFilter();
             const ok = fx.view.every(r => r.c === 'Bulbs' && r.t === 1);
             fx.cat = ''; fx.type = 'all'; fxFilter(); return ok; })());

// ---- 6. sorting -------------------------------------------------------------
console.log('\n=== sorting ===');
const asc = a => a.every((v, i) => i === 0 || a[i-1] <= v);
fx.sort = 's'; fx.dir = 1; fxFilter();
chk('sort by SKU ascending', asc(fx.view.map(r => r.s)));
fx.dir = -1; fxFilter();
chk('sort by SKU descending', asc(fx.view.map(r => r.s).reverse()));
fx.sort = 'n'; fx.dir = 1; fxFilter();
// the page sorts names with localeCompare, so the assertion has to use the same collation
const ascLocale = a => a.every((v, i) => i === 0 || a[i-1].localeCompare(v) <= 0);
chk('sort by Product Name', ascLocale(fx.view.map(r => r.n)));
for (let i = 0; i < FX_MK.length; i++){
  fx.sort = String(i); fx.dir = 1; fxFilter();
  const priced = fx.view.filter(r => r.p[i]);
  const blanks = fx.view.slice(priced.length);
  chk('sort by ' + FX_MK[i].n + ' price puts unlisted SKUs last',
      asc(priced.map(r => r.p[i])) && blanks.every(r => !r.p[i]),
      priced.length.toLocaleString() + ' priced, ' + blanks.length.toLocaleString() + ' unlisted');
}
fx.sort = 'u'; fx.dir = 1; fxFilter();
chk('sort by Last Updated', asc(fx.view.map(r => r.u)));

// ---- 7. pagination ----------------------------------------------------------
console.log('\n=== pagination ===');
fx.type = 'all'; fx.sort = 's'; fx.dir = 1; fxFilter(); fxDraw();
chk('page sizes offered', FX_SIZES.join(',') === 'auto,15,25,100,500,all', FX_SIZES.join(' · '));
chk('with no viewport to measure, auto falls back to the floor rather than guessing',
    fxAutoRows() === FX_AUTO_MIN, fxAutoRows() + ' rows');
chk('the auto range covers 15 to 24 at a normal window size',
    FX_AUTO_MIN <= 15 && FX_AUTO_MAX >= 15, FX_AUTO_MIN + '\u2013' + FX_AUTO_MAX);
[15, 25, 100, 500].forEach(n => {
  fx.size = n; fx.page = 1; fxDraw();
  chk('a page of ' + n + ' draws exactly ' + n + ' rows', fx.drawn === n, fx.drawn + ' drawn');
  chk('  page count is right for ' + n,
      fxPageCount() === Math.ceil(fx.view.length / n), fxPageCount().toLocaleString() + ' pages');
});
fx.size = 'all'; fx.page = 1; fxDraw();
chk('"All rows" draws every match on one page', fx.drawn === fx.view.length && fxPageCount() === 1,
    fx.drawn.toLocaleString() + ' rows');
chk('"All rows" hides the pager', els.fxpager.innerHTML === '');

fx.size = 15; fx.page = 1; fxDraw();
const p1 = els.fxbody.innerHTML;
fx.page = 2; fxDraw();
chk('page 2 shows different rows from page 1', els.fxbody.innerHTML !== p1);
chk('page 2 is the next 15 in order',
    fx.view[15] && els.fxbody.innerHTML.indexOf('>' + fx.view[15].s + '<') !== -1,
    'first row of page 2 = ' + (fx.view[15] || {}).s);
const lastPage = fxPageCount();
fx.page = lastPage; fxDraw();
const tail = fx.view.length - (lastPage - 1) * 15;
chk('the final page holds the remainder', fx.drawn === tail, fx.drawn + ' rows');
chk('Next and Last are disabled on the final page',
    (els.fxpager.innerHTML.match(/disabled/g) || []).length >= 2);
fx.page = 1; fxDraw();
chk('First and Previous are disabled on page 1',
    (els.fxpager.innerHTML.match(/disabled/g) || []).length >= 2);
chk('the pager elides rather than printing every page',
    fxPageList(1, 2000).length <= 9 && fxPageList(1, 2000).indexOf('…') !== -1,
    fxPageList(1, 2000).join(' '));
chk('a short run prints every page, no ellipsis',
    fxPageList(2, 5).join(',') === '1,2,3,4,5');
chk('the middle of a long run shows both ellipses',
    fxPageList(50, 100).filter(v => v === '…').length === 2, fxPageList(50, 100).join(' '));
chk('changing the filter returns to page 1',
    (() => { fx.page = 4; fx.q = 'led'; fxFilter(); return fx.page === 1; })());
fx.q = ''; fxFilter(); fxDraw();
chk('the count line reports the visible range and the total',
    /Showing 1–15 of [\d,]+ SKUs/.test(els.fxcount.textContent), els.fxcount.textContent);

// ---- 7b. the full product name is never hidden -----------------------------
console.log('\n=== full product names ===');
fx.type = 'all'; fx.q = ''; fx.mk = ''; fxFilter(); fxDraw();
chk('no name is truncated with an ellipsis', !R.some(r => fxName(r[2]).indexOf('\u2026') !== -1));
const longest = fx.rows.reduce((a, b) => b.n.length > a.n.length ? b : a);
chk('the longest name is carried whole', longest.n.length > 120,
    longest.n.length + ' characters — ' + longest.s);
chk('the rendered cell contains the whole name',
    (() => { fx.q = longest.s.toLowerCase(); fxFilter(); fxDraw(); fx.q = '';
             return els.fxbody.innerHTML.indexOf(longest.n.slice(0, 60)
               .replace(/&/g,'&amp;').replace(/</g,'&lt;')) !== -1; })());
// This used to test the whole document for -webkit-line-clamp, which was fine when
// the only clamp on the page was this one. Container Details legitimately clamps its
// manifest names to two lines, so the test is scoped to what it actually means: no
// clamp may reach the FIXED PRICE name cell. Component titles here are carried whole
// — they were once cut at 46 characters, which put a literal ellipsis in the middle
// of a product name.
chk('the name cell is not clamped in CSS', (() => {
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)[1].replace(/\/\*[\s\S]*?\*\//g, '');
  return ![...css.matchAll(/(^|\n)\s*([^\n{}]+)\{([^}]*)\}/g)]
    .some(m => /line-clamp/.test(m[3]) && /fxname|\bfxtab\b/.test(m[2]) && !/cdmtab|cdclamp/.test(m[2]));
})());
// `table.fxtab td` is more specific than a bare `.fxname`, so an unscoped cell rule is
// silently overridden — that is exactly how the name came to run through its neighbours.
chk('every cell rule outranks the base table rule',
    ['fxname','fxsku','fxprice','fxdate','fxna','fxnone']
      .filter(c => !new RegExp('table\\.fxtab td\\.' + c + '\\{').test(html))
      .join(', ') === '',
    'all scoped to table.fxtab td.*');
chk('the name column is not made unnecessarily wide', /col\.c-name\{width:3[0-9]%\}/.test(html),
    (/col\.c-name\{width:([^}]+)\}/.exec(html) || [])[1]);
chk('no cell clips with text-overflow inside the price table',
    !/table\.fxtab th,table\.fxtab td\{[^}]*text-overflow/.test(html));
fxFilter(); fxDraw();

// ---- 7c. refresh details, per tab -------------------------------------------
console.log('\n=== refresh details ===');
chk('every tab declares a source', ['inv','fx','postage'].every(k =>
      FRESH_SRC[k] && FRESH_SRC[k].tab && FRESH_SRC[k].src && FRESH_SRC[k].every));
[['inv','Inventory'],['fx','SKU Fixed Price'],['postage','Postage Information']].forEach(([v, label]) => {
  setView(v); renderFreshness();
  const txt = els.freshTag.textContent, tip = els.freshTag.title;
  chk('the ' + label + ' tab names itself in the tag', txt.indexOf(label) === 0, txt);
  chk('  and still records its source on the tag tooltip',
      tip.indexOf(FRESH_SRC[v].src) !== -1, FRESH_SRC[v].src.slice(0, 72) + '…');
  chk('  and states its refresh interval', tip.indexOf(FRESH_SRC[v].every) !== -1);
});
setView('fx'); renderFreshness();
chk('the refresh date and time are shown, not just "x minutes ago"',
    /refreshed \d{1,2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2} UTC \(/.test(els.freshTag.textContent),
    els.freshTag.textContent);
chk('the source names real database tables, not a label',
    /listings\.shopify_listings/.test(FRESH_SRC.fx.src) &&
    /inventory\.products/.test(FRESH_SRC.inv.src));
chk('Postage names its actual sheet tab', /Postage Information/.test(FRESH_SRC.postage.src) &&
    /gid \d+/.test(FRESH_SRC.postage.src), FRESH_SRC.postage.src);
setView('inv'); renderFreshness();
chk('the tag is still shown on the Inventory (home) tab',
    els.freshTag.hidden === false && els.freshTag.textContent.length > 0,
    els.freshTag.textContent);
chk('and the refresh details survive the trip back to Inventory',
    (() => { setView('fx'); renderFreshness(); setView('inv'); renderFreshness();
             return els.freshTag.textContent.indexOf('Inventory') === 0 &&
                    els.freshTag.title.indexOf(FRESH_SRC.inv.src) !== -1; })(),
    els.freshTag.textContent);
chk('Postage says "not loaded yet" before it is fetched, not a bogus date',
    (() => { setView('postage'); renderFreshness();
             return /not loaded yet/.test(els.freshTag.textContent); })(),
    els.freshTag.textContent);
setView('fx');

// ---- 8. dates and money -----------------------------------------------------
console.log('\n=== formatting ===');
const someDay = U.flat().find(Boolean);
chk('dates render as DD/MM/YYYY', /^\d{2}\/\d{2}\/\d{4}$/.test(fxDate(someDay)), fxDate(someDay));
chk('the row date is the newest of the marketplaces it is priced on',
    fx.rows.every(r => { const mine = r.d.filter((v, i) => v && r.p[i]);
                         return r.u === (mine.length ? Math.max.apply(null, mine) : 0); }));
chk('an absent date renders empty, not 01/01/1970', fxDate(0) === '');
const money = (els.fxbody.innerHTML.match(/£\d+\.\d{2}/g) || []).length;
chk('prices render as £ with two decimals', money > 0, money + ' price cells drawn');

console.log('\n' + (fail.length ? '*** ' + fail.length + ' CHECK(S) FAILED' : 'ALL CHECKS PASSED'));
process.exit(fail.length ? 1 : 0);
