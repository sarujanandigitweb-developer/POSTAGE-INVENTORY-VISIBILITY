'use strict';
// RESPONSIVE LAYOUT — header, tab bodies and pager. The header was written for a wide window only — .vtabs carries
// margin-left:auto and .alerts margin-left:8px, so the moment .hbar wrapped, the tabs sat
// on their own line pushed right while the rest stayed left, with a divider stranded
// between two rows. The page had no media query at all. This checks the rules that fix
// that are present and that each one actually overrides the desktop rule it needs to.
// Read-only, CSS-only — it asserts the cascade, it does not lay the page out.
const fs=require('fs'), path=require('path');
const ROOT=path.resolve(__dirname,'..');
const html=fs.readFileSync(process.env.DASHBOARD||path.join(ROOT,'dashboard','inventory-dashboard.html'),'utf8');
const css=(/<style>([\s\S]*?)<\/style>/.exec(html)||['',''])[1];

const fail=[];
const chk=(n,ok,note)=>{console.log('  '+(ok?'OK  ':'*** ')+n+(note!==undefined?'  — '+note:''));
  if(!ok)fail.push(n);};

// pull each media block out so rules can be checked inside the right one
// There can be MORE THAN ONE block at a width — the header and the tab bodies each have
// their own — so they are concatenated, not overwritten. Keying by width and assigning
// silently dropped the header's 720px rules.
const blocks={};
css.replace(/@media \(max-width: (\d+)px\)\{([\s\S]*?)\n\}/g,(m,w,body)=>{
  blocks[w]=(blocks[w]||'')+'\n'+body; return m;});
const widths=Object.keys(blocks).map(Number).sort((a,b)=>b-a);

chk('the page has media queries at all',widths.length>0,widths.join('px, ')+'px');
// the header needs ~1476px for one row, so the first breakpoint must be at or above it
chk('the first breakpoint is above the width one row actually needs',
  widths.some(w=>w>=1450&&w<=1700),
  'title 276 + tabs 674 + alerts 220 + actions 212 + gaps = ~1476px');

