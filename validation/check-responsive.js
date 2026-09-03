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
// The spacer stands in for the buttons as the strip's right-hand counterweight, so
// it must appear in exactly the block that moves them down — never a breakpoint of
// its own. Pinning a literal width here broke the moment that threshold moved.
{
  const swap = Object.keys(blocks).find(w => /\.hdr-actions\{[^}]*order:6\}/.test(blocks[w]));
  chk('    the spacer only appears when the buttons are NOT on row one',
    /\.hspace\{flex:1 1 0;min-width:0;display:none\}/.test(css) &&
    !!swap && /\.hspace\{display:block\}/.test(blocks[swap]),
    swap ? 'both at ' + swap + 'px — two growers plus a spacer would pull the strip off centre'
         : '*** the spacer and the buttons have drifted apart');
}
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
// The header must be TWO rows at every width. The threshold has to sit where the
// buttons actually stop fitting beside the title and the strip — measured at ~1300px,
// so the swap is at 1350px. It was 1100px, from figures taken before the density
// scale settled, and between 1100 and 1300 the buttons wrapped into a third row on
// their own: tight under the strip, timestamp stranded below.
{
  const swap = Object.keys(blocks).find(w => /\.hdr-actions\{[^}]*order:6\}/.test(blocks[w]));
  chk('    and they drop to row two together, not onto a third row',
    !!swap && /\.hbreak\{order:3\}/.test(blocks[swap]) && +swap >= 1320,
    swap ? 'at ' + swap + 'px — title 283 + strip 695 + buttons 230 needs 1251 of 1324'
         : '*** nothing moves the buttons down with the notifications');
}
chk('  the divider between rows is gone',/\.hsep\{display:none\}/.test(css),
  'a vertical rule between two wrapped rows separates nothing');
// The push sits on .alerts, the FIRST of the pair, so the alerts and the action
// buttons collect into one group in the right-hand corner — and still land right
// rather than orphaning left if that pair ever wraps to a row of its own.
// One auto margin at a time. Two active together split the free space and strand
// the pair mid-row. A `body:not(.tab-inv)` rule is exempt: it applies only when the
// alerts are hidden, so it can never be active alongside theirs.
chk('  the notifications hold the right corner of their own row',
  /\.alerts\{[^}]*margin-left:auto/.test(css) &&
  ![...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(^|\n)\s*([^\n{}]+)\{([^}]*)\}/g)]
    .some(m => /(^|[\s,])\.hdr-actions\s*$/.test(m[2].split(',').pop()) &&
               /margin-left:auto/.test(m[3]) &&
               !/tab-inv/.test(m[2])),
  'one auto margin — a second would split the gap and strand them mid-row');
