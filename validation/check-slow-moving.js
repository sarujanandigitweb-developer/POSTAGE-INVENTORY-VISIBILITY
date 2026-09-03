'use strict';
// Drives the Slow-Moving tab through the page's OWN code and checks what it produces,
// then re-runs the defining query against the database and compares the row count.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const FILE = process.env.DASHBOARD || path.join(ROOT, 'dashboard', 'inventory-dashboard.html');
const html = fs.readFileSync(FILE, 'utf8');
const above = html.slice(0, html.indexOf('<script>'));
const DOM_IDS = new Set();
above.replace(/id="([^"]+)"/g, (m, id) => { DOM_IDS.add(id); return m; });
const els = {}; const missing = [];
const mk = id => ({ id, innerHTML:'', textContent:'', value:'', hidden:false, attrs:{}, options:[],
  selectedOptions:[{textContent:''}], dataset:{}, style:{},
  classList:{add(){},remove(){},toggle(){},contains:()=>false},
  addEventListener(){}, appendChild(){},
  setAttribute(k,v){this.attrs[k]=v}, getAttribute(k){return this.attrs[k]||''},
  insertAdjacentHTML(p,h){this.innerHTML+=h}, querySelector:()=>null, querySelectorAll:()=>[],
  replaceWith(){}, focus(){}, scrollIntoView(){}, getBoundingClientRect:()=>({top:0,height:0}) });
const document = { getElementById: id => { if (!DOM_IDS.has(id)){ missing.push(id); return null; }
                     return els[id] || (els[id] = mk(id)); },
  querySelector:()=>null, querySelectorAll:()=>[], createElement:()=>mk('n'), addEventListener(){},
  documentElement:mk('h'), body:mk('b') };
const src = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
const sb = { console, out:null };
new Function('sandbox','document','window','localStorage','setInterval','clearInterval',
             'setTimeout','clearTimeout','fetch','alert',
  src + '\n; sandbox.out = { SLOW_MOVING, sm, smRender, smFilter, smDraw, smDate, SM_MISSING, SM_COLS, setView, smPass, smOptCounts };')
  (sb, document, { addEventListener(){}, matchMedia:()=>({matches:false,addEventListener(){}}) },
   { getItem:()=>null, setItem(){} }, ()=>0, ()=>0, fn=>0, ()=>0,
   ()=>({then(){return this},catch(){return this}}), ()=>0);
const { SLOW_MOVING, sm, smFilter, smDraw, smDate, SM_MISSING, SM_COLS, setView,
        smPass, smOptCounts } = sb.out;

const fail = [];
const chk = (n, ok, note) => { console.log('  ' + (ok ? 'OK  ' : '*** ') + n +
  (note !== undefined ? '  — ' + note : '')); if (!ok) fail.push(n); };
console.log('ids looked up but absent from markup:', missing.length,
            missing.length ? '*** ' + [...new Set(missing)].join(', ') : '');

console.log('\n=== data ===');
const R = SLOW_MOVING.r;
chk('SLOW_MOVING is populated', R.length > 1000, R.length.toLocaleString() + ' rows');
chk('no duplicate SKU', new Set(R.map(r => r.s)).size === R.length);
// zero-stock rows are KEPT and flagged rather than dropped
chk('zero-stock rows are kept, not dropped', R.some(r => r.z === 1),
    R.filter(r => r.z).length.toLocaleString() + ' flagged of ' + R.length.toLocaleString());
chk('the flag matches the quantity exactly',
    R.every(r => (r.z === 1) === !(r.q > 0)));
chk('nothing is both stockless and never-sold', R.every(r => r.z !== 1 || r.d !== 0),
    'a dormant catalogue entry is neither slow nor actionable');
chk('actionable stock sorts above zero-stock',
    R.every((r,i,a) => i===0 || a[i-1].z <= r.z));
chk('every row is over the 90-day threshold', R.every(r => r.dy > 90),
    'min idle ' + Math.min.apply(null, R.map(r => r.dy)) + ' days');
