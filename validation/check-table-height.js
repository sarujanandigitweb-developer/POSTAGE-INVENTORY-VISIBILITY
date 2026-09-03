#!/usr/bin/env node
/* The table must always have real height, and the chrome must not permanently
   own a third of the screen.

   History, so this is not undone by accident:
     1 Sep, morning — the page was locked to the viewport and the table box was
     `flex:1;min-height:0`. When the chrome was taller than the window that
     resolved to 0px and every tab showed a header with no rows under it.
     1 Sep, later — a px floor stopped the collapse but the chrome still cost
     ~220-245px of every screen, permanently. The page now scrolls: each table
     box is a viewport tall, so scrolling past the header, the category bar and
     the search row hands the whole screen to the table. The box still scrolls
     inside itself, which is what keeps its sticky column header working. */
const fs = require('fs');
const F = process.env.DASHBOARD || (__dirname + '/../dashboard/inventory-dashboard.html');
const html = fs.readFileSync(F, 'utf8');
const css = /<style>([\s\S]*?)<\/style>/.exec(html)[1];

const fail = [];
const chk = (name, ok, note) => {
  console.log((ok ? '  OK  ' : '  *** ') + name + (note ? '  — ' + note : ''));
  if (!ok) fail.push(name);
};

// 1. the document scrolls; a fixed 100% height would trap the chrome on screen
chk('the page is free to grow past the viewport',
  /html\{height:100%\}\s*\nbody\{min-height:100%\}/.test(css),
  'html,body{height:100%} pinned the chrome permanently on screen');
chk('  and nothing clips that overflow away',
  !/\nbody\{[^}]*overflow\s*:\s*hidden/.test(css));

// 2. each scroll box is a viewport tall, with a floor for very short windows
for (const [sel, re] of [
  ['.scroll',   /\.scroll\{overflow:auto;flex:none;height:calc\(100vh - (\d+)px\);min-height:(\d+)px\}/],
  ['.fxscroll', /\.fxscroll\{overflow:auto;flex:none;height:calc\(100vh - (\d+)px\);min-height:(\d+)px;/],
]) {
  const m = re.exec(css);
  if (!m) { fail.push(sel + ': not sized to the viewport'); console.log('  *** ' + sel + ' is not a viewport-tall box'); continue; }
  const [, off, floor] = m;
  chk(sel + ' is a viewport-tall box', +floor >= 180,
    'height 100vh - ' + off + 'px (what sits below it), floor ' + floor + 'px');
}

// 3. the panels must not flex any more, or they would fight the box height
for (const sel of ['.wrap', '.fxwrap', '.smwrap'])
  chk('  ' + sel + ' lets the box set the height', 
    new RegExp('\\' + sel + '\\{[^}]*flex:none').test(css) &&
    !new RegExp('\\' + sel + '\\{[^}]*flex:1').test(css));

// 4. the box scrolls INSIDE itself — that is what pins the column header
chk('the sticky column header still has a scrollport to stick to',
  /\.scroll\{overflow:auto/.test(css) && /\.fxscroll\{overflow:auto/.test(css),
  'if the box stopped scrolling, the header would scroll away with the rows');

if (fail.length) { console.error('\nFAILED:'); fail.forEach(f => console.error('  - ' + f)); process.exit(1); }
console.log('\nALL CHECKS PASSED');
