#!/usr/bin/env node
/* The Container Details tab: is it wired, and does it tell the truth?
 *
 * The one thing that would actively mislead a picker is a container reported
 * Received while some of its supplier orders are still open — `status_arrived`
 * sits on the ORDER, and seven containers currently hold a mix of arrived and
 * not-arrived orders. */
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../dashboard/inventory-dashboard.html', 'utf8');
const css = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
const js = html.slice(html.lastIndexOf('<script>'));

const fail = [];
const chk = (name, ok, note) => {
  console.log((ok ? '  OK  ' : '  *** ') + name + (note ? '  — ' + note : ''));
  if (!ok) fail.push(name);
};

// ---- wired like every other tab -------------------------------------------
chk('the tab button exists', /data-view="cd"/.test(html));
chk('  and the small-screen menu lists it', /data-go="cd"/.test(html));
chk('  the view is registered', /const VIEWS = \[[^\]]*'cd'\]/.test(js));
chk('  setView shows and hides the panel', /\$\('cdwrap'\)\.hidden\s*=\s*!cont/.test(js));
chk('  and marks the tab selected', /\$\('vcd'\)\.setAttribute\('aria-selected'/.test(js));
chk('  the panel is built on first sight, not at load',
  /if \(cont && !cd\.built\) cdRender\(\)/.test(js),
  '4,000 manifest lines should cost nothing until the tab is opened');

// ---- the data block --------------------------------------------------------
const m = /const CONTAINER_DETAILS = (\{[\s\S]*?\});\n/.exec(js);
chk('the data block is present and parses', !!m);
let data = null;
if (m) { try { data = JSON.parse(m[1]); } catch (e) { chk('  it parses as JSON', false, e.message); } }

if (data && Array.isArray(data.r) && data.r.length) {
  const rows = data.r;
  chk('containers are present', rows.length >= 20, rows.length + ' containers');
  chk('  every container carries a manifest',
    rows.every(r => Array.isArray(r.it) && r.it.length > 0));
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
  chk('  no duplicate container, and no duplicate SKU within one',
    new Set(rows.map(r => r.n)).size === rows.length &&
    rows.every(r => new Set(r.it.map(i => i.s)).size === r.it.length));
  chk('  quantities are real numbers, not blanks read as free',
    rows.every(r => Number.isFinite(r.q) && Number.isFinite(r.c) && Number.isFinite(r.v)));
  const mixed = rows.filter(r => r.st === 'Part received').length;
  chk('  part-received containers are labelled as such', mixed > 0,
    mixed + ' container(s) hold both arrived and open orders');
} else {
  chk('containers are present', false, 'the block is empty — run the refresh');
}

// ---- the stock alerts belong to Inventory only -----------------------------
// They count the ACTIVE INVENTORY CATEGORY — "62 out of stock" is Ceiling Rose, not
// the catalogue. On any other tab that is a number about something the reader is not
// looking at.
chk('the stock alerts show only on the Inventory tab',
  /body:not\(\.tab-inv\) \.alerts\{display:none\}/.test(css) &&
  /classList\.toggle\('tab-inv', inv\)/.test(js));
chk('  and the buttons keep their right-hand push without them',
  /body:not\(\.tab-inv\) \.hdr-actions\{margin-left:auto\}/.test(css),
  'below 1100px it is .alerts that carries the auto margin for the pair');

// ---- the honest gap --------------------------------------------------------
chk('the missing goods-receipt date is stated on screen',
  /no goods-receipt date exists in the database/.test(js),
  'arrival is a boolean; the Ordered date must not be read as an arrival date');

// ---- styling reuses the shared table, not a private copy -------------------
chk('the table reuses .fxtab rather than restating cell rules',
  /class="fxtab cdtab"/.test(html) && !/table\.cdtab (th|td)\{padding/.test(css));

// .fxtab is table-layout:fixed, so a colgroup is not decoration — without it the
// columns collapse and a container name renders one word-fragment per line. And a
// min-width smaller than the columns' own sum crushes the widest column, which is
// what happened to Item Name on the Slow-Moving tab.
// A class shared between a <table> and a non-table element is a layout killer on
// this page, and it has bitten twice: `.pdlines` on a <span> and a <table>, then
// `.cdtab` on the dialog's tab BUTTONS and the container TABLE. The button rule set
// display:inline-flex, the table stopped being a table, and its columns collapsed to
// one character per line. Selectors for a table class must be qualified with `table`.
{
  const selectors = [...css.matchAll(/(^|\n)\s*([^\n{}@\/][^\n{}]*)\{/g)].map(m => m[2].trim());
  const bare = selectors.filter(sel =>
    sel.split(',').some(s => /^\.(cdtab|cdmtab)(?![\w-])/.test(s.trim())));
  chk('  no table class is styled unqualified',
    bare.length === 0,
    bare.length ? 'these would hit the table itself: ' + bare.join(' | ')
                : 'table.cdtab / table.cdmtab only');
  const shared = [...html.matchAll(/class="([^"]*)"/g)]
    .map(m => m[1].split(/\s+/)).flat()
    .filter(c => c === 'cdtab' || c === 'cdmtab');
  chk('    and those classes sit only on tables',
    [...html.matchAll(/<(\w+)[^>]*class="[^"]*\b(cdtab|cdmtab)\b/g)].every(m => m[1] === 'table'),
    shared.length + ' element(s) carry them');
}

chk('  both tables declare a colgroup',
  /<col class="cc-name">/.test(html) && /<col class="cm-sku">/.test(html));
{
  const w = n => { const m = new RegExp('col\\.' + n + '\\{width:(\\d+)px').exec(css); return m ? +m[1] : null; };
  const cols = { 'cc-name': 1, 'cc-rg': 1, 'cc-st': 1, 'cc-sg': 1, 'cc-n': 4, 'cc-sup': 1, 'cc-d': 2, 'cc-act': 1 };
  let sum = 0, ok = true;
  for (const [k, times] of Object.entries(cols)) {
    const v = w(k);
    if (v === null) { ok = false; break; }
    sum += v * times;
  }
  const declared = (/table\.cdtab\{min-width:(\d+)px\}/.exec(css) || [])[1];
  chk('  and min-width equals the columns\' exact sum',
    ok && declared && +declared === sum,
    ok ? sum + 'px of columns, min-width ' + declared + 'px' : 'a column width is missing');
}
chk('the manifest dialog exists', /id="cdmodal"/.test(html) && /id="cdmbody"/.test(html));

// ---- the detail dialog -----------------------------------------------------
for (const [what, id] of [
  ['a status pill beside the title', 'cdmtitle'],
  ['the summary strip', 'cdmstats'],
  ['a Container Summary tab', 'cdtabSum'],
  ['an Items / Products tab', 'cdtabItems'],
  ['its own pager', 'cdmpager'],
  ['Export CSV', 'cdmcsv'],
  ['Print', 'cdmprint'],
]) chk('  ' + what, new RegExp('id="' + id + '"').test(html));

chk('  every dialog control is wired',
  ["cdmclose2", "cdtabItems", "cdtabSum", "cdmcsv", "cdmprint", "cdmpager"]
    .every(id => new RegExp("\\$\\('" + id + "'\\)\\.addEventListener").test(js)),
  'the Pending Dispatch tab once shipped with a dead button');

chk('  the manifest pages rather than scrolling for ever',
  /function cdmPages\(\)/.test(js) && /cdm\.size/.test(js),
  'one container carries 196 SKUs');
chk('  the manifest has its own search and page size',
  /id="cdmq"/.test(html) && /id="cdmsize"/.test(html) &&
  /\$\('cdmq'\)\.addEventListener/.test(js) && /\$\('cdmsize'\)\.addEventListener/.test(js));
chk('    the search covers SKU, product and supplier',
  /i\.s \+ ' ' \+ \(i\.d \|\| ''\) \+ ' ' \+ \(i\.sp \|\| ''\)/.test(js));
chk('    paging is computed over the FILTERED list',
  /function cdmPages\(\)\{ return Math\.max\(1, Math\.ceil\(cdmItems\(\)\.length/.test(js),
  'paging the unfiltered list would offer pages a search has emptied');
chk('    and the page clamps instead of running off the end',
  /if \(cdm\.page > pages\) cdm\.page = pages;/.test(js));
chk('    opening a container clears the previous search',
  /cdm\.q = '';\n  \$\('cdmq'\)\.value = '';/.test(js),
  'otherwise the next container opens filtered by the last one\'s search');
// A long product name is clamped to two lines. The clamp MUST be on the inner span:
// display:-webkit-box on a <td> takes the cell out of table layout and collapses the
// column — that has already happened once on this page.
chk('    long product names clamp to two lines',
  /\.cdclamp\{[^}]*-webkit-line-clamp:2/.test(css) && /class="cdclamp"/.test(js));
chk('      the clamp is on a span, never the cell',
  // comments must come out first: the prose explaining this rule mentions both
  // `<td>` and `display:-webkit-box`, and a naive match reads that as a violation
  !(() => {
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
    return [...bare.matchAll(/(^|\n)\s*([^\n{}]+)\{([^}]*)\}/g)]
      .some(m => /(^|[\s,>+~])td(\.|:|\[|\s|$)/.test(m[2]) && /display:-webkit-box/.test(m[3]));
  })(),
  'display:-webkit-box on a <td> removes it from table layout');
chk('      and the full name survives in the title attribute',
  /class="cdclamp" title="' \+ esc\(i\.d\)/.test(js),
  'clamped text must still be readable, not lost');

chk('    Export CSV writes what is shown',
  /const body = cdmItems\(\)\.map/.test(js),
  'matching every other Export CSV on this page');

// The mockup for this dialog showed "Arrived on <date>". There is no goods-receipt
// date in this database, so printing one would be inventing a fact a picker would
// act on. The subtitle says Ordered instead, and the summary tab says why.
// The subtitle must read "Ordered <dates>", never an arrival date. Testing for the
// phrase anywhere is too crude — it matches the comment that explains the rule — so
// this checks what is actually rendered, and that the payload carries no such field.
chk('  no arrival date is invented',
  /\$\('cdmsub2'\)\.innerHTML = 'Ordered ' \+ when/.test(js) &&
  (!data || !data.r || !data.r.length || !Object.keys(data.r[0]).some(k => /arriv/i.test(k))),
  'arrival is a boolean flag; only the order date is real');
chk('  and the summary says so in words',
  /No goods-receipt date exists in this database/.test(js));
// The supplier banner was removed from the dialog head — the full list stays on
// the Container Summary tab, where it does not push the manifest down the page.
chk('  suppliers are on the summary tab, not a banner',
  !/id="cdmsup"/.test(html) && /cell\('Suppliers'/.test(js));

if (fail.length) { console.error('\nFAILED:'); fail.forEach(f => console.error('  - ' + f)); process.exit(1); }
console.log('\nALL CHECKS PASSED');