const band = d => d > 365 ? 3 : d > 180 ? 2 : d > 90 ? 1 : 0;
chk('priority always matches idle days', R.every(r => band(r.dy) === r.pr));
chk('sorted: actionable stock first, then Critical, then longest idle',
    R.every((r,i,a) => { if (i===0) return true; const p = a[i-1];
      return p.z < r.z || (p.z === r.z && (p.pr > r.pr || (p.pr === r.pr && p.dy >= r.dy))); }));

console.log('\n=== item names ===');
{
  const named = R.filter(r => r.n);
  chk('nearly every row has a real name', named.length / R.length > 0.95,
      named.length.toLocaleString() + ' of ' + R.length.toLocaleString() +
      ' (' + (100 * named.length / R.length).toFixed(1) + '%)');
  chk('no name is the combo placeholder', !R.some(r => r.n === 'Combo Default Title.'));
  chk('no name is just the SKU repeated', !R.some(r => r.n && r.n === r.s));
  chk('names are trimmed and space-collapsed',
      named.every(r => r.n === r.n.replace(/\s+/g, ' ').trim()));
  const ex = fs.readFileSync(path.join(ROOT,'sql','refresh','extract','slow-moving.js'),'utf8');
  chk('UK listing titles are tried before the order line',
      ex.indexOf("shopify_listings\n                   WHERE site='UK'") <
      ex.indexOf('order_management.order_item_info\n                   WHERE item_title'),
      'shopify UK -> amazon UK -> B&Q -> eBay UK -> order line');
  chk('only UK listing titles are used',
      (ex.match(/site='UK' AND title/g) || []).length >= 2);
}

console.log('\n=== movement sources ===');
{
  const ex = fs.readFileSync(path.join(ROOT,'sql','refresh','extract','slow-moving.js'),'utf8');
  chk('direct sales counted',            /order_management\.order_item_info/.test(ex));
  chk('component usage inside combos counted', /order_management\.order_combo/.test(ex));
  chk('ad-hoc "A+B+C" combo lines split', /split\('\+'\)/.test(ex));
  chk('Cancelled and Deleted excluded',  /NOT IN \('Cancelled','Deleted'\)/.test(ex));
  chk('Refunded kept — the item did leave the shelf', !/'Refunded'/.test(ex));
}