chk('    and the wrapper it replaced is gone, not left as dead CSS',
  !/class="hright"/.test(html) && !/\.hright\{/.test(css));

// By content, not by position: this took the first media query in a range, so any new
// block landing in that range (the Orders regroup put one at 990px) accused the page.
const mid=String(Object.keys(blocks).find(w=>+w>=600&&+w<1000&&
  /h1\{font-size/.test(blocks[w])&&/header\{padding/.test(blocks[w]))||'');
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
// Look for the rule, not for a position. This used to take the FIRST media query
// under 600px and assume it was the header's — so adding any unrelated small-screen
// block ahead of it (the Orders sub-strip did exactly that) failed a page that was fine.
const smalls=widths.filter(w=>w<600);
if(smalls.length){
  const at=smalls.find(w=>/\.alerts\{[^}]*width:100%/.test(blocks[String(w)]));
  chk('the stock alerts get their own row on a small screen',!!at,
    at?'at '+at+'px (of '+smalls.join('px, ')+'px)':
       '*** none of '+smalls.join('px, ')+'px gives .alerts its own row');
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
  // The six marketplaces are one band read left to right. Wrapping put Temu alone
  // on a second line, reading as a different thing rather than the sixth of six.
  // The rule is now on the BASE, not this breakpoint, so it holds at every width.
  chk('  the coverage strip is one line at every width',
    /\.fxcov\{[^}]*flex-wrap:nowrap[^}]*overflow-x:auto/.test(css) &&
    /\.fxtiles\{[^}]*flex-wrap:nowrap/.test(css));
  chk('    and the caption that repeated the label is gone',
    /\.fxtot \.cap\{display:none\}/.test(css),
    'it cost 170px — enough on its own to push the sixth marketplace down');
  // .fxtiles inherits flex:1;min-width:0 from its base rule. Left alone it shrinks
  // to a sliver while its flex:none tiles carry on at full width and paint OUTSIDE
  // it, over the Total SKUs panel — the scrollbar on .fxcov never sees the overflow.
  // The original bug: .fxtiles had min-width:0, so it shrank below its own content
  // while the tiles kept full size and printed over the Total SKUs panel. The floor
  // that prevents that is min-width:min-content — it may grow to fill the card, but
  // it can never be narrower than what it holds, so overflow lands on .fxcov where
  // the scrollbar is.
  chk('  and the tiles overflow the scroll box, not the panel beside them',
    /\.fxtiles\{[^}]*min-width:min-content/.test(css) &&
    !/\.fxtiles\{[^}]*min-width:0/.test(css),
    'otherwise the tiles overlap Total SKUs');
  chk('    while still filling the card rather than packing left',
    /\.fxtiles\{[^}]*flex:1 1 auto/.test(css) && /\.fxtile\{[^}]*flex:1 1 104px/.test(css));
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
  // Find it by what it CONTAINS. A range search broke the moment the swap moved
  // from 720px to 1040px — and the swap MUST sit where the strip stops fitting
  // beside the title (~1010px measured), not at a round number.
  const menuW = Object.keys(blocks).find(w => /\.vtabs\{display:none\}/.test(blocks[w]));
  const m = menuW ? blocks[menuW] : '';
  // The strip is as wide as the labels in it, so DERIVE that rather than freeze a
  // number. The old constant (>=1010, from a 695px six-tab strip) outlived two
  // relabellings: it wrongly passed a seven-tab strip and then wrongly failed a
  // six-tab one. Calibrated against the recorded measurement — the same labels that
  // measured ~695px come out at ~719px here, so the model runs slightly wide, which
  // is the safe direction for a threshold.
  const labels=[...html.matchAll(/<button[^>]*class="vtab"[^>]*>([^<]*)</g)].map(x=>x[1].trim());
  const TITLE=283, PER_CH=5.9, TAB_PAD=24, GAP=3, STRIP_PAD=8, TITLE_GAP=14;
  const strip=Math.round(labels.reduce((a,l)=>a+l.length*PER_CH+TAB_PAD+GAP,0)+STRIP_PAD);
  const need=TITLE+strip+TITLE_GAP;
  chk('the tab strip is replaced by a menu before it would claim its own row',
    !!menuW && +menuW >= need,
    menuW ? 'menu at '+menuW+'px; '+labels.length+' tabs ('+labels.join(', ')+
            ') need ~'+need+'px beside the title'
          : '*** no block swaps the strip for the menu');
  chk('  the menu appears there',
    /\.vtabs\{display:none\}/.test(m) && /\.vmenu\{display:block/.test(m),
    'five tabs cannot fit; a menu is honest where a scrolling strip is fiddly');
  chk('  the menu sits in the top-right corner, on the title row',
    /\.vmenu\{display:block;margin-left:auto\}/.test(m) && /\.hleft\{flex:1 1 auto/.test(m),
    'rather than taking a row of its own below the title');
  chk('  its dropdown opens right-aligned so it stays inside the window',
    /\.vmlist\{left:auto;right:0\}/.test(m));
  const VIEWS=[...(/const VIEWS = \[([^\]]*)\]/.exec(html)||['',''])[1]
    .matchAll(/'([a-z]+)'/g)].map(x=>x[1]);
  chk('  the menu lists every tab',
    VIEWS.length>0 && VIEWS.every(v=>new RegExp('data-go="'+v+'"').test(html)),
    VIEWS.length+' views, each with a menu entry — the strip groups some of them, the menu must not lose any');
  chk('  and it drives the same setView the tabs do',
    /setView\(b\.getAttribute\('data-go'\)\)/.test(html), 'it cannot drift out of step');
  chk('  it marks the current tab',/aria-current/.test(html));
  // These two are NOT tied to the menu swap and live in their own blocks — each is
  // found by what it does, so moving one breakpoint cannot silently unhook another.
  chk('the stock alerts keep their number and drop the words',
    Object.values(blocks).some(b => /\.alrt-w\{display:none\}/.test(b)) &&
    /<span class="alrt-n">' \+ n \+ '<\/span>/.test(html),
    '"62 out of stock" becomes "62"');
  chk('the price-coverage card is hidden, not squeezed',
    Object.values(blocks).some(b => /\.fxcov\{display:none\}/.test(b)),
    'the table matters more at that width');
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


console.log('');
// ---- the type scale holds together -----------------------------------------
// .fxh2 was a flat 21px: bigger than the page TITLE at its own maximum (18px), and the
// only text on the page that ignored the window while everything around it scaled.
{
  const clamp = name => {
    const m = new RegExp('--' + name + ':\\s*clamp\\(([\\d.]+)px,\\s*([\\d.]+)vw \\+ ([\\d.]+)vh \\+ ([\\d.]+)px,\\s*([\\d.]+)px\\)').exec(css);
    return m ? { lo:+m[1], vw:+m[2], vh:+m[3], add:+m[4], hi:+m[5] } : null;
  };
  const at = (c,w,h) => Math.max(c.lo, Math.min(c.vw*w/100 + c.vh*h/100 + c.add, c.hi));
  const h1 = clamp('fs-h1'), h2 = clamp('fs-h2');
  chk('section headings use the density scale, not a fixed size',
    !!h2 && /\.fxh2\{[^}]*font-size:var\(--fs-h2\)/.test(css),
    h2 ? 'clamp(' + h2.lo + 'px .. ' + h2.hi + 'px)' : '*** --fs-h2 is not defined');
  if (h1 && h2) {
    const sizes = [[1366,768],[1600,900],[1920,1080],[2560,1440]];
    const bad = sizes.filter(([w,h]) => at(h2,w,h) > at(h1,w,h));
    chk('  a section heading never outgrows the page title',bad.length===0,
      bad.length ? '*** h2 beats h1 at ' + bad.map(s=>s.join('x')).join(', ')
                 : sizes.map(([w,h]) => w + 'x' + h + ': ' + at(h2,w,h).toFixed(1) + ' < ' +
                     at(h1,w,h).toFixed(1)).join('  ·  '));
  }
  // a heading long enough to wrap costs a whole row of height on a narrow window
  // measure what RENDERS: "&amp;" is one character on screen, not five
  const decode = t => t.replace(/&amp;/g,'&').replace(/&mdash;/g,'-').replace(/&ndash;/g,'-')
                       .replace(/&middot;/g,'.').replace(/&hellip;/g,'...').replace(/&nbsp;/g,' ');
  const heads = [...html.matchAll(/<h2 class="fxh2">([^<]*)/g)].map(m => decode(m[1]).trim());
  const longest = heads.reduce((a,b) => b.length > a.length ? b : a, '');
  chk('  no section heading is long enough to wrap',longest.length <= 34,
    heads.length + ' headings, longest "' + longest + '" at ' + longest.length + ' chars');
}

console.log('\n'+(fail.length?'*** '+fail.length+' CHECK(S) FAILED':'ALL CHECKS PASSED'));
process.exit(fail.length?1:0);