const wide=String(widths.find(w=>w>=1400)||'');
const b=blocks[wide]||'';
// The two-row header is now the BASE layout, not something that kicks in at a
// breakpoint. Left to wrap on its own above 1500px, Export CSV and Dark mode
// dropped to a second row where nothing right-aligns them and sat orphaned at
// the left — the arrangement depended on how much happened to fit.
chk('the header is two deliberate rows at every width',
  /\.hleft\{flex:0 1 auto/.test(css) &&
  /\.hbreak\{display:block;flex-basis:100%;height:0/.test(css) && /class="hbreak"/.test(html),
  'title + tabs, then pill + alerts + actions');
chk('  and no breakpoint re-declares the break',
  !/\.hbreak\{display/.test(b), 'it would be dead weight, or worse, a conflict');
chk('  the tabs can still scroll if the strip is tight',/\.vtabs\{[^}]*overflow-x:auto/.test(b));
// The tab strip used to be pinned right by margin-left:auto and then stretched to
// width:100% below a fixed 1060px, which read as a mostly-empty bar. It now sits
// beside the title and simply wraps when it no longer fits — and because the
// density scale shrinks both, that point moved from ~1060px down to ~950px.
// Auto margins cannot centre this row: they split the free space evenly, but the
// sides are not even (title ~352px vs alerts+buttons ~470px), so the strip settles
// half that difference off centre. Equal-width side groups is what centres it, and
// that needs the right-hand pair to be ONE item — hence the .hright wrapper — plus
// a spacer standing in for it on the narrower rows where it sits below.
chk('  the strip is centred by equal side groups, not by auto margins',
  /\.vtabs\{[^}]*flex:0 0 auto/.test(css) &&
  !/\.vtabs\{[^}]*margin:0 auto/.test(css),
  'auto margins would sit it half the side difference off centre');
chk('    the buttons are that side group, and hold the top-right corner',
  /\.hdr-actions\{[^}]*flex:1 1 0;min-width:max-content;justify-content:flex-end/.test(css));
chk('    and a spacer balances the rows where that pair sits below',
  /class="hspace"/.test(html) && /\.hspace\{flex:1 1 0/.test(css) &&
  /\.hleft\{flex:1 1 0;min-width:max-content\}/.test(css),
  'min-width:max-content stops the title being squeezed to make room');
chk('    the spacer only appears when the buttons are NOT on row one',
  /\.hspace\{flex:1 1 0;min-width:0;display:none\}/.test(css) &&
  /@media \(max-width: 1100px\)\{[\s\S]*?\.hspace\{display:block\}/.test(css),
  'two growing side groups plus a spacer would pull the strip off centre');
chk('  and it hugs its buttons rather than stretching to the full width',
  !/\.vtabs\{[^}]*[;{]width:100%/.test(css) && /\.vtabs\{[^}]*max-width:100%/.test(css),
  'a stretched strip is mostly empty bar');
chk('  no breakpoint forces the title to claim a whole row',
  !/\.hleft\{flex:1 1 100%\}/.test(css), 'plain flex-wrap decides, so it tracks the scale');
// Export CSV and Dark mode hold the top-right corner; the stock alerts sit under
// them on row two. Below 1280px there is no room for the buttons on row one, so
// they drop to row two WITH the alerts — wrapping alone would strand the timestamp
// on a third row, because the flex break sits between them.
chk('  the buttons sit on row one and the notifications under them',
  /class="hdr-actions"[\s\S]{0,900}class="hbreak"[\s\S]{0,400}class="alerts"/.test(html),
  'markup order carries it, so no reordering is needed at the common widths');
// The first threshold here was 1280px, from a width model that over-estimated the
// title, the strip and the buttons — so it fired with a quarter of the row spare
// and dropped the buttons on a 1920 screen at 150% scaling. Re-measured off the
// rendered page: 1030px needed of 1256px available at 1280 CSS px.
chk('    and below 1100px they drop to row two together, not onto a third row',
  /@media \(max-width: 1100px\)\{[\s\S]*?\.hdr-actions\{[^}]*order:6\}[\s\S]*?\.hbreak\{order:3\}/.test(css),
  'measured: 226px of slack at 1280px, 75px at 1100px, negative by 980px');
chk('  the divider between rows is gone',/\.hsep\{display:none\}/.test(css),
  'a vertical rule between two wrapped rows separates nothing');
// The push sits on .alerts, the FIRST of the pair, so the alerts and the action
// buttons collect into one group in the right-hand corner — and still land right
// rather than orphaning left if that pair ever wraps to a row of its own.
chk('  the notifications hold the right corner of their own row',
  /\.alerts\{[^}]*margin-left:auto/.test(css) &&
  !/\.hdr-actions\{[^}]*margin-left:auto/.test(css),
  'one auto margin — a second would split the gap and strand them mid-row');
chk('    and the wrapper it replaced is gone, not left as dead CSS',
  !/class="hright"/.test(html) && !/\.hright\{/.test(css));

const mid=String(widths.find(w=>w>=600&&w<1000)||'');
if(mid){
  const m=blocks[mid];
  chk('at '+mid+'px the title and chrome shrink',/h1\{font-size/.test(m)&&/header\{padding/.test(m));
  chk('  the action buttons become icon-only',/\.hbtn span\{display:none\}/.test(m));
  // the labels must survive for anyone who cannot see the icon
  chk('  but each still names itself for a screen reader',
    /id="csv"[^>]*title="[^"]+"/.test(html) &&
    /id="theme"[^>]*aria-label="[^"]+"/.test(html),
    'title on Export CSV, aria-label on the theme toggle');
}
const small=String(widths.find(w=>w<600)||'');
if(small){
  chk('at '+small+'px the stock alerts get their own row',
    /\.alerts\{[^}]*width:100%/.test(blocks[small]));
}
chk('no media query touches the data tables',
  !Object.values(blocks).some(x=>/\.fxtab|\.pdtab|\.smtab|\.pgtab/.test(x)),
  'the header only — table widths are handled by their own min-width and scroll box');

// ---- the tab bodies ---------------------------------------------------------
console.log('');
// Find it by what it CONTAINS, not by width range. A header-only block was added at
// 1280px, and a range search picked that up instead of the tab-bodies one — the same
// trap the tab-drop lookup below already had to avoid.
// (and bound the width too: the 720px block carries the same padding rule, and
// integer-like object keys enumerate in ascending numeric order, so an unbounded
// find returns 720 rather than the mid-width block meant here)
const mid1 = String(Object.keys(blocks).find(w =>
  +w >= 1000 && +w < 1500 && /\.fxwrap,\.smwrap,\.pdwrap\{padding:/.test(blocks[w])) || '');
if (mid1){
  const m = blocks[mid1];
  chk('at '+mid1+'px the sections lose their wide padding',
    /\.fxwrap,\.smwrap,\.pdwrap\{padding:/.test(m), 'height goes back to the table');
  // Search and filters share one row for as long as they fit. They used to be
  // forced apart here, which cost a whole row on windows with room to spare.
  chk('  search and filters are NOT forced onto separate rows yet',
    !/\.fxsearch,\.smwrap \.fxsearch\{flex:1 1 100%/.test(m), 'they share a line until 720px');
  chk('  the coverage strip scrolls sideways instead of stacking tall',
    /\.fxcov\{[^}]*overflow-x:auto/.test(m) && /\.fxtiles\{[^}]*flex-wrap:nowrap/.test(m));
  // .fxtiles inherits flex:1;min-width:0 from its base rule. Left alone it shrinks
  // to a sliver while its flex:none tiles carry on at full width and paint OUTSIDE
  // it, over the Total SKUs panel — the scrollbar on .fxcov never sees the overflow.
  chk('  and the tiles overflow the scroll box, not the panel beside them',
    /\.fxtiles\{[^}]*flex:none/.test(m), 'otherwise the tiles overlap Total SKUs');
  chk('  the pager sits on its own row rather than pushed right',
    /\.fxpagebar\{margin-left:0;width:100%/.test(m));
  // both pagers, not just the Fixed Price one. The Inventory pager (.pbar/.pctl/
  // .pbtn) originally had no responsive rules at all, and .fxpagebar select was
  // left out of the .fxtools shrink rule, so both stayed desktop-sized everywhere.
  chk('  the rows-per-page box may still lose its width floor',
    /\.fxpagebar select\{[^}]*min-width:0/.test(m));
}
const small2 = String(widths.find(w=>w<800)||'');
if (small2){
  const m = blocks[small2];
  chk('at '+small2+'px the size selects keep a usable width floor',
    /\.pctl select\{min-width:60px\}/.test(m));
  chk('  the section lead line is dropped',/\.fxlead\{display:none\}/.test(m),
    'the heading already names the tab');
  chk('  and NOW search and filters stack, where they genuinely cannot share a row',
    /\.fxsearch,\.smwrap \.fxsearch\{flex:1 1 100%/.test(m) &&
    /\.fxright\{margin-left:0;flex:1 1 100%/.test(m));
}

// ---- the small-screen tab menu, alerts and coverage card ---------------------
{
  const m = blocks[String(widths.find(w=>w>=600&&w<1000)||'')] || '';
  chk('the tab strip is replaced by a menu on a small screen',
    /\.vtabs\{display:none\}/.test(m) && /\.vmenu\{display:block/.test(m),
    'five tabs cannot fit; a menu is honest where a scrolling strip is fiddly');
  chk('  the menu sits in the top-right corner, on the title row',
    /\.vmenu\{display:block;margin-left:auto\}/.test(m) && /\.hleft\{flex:1 1 auto/.test(m),
    'rather than taking a row of its own below the title');
  chk('  its dropdown opens right-aligned so it stays inside the window',
    /\.vmlist\{left:auto;right:0\}/.test(m));
  chk('  the menu lists every tab',
    ['inv','postage','fx','sm','pd'].every(v=>new RegExp('data-go="'+v+'"').test(html)),
    '5 items');
  chk('  and it drives the same setView the tabs do',
    /setView\(b\.getAttribute\('data-go'\)\)/.test(html), 'it cannot drift out of step');
  chk('  it marks the current tab',/aria-current/.test(html));
  chk('the stock alerts keep their number and drop the words',
    /\.alrt-w\{display:none\}/.test(m) &&
    /<span class="alrt-n">' \+ n \+ '<\/span>/.test(html),
    '"62 out of stock" becomes "62"');
  chk('the price-coverage card is hidden, not squeezed',
    /\.fxcov\{display:none\}/.test(m), 'the table matters more at that width');
}

// ---- the pager adapts in JS, not just CSS ------------------------------------
chk('the pager measures the window before listing pages',
  /function fxPagerRoom\(\)/.test(html) && /window\.innerWidth/.test(html));
chk('  and fxPageList honours that budget',
  /const room = fxPagerRoom\(\);/.test(html) &&
  /if \(room === 0\) return \[\];/.test(html) &&
  /if \(room <= 3\) return \[cur\];/.test(html),
  '0 -> arrows only, 3 -> current page, 5 -> first/current/last, 7 -> full');
chk('  the page count is always spelled out beside it',
  /Page ' \+ cur\.toLocaleString\(\) \+ ' of '/.test(html),
  'so "arrows only" still tells you where you are');


// ---- the density scale ------------------------------------------------------
{
  // Sizes used to be fixed px with a handful of stepped media overrides, so a
  // laptop got desktop-sized chrome and only a couple of rows survived. They are
  // now clamp() variables driven by BOTH vw and vh, interpolating continuously.
  const root = /:root\{([\s\S]*?)\n\}/.exec(css)[1];
  for (const v of ['fs','fs-sm','fs-h1','py','hpx','cpy','cpx','thr'])
    chk('--' + v + ' is a viewport-driven clamp',
      new RegExp('--' + v + ':\\s*clamp\\([^;]*v[wh]').test(root),
      'a fixed px value here would stop the page scaling');

  const uses = [
    ['the page title',     /h1\{font-size:var\(--fs-h1\)/],
    ['the tab buttons',    /\.vtab\{[\s\S]{0,140}?font-size:var\(--fs\)/],
    ['the header band',    /header\{[^}]*padding:var\(--py\) var\(--hpx\)/],
    ['the category bar',   /\.catbar\{[^}]*padding:var\(--py\) var\(--hpx\)/],
    ['the search box',     /\.fxsearch input\{[^}]*padding:var\(--cpy\)/],
    ['the filter selects', /\.fxtools select\{padding:var\(--cpy\)[^}]*font-size:var\(--fs-sm\)/],
    ['the table header',   /thead th\{[^}]*font-size:var\(--fs-sm\)/],
    ['the table rows',     /th,td\{[^}]*padding:var\(--cpy\) var\(--cpx\)/],
    ['both pagers',        /\.fxpg\{min-width:calc\(var\(--thr\)/],
  ];
  for (const [what, re] of uses) chk(what + ' is on the scale', re.test(css));

  // the Inventory header sticks in three rows; the offsets must come from the
  // same variable as the row height or they drift apart as the density changes
  chk('the sticky header offsets are derived from the row height, not hardcoded',
    /thead tr:nth-child\(2\) th\{top:var\(--thr\)/.test(css) &&
    /thead tr:nth-child\(3\) th\{top:calc\(var\(--thr\) \* 2\)/.test(css) &&
    /\.scroll table thead th\{height:var\(--thr\)/.test(css),
    'a 30px/60px guess would show the table scrolling behind the header');
}

console.log('\n'+(fail.length?'*** '+fail.length+' CHECK(S) FAILED':'ALL CHECKS PASSED'));
process.exit(fail.length?1:0);