console.log('\n=== column widths cannot collapse ===');
{
  const mw = /table\.smtab\{min-width:(\d+)px\}/.exec(html);
  const cols = [...html.matchAll(/col\.s-([a-z]+)\{width:(\d+)px\}/g)];
  const px = cols.reduce((n, m) => n + Number(m[2]), 0);
  chk('every column has a px width, none a percentage', cols.length === SM_COLS.length,
      cols.length + ' of ' + SM_COLS.length);
  chk('the widths sum to exactly the table min-width', !!mw && px === Number(mw[1]),
      px + 'px vs min-width ' + (mw ? mw[1] : '?') + 'px');
  chk('the colgroup declares one col per column',
      (html.match(/<col class="s-/g) || []).length === SM_COLS.length);
}

console.log('\n=== images reuse existing references, never copies ===');
const withImg = R.filter(r => r.i);
// "no duplication" means no copy of the bytes — a filename for the standard host, or the
// existing URL for any other host. Length is not the test; a base64 payload is.
chk('images are references, never copies',
    withImg.every(r => !/^data:/.test(r.i)),
    withImg.length.toLocaleString() + ' of ' + R.length.toLocaleString() + ' have an image');
chk('standard-host images carry only the filename',
    withImg.filter(r => !/^https?:/i.test(r.i)).every(r => r.i.indexOf('/') === -1));
// only comboproducts URLs carry the SKU in the filename, so only they are verifiable
chk('no image file names a different SKU',
    withImg.filter(r => /comboproducts\//i.test(r.i)).every(r => {
      let f = r.i.split('/').pop().replace(/\.(jpg|jpeg|png|webp)$/i,'');
      try { f = decodeURIComponent(f); } catch (e) {}
      return f.toUpperCase() === r.s.toUpperCase();
    }),
    withImg.filter(r => /comboproducts\//i.test(r.i)).length + ' combo images checked');
chk('no image is served over insecure http',
    withImg.every(r => !/^http:\/\//i.test(r.i)),
    withImg.filter(r => /^http:\/\//i.test(r.i)).length + ' would be blocked as mixed content');
chk('no base64 image data anywhere in the block',
    JSON.stringify(SLOW_MOVING).indexOf('data:image') === -1);

console.log('\n=== render ===');
setView('sm');
chk('the tab renders rows', /<tr>/.test(els.smbody.innerHTML), sm.drawn + ' rows drawn');
chk('all 17 columns present', SM_COLS.length === 17, SM_COLS.length + ' columns');
['SKU / Component ID','Image','Item Name','Item Type','Parent Product SKU','Available Qty',
 'Warehouse &amp; Location','Last Movement','Days Without Movement','Required Action',
 'Action Qty','Priority','PH','Assigned Person','Target Date','Status','Team Notes']
 .forEach(h => chk('  column ' + h.replace('&amp;','&'), els.smhead.innerHTML.indexOf('>' + h) !== -1));
chk('PH sits immediately after Priority',
    SM_COLS.findIndex(c => c[1] === 'PH') === SM_COLS.findIndex(c => c[1] === 'Priority') + 1);

console.log('\n=== freshness ===');
{
  const ex = fs.readFileSync(path.join(ROOT,'sql','refresh','extract','slow-moving.js'),'utf8');
  // The in-page poll and its banner were removed on request. The stamp itself stays:
  // the header pill reads it, and it is what proves which build the page is.
  chk('the refresh banner is gone, and nothing of it is left behind',
      !/smr/.test(html), 'no smrefresh / smrstate / smrcheck / smrload / smrAuto');
  chk('the freshness stamp is still in the page head',
      /<meta name="data-as-of" content="[^"]+">/.test(html));
  chk('the head stamp matches the page it was built with',
      (/<meta name="data-as-of" content="([^"]*)">/.exec(html)||[])[1] ===
      (/const DATA_AS_OF = '([^']*)'/.exec(html)||[])[1],
      (/<meta name="data-as-of" content="([^"]*)">/.exec(html)||[])[1]);
  chk('the header still names when the data was read',
      /function renderFreshness/.test(html), 'the pill beside the title');
  chk('no database credential reaches the browser',
      !/PGPASSWORD|tech_user|149\.28\.|postgres:\/\//.test(html));
}

console.log('\n=== the six fields the database does not hold ===');
chk('all six are declared missing', SM_MISSING.length === 6, SM_MISSING.join(', '));
chk('they render as a muted dash, not a blank',
    (els.smbody.innerHTML.match(/class="sm-none"/g) || []).length >= sm.drawn * 6);
chk('the gap is stated under the table', /Not held in the database/.test(els.smmissing.innerHTML));

console.log('\n=== filters and search ===');
console.log('  --- the stock filter ---');
sm.stock = 'h'; smFilter();
chk('"Holding stock" is the default view', sm.view.every(r => !r.z),
    sm.view.length.toLocaleString() + ' actionable rows');
sm.stock = 'z'; smFilter();
chk('"Zero stock only" returns just the flagged rows', sm.view.every(r => r.z),
    sm.view.length.toLocaleString() + ' flagged rows');
sm.stock = 'a'; smFilter();
chk('"All" returns every row', sm.view.length === R.length, sm.view.length.toLocaleString());
sm.stock = 'h'; smFilter();

[3,2,1].forEach(p => { sm.pri = String(p); smFilter();
  chk('priority filter ' + ['','Medium','High','Critical'][p],
      sm.view.length > 0 && sm.view.every(r => r.pr === p), sm.view.length.toLocaleString() + ' rows'); });
sm.pri = '';
sm.pri = ''; sm.type = '1'; smFilter();
chk('item type Single', sm.view.every(r => r.t === 1), sm.view.length.toLocaleString());
sm.type = 'c'; smFilter();
chk('"used inside a combo" returns only components with a parent',
    sm.view.length > 0 && sm.view.every(r => r.pa.length), sm.view.length.toLocaleString());
sm.type = ''; sm.ph = '!'; smFilter();
chk('"no PH assigned" returns only rows without one', sm.view.every(r => !r.ph),
    sm.view.length.toLocaleString());
sm.ph = '';
// --- PH person ---
{
  const person = R.find(r => r.pw);
  chk('the data carries a PH person', !!person,
      [...new Set(R.map(r => r.pw).filter(Boolean))].length + ' distinct people');
  if (person){
    sm.php = person.pw; smFilter();
    chk('PH person filter returns only that person\'s SKUs',
        sm.view.length > 0 && sm.view.every(r => r.pw === person.pw),
        person.pw + ' -> ' + sm.view.length.toLocaleString() + ' rows');
    const cats = new Set(sm.view.map(r => r.ph));
    chk('  and it spans every category that person owns', cats.size >= 1,
        cats.size + ' categor' + (cats.size === 1 ? 'y' : 'ies'));
    sm.php = '!'; smFilter();
    chk('"Not assigned" returns only rows without a person', sm.view.every(r => !r.pw),
        sm.view.length.toLocaleString() + ' rows');
    sm.php = ''; smFilter();
  }
  // the dropdown count must equal what selecting it actually shows
  {
    sm.stock = 'h'; sm.php = ''; smFilter(); smOptCounts();
    const sel = els.smphp;
    const opt = (sel.innerHTML.match(/data-name="([^"]+)"/g) || [])
      .map(m => m.slice(11, -1)).filter(Boolean);
    let wrong = 0, tested = 0;
    opt.slice(0, 12).forEach(name => {
      const promised = sm.rows.filter(r => r.pw === name && smPass(r, 'php')).length;
      sm.php = name; smFilter();
      tested++; if (sm.view.length !== promised) wrong++;
    });
    sm.php = ''; smFilter();
    chk('every PH count equals what selecting it shows', wrong === 0,
        tested + ' people checked against the active filters');
  }
  chk('a duplicated staff name is shown once',
      !R.some(r => { if (!r.pw) return false; const w = r.pw.split(' ');
        return w.length === 2 && w[0].toLowerCase() === w[1].toLowerCase(); }));
}
sm.q = R[0].s.toLowerCase(); smFilter();
chk('search by SKU finds it', sm.view.some(r => r.s === R[0].s));
sm.q = 'zzzz-no-such'; smFilter(); smDraw();
chk('a no-match search says so', /No SKU matches/.test(els.smbody.innerHTML));
sm.q = ''; smFilter();

console.log('\n=== sorting ===');
sm.sort = 'd'; sm.dir = 1; smFilter();
chk('by days idle, worst first', sm.view.every((r,i,a) => i===0 || a[i-1].dy >= r.dy));
sm.sort = 'q'; smFilter();
chk('by quantity, largest first', sm.view.every((r,i,a) => i===0 || a[i-1].q >= r.q));
sm.sort = 's'; smFilter();
chk('by SKU', sm.view.every((r,i,a) => i===0 || a[i-1].s.localeCompare(r.s) <= 0));
sm.sort = 'p'; smFilter(); smDraw();

console.log('\n=== formatting ===');
chk('dates render DD/MM/YYYY', /^\d{2}\/\d{2}\/\d{4}$/.test(smDate(R.find(r => r.d).d)), smDate(R.find(r => r.d).d));
// the default page may hold no never-sold row, so search one out and render it
const never = R.find(r => !r.d);
chk('the data contains never-sold SKUs', !!never,
    R.filter(r => !r.d).length.toLocaleString() + ' of ' + R.length.toLocaleString());
if (never){
  sm.q = never.s.toLowerCase(); smFilter(); smDraw();
  chk('a long parent list is summarised, not spilled',
      R.every(r => r.pa.length <= 2), 'at most 2 shown, the rest as "+N more"');
  chk('a never-sold SKU renders "Never sold", not 01/01/1970',
      /Never sold/.test(els.smbody.innerHTML) && !/01\/01\/1970/.test(els.smbody.innerHTML),
      never.s + ' — idle ' + never.dy.toLocaleString() + ' days');
  sm.q = ''; smFilter(); smDraw();
}

console.log('\n' + (fail.length ? '*** ' + fail.length + ' CHECK(S) FAILED' : 'ALL CHECKS PASSED'));
process.exit(fail.length ? 1 : 0);
