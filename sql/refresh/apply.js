'use strict';
// Installs the built data into the dashboard. ATOMIC: it writes a temporary file,
// validates that file, backs up the current dashboard, then renames into place. If any
// post-apply check fails the backup is restored automatically.
//
// The dashboard is NEVER written to directly, and a partially written HTML can never be
// left behind: rename(2) on the same filesystem is atomic.
//
//   node sql/refresh/apply.js [--dry]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { span, ARRAYS } = require('./raw-arrays.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FILE = path.join(ROOT, 'dashboard', 'inventory-dashboard.html');
const TMP  = FILE + '.tmp';
const BAK  = FILE + '.bak';
const OUT  = path.join(__dirname, 'out');
const DRY  = process.argv.indexOf('--dry') > 0;
const log  = (...a) => console.log('[apply]', ...a);

// what a healthy dashboard looks like — the existing baseline
const FLOOR_ROWS  = 5000;          // a collapse below this must never publish
const FLOOR_BYTES = 2 * 1024 * 1024;
const BLOCKS = ['HIST_RAW', 'SHOPIFY_PRICE', 'SHOPIFY_COMMENT', 'SHOPIFY_ALT',
                'WH5_STOCK', 'LAST_CONTAINER', 'RECEIVED', 'INCOMING', 'FIXED_PRICE', 'SLOW_MOVING', 'PENDING_DISPATCH',
                'CONTAINER_DETAILS'];

// `const INCOMING      = {` is padded for alignment, so the search must tolerate
// whitespace rather than matching an exact string.
function objSpan(src, name){
  const a = src.search(new RegExp('const ' + name + '\\s*=\\s*\\{'));
  if (a < 0) throw new Error('object not found: ' + name);
  const s = src.indexOf('{', a);
  let d = 0;
  for (let p = s; p < src.length; p++){
    if (src[p] === '{') d++;
    else if (src[p] === '}'){ d--; if (!d) return [s, p + 1]; }
  }
  throw new Error('unbalanced ' + name);
}
const rd = n => JSON.parse(fs.readFileSync(path.join(OUT, n), 'utf8'));

// ---- 1. compose the new file -----------------------------------------------
let src = fs.readFileSync(FILE, 'utf8');
const before = src.length;
const meta = rd('_meta.json');

ARRAYS.forEach(([name]) => {
  const rows = rd('array_' + name + '.json');
  const r = span(src, name);
  src = src.slice(0, r[0]) + JSON.stringify(rows) + src.slice(r[1]);
});
log('arrays replaced   :', ARRAYS.length);

const put = (name, value) => { const r = objSpan(src, name);
                               src = src.slice(0, r[0]) + JSON.stringify(value) + src.slice(r[1]); };
put('WH5_STOCK',      rd('WH5_STOCK.json'));
put('LAST_CONTAINER', rd('LAST_CONTAINER.json'));
put('HIST_RAW',       rd('HIST_RAW.json'));
put('RECEIVED',       rd('RECEIVED.json'));
put('SHOPIFY_PRICE',  rd('shopify-price_data.json'));
put('SHOPIFY_ALT',    rd('shopify-alt-price_data.json'));
put('SHOPIFY_COMMENT', rd('shopify-comments.json'));
put('FIXED_PRICE',    rd('FIXED_PRICE.json'));
put('SLOW_MOVING',    rd('SLOW_MOVING.json'));
put('PENDING_DISPATCH', rd('PENDING_DISPATCH.json'));
put('CONTAINER_DETAILS', rd('CONTAINER_DETAILS.json'));
const inc = rd('INCOMING.json');
put('INCOMING', inc.INCOMING);
{ // the two interned arrays beside it
  const a = src.search(/const INC_CONTAINER = \[/); const s0 = src.indexOf('[', a);
  let d = 0, e = s0;
  for (let p = s0; p < src.length; p++){ if (src[p]==='[') d++; else if (src[p]===']'){ d--; if(!d){ e=p+1; break; } } }
  src = src.slice(0, s0) + JSON.stringify(inc.INC_CONTAINER) + src.slice(e);
}
log('lookups replaced  :', BLOCKS.length);

// ---- 2. freshness: ONLY the DATA_AS_OF value --------------------------------
const stamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const beforeStamp = src;
src = src.replace(/const DATA_AS_OF = '[^']*';/, "const DATA_AS_OF = '" + stamp + "';");
if (src === beforeStamp) throw new Error('DATA_AS_OF not found — refusing to publish undated data');
// The same stamp goes in the HEAD. A page left open checks for new data by reading the
// first 2 KB of itself; without this it would have to pull the whole 10 MB to find out.
const beforeMeta = src;
src = src.replace(/<meta name="data-as-of" content="[^"]*">/,
                  '<meta name="data-as-of" content="' + stamp + '">');
