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
                'WH5_STOCK', 'LAST_CONTAINER', 'RECEIVED', 'INCOMING'];

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
