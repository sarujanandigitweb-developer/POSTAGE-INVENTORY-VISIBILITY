'use strict';
// Replaces the hardcoded "Extracted 2026-08-20" header tag with a stamp the refresh
// owns and rewrites on every run.
//
// It also SHOWS ITS AGE. A cron job that stops is otherwise invisible: the page keeps
// serving yesterday's numbers with a confident-looking date. Past three hours the tag
// turns amber, past eight it turns red and says so, so a stalled refresh is visible on
// the screen rather than only in a log nobody reads.
//
//   node sql/apply-freshness-tag.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'dashboard', 'inventory-dashboard.html');
let src = fs.readFileSync(FILE, 'utf8');
const orig = src.length;
if (src.indexOf('DATA_AS_OF') >= 0){
  console.error('the freshness tag is already applied - nothing to do.');
  process.exit(1);
}
function sub(a, b, what){
  if (src.indexOf(a) < 0) throw new Error('anchor not found: ' + what);
  src = src.replace(a, b);
}

sub('        <span class="tag">Extracted 2026-08-20</span>',
    '        <span class="tag" id="freshTag" title="">Data as of …</span>');

sub('.tag{background:var(--accent-soft);color:var(--accent);border-radius:999px;padding:2px 9px;font-weight:600;font-size:11.5px}',
    '.tag{background:var(--accent-soft);color:var(--accent);border-radius:999px;padding:2px 9px;font-weight:600;font-size:11.5px}\n' +
    '.tag.stale{background:var(--warn-bg);color:var(--warn)}\n' +
    '.tag.dead{background:var(--neg-bg,#fdecec);color:var(--neg)}');

// the stamp itself — one line, rewritten by every refresh
sub('const CATS = {',
`// ---- when this data was last pulled from LEDSone ---------------------------
// REWRITTEN BY EVERY REFRESH. sql/refresh/apply.js replaces this one line, and
// nothing else in the file carries a date, so there is a single source of truth for
// how old the numbers are.
const DATA_AS_OF = '2026-08-27T12:00:00Z';
const REFRESH_EVERY_HOURS = 2;

const CATS = {`, 'DATA_AS_OF');

// render it, with its age
sub("$('q').addEventListener('input',",
`// The tag says how old the data is, not just when it was taken: "2 hours ago" is the
// number a reader can act on. Amber past 3 hours, red past 8 — a stopped cron must be
// visible on the page, not only in a log.
function renderFreshness(){
  const el = $('freshTag');
  if (!el) return;
  const t = Date.parse(DATA_AS_OF);
  if (isNaN(t)){ el.textContent = 'Data date unknown'; el.className = 'tag dead'; return; }
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  const age = mins < 60 ? mins + ' min ago'
            : mins < 60 * 48 ? Math.round(mins / 60) + ' hr ago'
            : Math.round(mins / 1440) + ' days ago';
  const d = new Date(t);
  const stamp = d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  const late = mins > REFRESH_EVERY_HOURS * 60 * 4;      // 8 hours
  const slow = mins > REFRESH_EVERY_HOURS * 60 * 1.5;    // 3 hours
  el.textContent = 'Data as of ' + age + (late ? ' \\u2014 refresh may have stopped' : '');
  el.className = 'tag' + (late ? ' dead' : slow ? ' stale' : '');
  el.title = 'Pulled from LEDSone at ' + stamp + '. Refreshes every ' +
             REFRESH_EVERY_HOURS + ' hours.' +
             (late ? ' It is now ' + age + ' old, so the scheduled refresh has probably failed.' : '');
}
renderFreshness();
if (typeof setInterval === 'function') setInterval(renderFreshness, 60000);

$('q').addEventListener('input',`, 'renderFreshness');

fs.writeFileSync(FILE, src);
console.log('inventory-dashboard.html', orig, '->', src.length, 'chars  (+' + (src.length - orig) + ')');