if (src === beforeMeta) throw new Error('data-as-of meta not found — refusing to publish');
log('DATA_AS_OF        :', stamp);

// ---- 3. write the TEMPORARY file --------------------------------------------
fs.writeFileSync(TMP, src);
log('temp written      :', TMP, '(' + src.length.toLocaleString() + ' chars)');

// ---- 4. validate the temporary file BEFORE it goes anywhere ------------------
const fail = [];
const chk = (name, ok, note) => { if (!ok) fail.push(name + (note ? ' — ' + note : '')); };

const st = fs.statSync(TMP);
chk('file exists and is non-empty', st.size > 0);
chk('file is not truncated', st.size >= FLOOR_BYTES, st.size + ' bytes');
chk('DATA_AS_OF present', /const DATA_AS_OF = '[^']+';/.test(src));
chk('the head stamp matches DATA_AS_OF',
    (new RegExp('<meta name="data-as-of" content="' + stamp + '">')).test(src));
chk('the head stamp is in the first 2 KB', src.indexOf('name="data-as-of"') < 2048,
    'at byte ' + src.indexOf('name="data-as-of"'));
chk('REFRESH_EVERY_HOURS preserved', /const REFRESH_EVERY_HOURS = \d+;/.test(src));
BLOCKS.forEach(b => chk('block ' + b, new RegExp('const ' + b + '\\s*=\\s*\\{').test(src)));
ARRAYS.forEach(([n]) => chk('array ' + n, new RegExp('const ' + n + '\\s*=\\s*\\[').test(src)));
// every block must also be non-trivial — an empty {} would pass a presence test
BLOCKS.forEach(b => { const m = new RegExp('const ' + b + '\\s*=\\s*\\{(.{0,3})').exec(src);
                      chk('block ' + b + ' is populated', !!m && m[1].trim() !== '}' , 'empty'); });

// parse the temp file the way a browser would, and count what it renders
let rendered = 0, dupes = [], sections = {};
try {
  const out = execFileSync(process.execPath,
    [path.join(ROOT, 'validation', 'smoke-render.js')],
    { env: { ...process.env, DASHBOARD: TMP }, encoding: 'utf8' });
  const m = /total rows rendered\s*:\s*([\d,]+)/.exec(out);
  rendered = m ? Number(m[1].replace(/,/g, '')) : 0;
  chk('smoke render', /sections rendering the wrong count : 0/.test(out) &&
      /ids looked up but absent from markup: 0/.test(out), 'see log');
} catch (e){
  chk('smoke render', false, String(e.message).split('\n')[0]);
}
chk('rows rendered', rendered >= FLOOR_ROWS, rendered + ' rows (floor ' + FLOOR_ROWS + ')');

// Every tab button must actually be wired. Pending Dispatch once shipped with markup, a
// view and a renderer but no click handler — the smoke render never noticed, because it
// calls setView() directly rather than pressing the button.
try {
  const out = execFileSync(process.execPath,
    [path.join(ROOT, 'validation', 'check-tabs-wired.js')],
    { env: { ...process.env, DASHBOARD: TMP }, encoding: 'utf8' });
  chk('every tab button is wired', /ALL CHECKS PASSED/.test(out),
      (out.match(/\*\*\*.*/g) || ['see log'])[0]);
} catch (e){
  chk('every tab button is wired', false, String(e.message).split('\n')[0]);
}
// the small-screen menu drives the same views; it must work too
try {
  const out = execFileSync(process.execPath,
    [path.join(ROOT, 'validation', 'check-tab-menu.js')],
    { env: { ...process.env, DASHBOARD: TMP }, encoding: 'utf8' });
  chk('the small-screen tab menu works', /ALL CHECKS PASSED/.test(out),
      (out.match(/\*\*\*.*/g) || ['see log'])[0]);
} catch (e){
  chk('the small-screen tab menu works', false, String(e.message).split('\n')[0]);
}

