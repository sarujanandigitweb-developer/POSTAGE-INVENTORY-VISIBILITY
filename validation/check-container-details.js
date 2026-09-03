#!/usr/bin/env node
/* The Container Details tab: is it wired, and does it tell the truth?
 *
 * The one thing that would actively mislead a picker is a container reported
 * Received while some of its supplier orders are still open — `status_arrived`
 * sits on the ORDER, and seven containers currently hold a mix of arrived and
 * not-arrived orders. */
const fs = require('fs');
const html = fs.readFileSync(process.env.DASHBOARD ||
  (__dirname + '/../dashboard/inventory-dashboard.html'), 'utf8');
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
  // Read the composition from the table's OWN colgroup rather than restating it here.
  // Hardcoding it meant that hiding three columns failed this check with "a column
  // width is missing" — which accuses the stylesheet when the truth is that the
  // checker has gone stale.
  const seg = html.slice(html.indexOf('id="cdtab"'));
  const cg = (/<colgroup>([\s\S]*?)<\/colgroup>/.exec(seg) || ['', ''])[1];
  const names = [...cg.matchAll(/class="(cc-[a-z]+)"/g)].map(m => m[1]);
  const missing = names.filter(n => w(n) === null);
  const sum = names.reduce((t, n) => t + (w(n) || 0), 0);
  const ok = names.length > 0 && missing.length === 0;
  const declared = (/table\.cdtab\{min-width:(\d+)px\}/.exec(css) || [])[1];
  chk('  and min-width equals the columns\' exact sum',
    ok && declared && +declared === sum,
    ok ? names.length + ' columns totalling ' + sum + 'px, min-width ' + declared + 'px'
       : (names.length ? 'no width declared for ' + missing.join(', ') : 'no colgroup found'));
  // table-layout:fixed shares leftover width EQUALLY between columns, so the declared
  // total decides how loose the table looks on a wide screen — not any one column's
  // rule. When this fell to 1056px every column gained 82px at 1790px and the action
  // button was left adrift in half an empty cell.
  chk('  the declared total is close enough that a wide screen stays tight',
    ok && sum >= 1200,
    sum + 'px over ' + names.length + ' columns -> +' +
    Math.round((1790 - sum) / Math.max(1, names.length)) + 'px each on a 1790px screen');
}
chk('the manifest dialog exists', /id="cdmodal"/.test(html) && /id="cdmbody"/.test(html));
// ---- the manifest table must agree with itself ------------------------------
// Removing a column touches four places: the colgroup, the header, the row renderer
// and the empty-state colspan. Miss one and the table silently skews by a cell, which
// no amount of reading the markup makes obvious.
{
  const seg = html.slice(html.indexOf('<table class="fxtab cdmtab">'));
  const cg = (/<colgroup>([\s\S]*?)<\/colgroup>/.exec(seg) || ['', ''])[1];
  const hd = (/<thead>([\s\S]*?)<\/thead>/.exec(seg) || ['', ''])[1];
  const cols = [...cg.matchAll(/class="cm-[a-z]+"/g)].length;
  const ths = [...hd.matchAll(/<th[^>]*>/g)].length;
  const i = js.indexOf('cdmRenderItems');
  const start = js.indexOf('<td class="fxsku">', i);
  const rowHtml = js.slice(start, js.indexOf('</tr>', start));
  const tds = (rowHtml.match(/<td/g) || []).length;
  const span = +((/<tr><td colspan="(\d+)">/.exec(js.slice(i)) || [])[1] || 0);
  chk('the manifest colgroup, header, cells and colspan all agree',
    cols > 0 && cols === ths && ths === tds && tds === span,
    cols + ' cols / ' + ths + ' headers / ' + tds + ' cells / colspan ' + span);
  chk('  its min-width matches the columns it now has',
    (function(){
      const w = n => { const m = new RegExp('col\\.' + n + '\\{width:(\\d+)px').exec(css); return m ? +m[1] : 0; };
      const names = [...cg.matchAll(/class="(cm-[a-z]+)"/g)].map(m => m[1]);
      // cm-name is width:auto and contributes its 100px floor, not a fixed width
      const sum = names.reduce((t, n) => t + (n === 'cm-name' ? 100 : w(n)), 0);
      const dec = (/table\.cdmtab\{min-width:(\d+)px\}/.exec(css) || [])[1];
      return dec && +dec === sum;
    })(),
    'a stale min-width leaves the columns compressed under table-layout:fixed');
  chk('  only ONE min-width is declared for it',
    (css.match(/table\.cdmtab\{min-width:/g) || []).length === 1,
    'two rules for one table means the losing one is dead code pretending to be real');
  chk('  CBM is off the manifest view', !/>CBM</.test(hd) && !/i\.v \? i\.v\.toFixed/.test(rowHtml));
  // the export is the safety net for what the view no longer shows, so it must line up
  const eh = (/const head = \['Container',[\s\S]*?\];/.exec(js) || [''])[0];
  const eb = (/const body = cdmItems\(\)\.map\(i => \[([\s\S]*?)\]\.map/.exec(js) || ['', ''])[1];
  const nh = (eh.match(/'[^']*'/g) || []).length, nb = eb.split(',').length;
  chk('  the manifest export still carries CBM, and its header matches its rows',
    /'CBM'/.test(eh) && nh === nb, nh + ' header fields, ' + nb + ' row fields');
}

// ---- the two actions carry colour -------------------------------------------
{
  chk('the Manifest button is not plain chrome',
    /\.cdopen\{[^}]*background:var\(--accent\)/.test(css), 'the primary action on a row');
  chk('the Close button is coloured too',
    /#cdmclose\{[^}]*color:var\(--accent\)/.test(css));
  chk('  both stay legible on the dark theme',
    /data-theme=dark\] \.cdopen\{/.test(css) && /data-theme=dark\] #cdmclose:hover\{/.test(css),
    'the dark accent is a pale blue, so white-on-accent would wash out');
}


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
    // Only the LAST compound in a selector decides what is being styled.
    // "td.foo{-webkit-box}" clamps the CELL and is the bug. "td .foo{-webkit-box}"
    // clamps a SPAN INSIDE the cell and is the fix — the two differ by one space, and
    // testing the selector as a whole condemns both.
    const targetsCell = sel => sel.split(',').some(part => {
      const last = part.trim().split(/[\s>+~]+/).filter(Boolean).pop() || '';
      return /^td(\.|:|\[|$)/.test(last);
    });
    return [...bare.matchAll(/(^|\n)\s*([^\n{}]+)\{([^}]*)\}/g)]
      .some(m => targetsCell(m[2]) && /display:-webkit-box/.test(m[3]));
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