// IMAGE URLs must survive the round trip. `DATA` and `LH_EXTRA` are not passed through
// imgURL() by the page, so a bare filename in either would 404 every thumbnail. This
// guard exists because exactly that shipped once.
{
  const NO_NORM = ['DATA', 'LH_EXTRA'];
  NO_NORM.forEach(n => {
    const rows = rd('array_' + n + '.json').filter(r => r.i);
    const bare = rows.filter(r => !/^https?:\/\//i.test(r.i));
    chk('images absolute in ' + n, bare.length === 0,
        bare.length + ' of ' + rows.length + ' are bare filenames, e.g. ' + (bare[0] || {}).i);
  });
  // and the normalised arrays must NOT be pre-expanded, or imgURL would double the base
  ['LS_DATA','SPR_DATA','CSM_DATA'].forEach(n => {
    const rows = rd('array_' + n + '.json').filter(r => r.i);
    const abs = rows.filter(r => /^https?:\/\//i.test(r.i));
    chk('images bare in ' + n, abs.length === 0, abs.length + ' unexpectedly absolute');
  });
}

// the SKU Fixed Price tab: a collapse here would publish an empty third tab
{
  const fp = rd('FIXED_PRICE.json');
  chk('FIXED_PRICE has a name dictionary', Array.isArray(fp.d) && fp.d.length > 1000,
      (fp.d || []).length + ' entries');
  chk('FIXED_PRICE has rows', Array.isArray(fp.r) && fp.r.length >= 20000,
      (fp.r || []).length + ' rows');
  const priced = (fp.r || []).filter(r => r[4] || r[5] || r[6] || r[7]).length;
  chk('every FIXED_PRICE row carries a price', priced === (fp.r || []).length,
      (fp.r || []).length - priced + ' rows have no price at all');
  const maxIdx = (fp.d || []).length - 1;
  const bad = (fp.r || []).filter(r => {
    const n = r[2];
    return typeof n === 'number' ? (n < 0 || n > maxIdx)
                                 : n.some((v, i) => (i === 1 && v < 0) ? false : (v < 0 || v > maxIdx));
  });
  chk('every FIXED_PRICE name index resolves', bad.length === 0,
      bad.length + ' rows point outside the dictionary');
}

// the Slow-Moving tab: never publish it empty, and never let a row claim a priority
// that its own idle-day count does not support
{
  {
    // Container Details. The guards that matter here are the two things that would
    // mislead a picker: a container reported Received while some of its supplier
    // orders are still open, and a manifest whose totals do not add up to the
    // container row above it.
    const cdj = rd('CONTAINER_DETAILS.json');
    const rows = cdj.r || [];
    chk('CONTAINER_DETAILS has containers', Array.isArray(rows) && rows.length >= 20,
      rows.length + ' containers');
    chk('  every container carries a manifest',
      rows.every(r => Array.isArray(r.it) && r.it.length > 0),
      'a container with no lines is a join that lost its rows');
    chk('  status agrees with the order counts',
      rows.every(r =>
        (r.st === 'Received'      && r.op === 0 && r.ar > 0) ||
        (r.st === 'Upcoming'      && r.ar === 0 && r.op > 0) ||
        (r.st === 'Part received' && r.ar > 0  && r.op > 0)),
      'Received with an open order would put stock on the shelf that is still at sea');
    chk('  manifest totals match the container row',
      rows.every(r => r.k === r.it.length &&
        r.q === r.it.reduce((n, i) => n + i.q, 0) &&
        r.c === r.it.reduce((n, i) => n + i.c, 0)),
      'the summary and the detail must not disagree');
    chk('  no duplicate container name',
      new Set(rows.map(r => r.n)).size === rows.length);
    chk('  no duplicate SKU within a container',
      rows.every(r => new Set(r.it.map(i => i.s)).size === r.it.length),
      'lines of the same SKU are summed, not repeated');
  }

  const sm = rd('SLOW_MOVING.json');
  chk('SLOW_MOVING has rows', Array.isArray(sm.r) && sm.r.length >= 1000,
      (sm.r || []).length + ' rows');
  const band = d => d > 365 ? 3 : d > 180 ? 2 : d > 90 ? 1 : 0;
  const wrong = (sm.r || []).filter(r => band(r.dy) !== r.pr);
  chk('every priority matches its idle days', wrong.length === 0,
      wrong.length + ' rows disagree, e.g. ' + JSON.stringify((wrong[0] || {}).s));
  // zero-stock rows are kept and FLAGGED, never dropped — but the flag must be truthful
  chk('the zero-stock flag matches the quantity',
      (sm.r || []).every(r => (r.z === 1) === !(r.q > 0)),
      (sm.r || []).filter(r => (r.z === 1) !== !(r.q > 0)).length + ' rows disagree');
  chk('rows that hold stock are present',
      (sm.r || []).some(r => !r.z), (sm.r || []).filter(r => !r.z).length + ' actionable rows');
  chk('a dormant entry (no stock AND never sold) is excluded',
      (sm.r || []).every(r => r.z !== 1 || r.d !== 0));
  chk('no duplicate SKU in SLOW_MOVING',
      new Set((sm.r || []).map(r => r.s)).size === (sm.r || []).length);
  // the three movement sources and the status rule are load-bearing: omitting the combo
  // source once put 1,259 actively-selling SKUs on this report as "slow"
  const smSrc = fs.readFileSync(path.join(ROOT, 'sql', 'refresh', 'extract', 'slow-moving.js'), 'utf8');
  chk('movement reads direct sales', /order_management\.order_item_info/.test(smSrc));
  chk('movement reads combo usage',  /order_management\.order_combo/.test(smSrc));
  chk('movement credits ad-hoc combo components', /LIKE '%\+%'/.test(smSrc));
  chk('cancelled and deleted orders are excluded',
      /status NOT IN \('Cancelled','Deleted'\)/.test(smSrc));
  chk('refunded orders are still counted as movement', !/'Refunded'/.test(smSrc));

  chk('sorted: actionable stock first, then Critical, then longest idle',
      (sm.r || []).every((r, i, a) => { if (i === 0) return true; const p = a[i-1];
        return p.z < r.z || (p.z === r.z && (p.pr > r.pr ||
          (p.pr === r.pr && p.dy >= r.dy))); }));
}

// Pending Dispatch: the open-order queue must stay small and current. A jump into the
// hundreds of thousands means the shipped-flag trap has been walked into again.
{
  const pd = rd('PENDING_DISPATCH.json');
  chk('PENDING_DISPATCH has rows', Array.isArray(pd.r) && pd.r.length > 0,
      (pd.r || []).length + ' open orders');
  chk('the open queue is a queue, not the whole order history',
      (pd.r || []).length < 20000, (pd.r || []).length + ' rows');
  chk('every row carries an order id and an age',
      (pd.r || []).every(r => r.o && typeof r.dy === 'number' && r.dy >= 0));
  chk('the SLA flag matches the age', (pd.r || []).every(r => (r.b === 1) === (r.dy > pd.sla)),
      'SLA = ' + pd.sla + ' days');
  chk('sorted longest-waiting first',
      (pd.r || []).every((r, i, a) => i === 0 || a[i-1].dy >= r.dy));
  chk('no duplicate order id', new Set((pd.r || []).map(r => r.o)).size === (pd.r || []).length);
}

// duplicates across every array
{
  const seen = new Set();
  ARRAYS.forEach(([n]) => rd('array_' + n + '.json').forEach(r => {
    if (seen.has(r.s)) dupes.push(r.s); else seen.add(r.s);
  }));
  chk('no duplicate SKUs', dupes.length === 0, dupes.slice(0, 5).join(', '));
  sections = meta.sections;
}

if (fail.length){
  log('VALIDATION FAILED — nothing published');
  fail.forEach(f => log('   *** ' + f));
  fs.unlinkSync(TMP);
  process.exit(1);
}
log('validation        : all guards passed · ' + rendered.toLocaleString() + ' rows rendered');

if (DRY){ log('--dry: temp kept at ' + TMP + ', dashboard untouched'); process.exit(0); }

// ---- 5. back up, then swap atomically ---------------------------------------
fs.copyFileSync(FILE, BAK);
fs.renameSync(TMP, FILE);
log('published         : backup at ' + path.basename(BAK));

// ---- 6. post-apply verification, with automatic rollback --------------------
try {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'validation', 'smoke-render.js')],
                           { encoding: 'utf8' });
  const m = /total rows rendered\s*:\s*([\d,]+)/.exec(out);
  const n = m ? Number(m[1].replace(/,/g, '')) : 0;
  if (n < FLOOR_ROWS || !/sections rendering the wrong count : 0/.test(out))
    throw new Error('post-apply smoke render reported ' + n + ' rows');
  log('post-apply check  : OK · ' + n.toLocaleString() + ' rows');
  console.log(JSON.stringify({ ok: true, rows: n, bytes: fs.statSync(FILE).size,
    before, after: src.length, stamp, sections, added: meta.added, unplaced: meta.unplaced.length }));
} catch (e){
  fs.copyFileSync(BAK, FILE);
  log('ROLLED BACK — ' + String(e.message).split('\n')[0]);
  process.exit(1);
}
