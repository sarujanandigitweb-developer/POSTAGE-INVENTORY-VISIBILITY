'use strict';
// Pre-publish smoke test: does the page actually RENDER? The failure that cost a
// release was a page that loaded its data fine and then died binding an element,
// showing "Showing 0 of 0" with every dataset intact. This drives the real render()
// for every section and counts the rows it produced. Read-only.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
// DASHBOARD lets the refresh validate a TEMPORARY file before it is ever installed.
const FILE = process.env.DASHBOARD || path.join(ROOT, 'dashboard', 'inventory-dashboard.html');
const html = fs.readFileSync(FILE, 'utf8');

// every id the script may look up must exist in the markup ABOVE <script>
const above = html.slice(0, html.indexOf('<script>'));
const DOM_IDS = new Set();
above.replace(/id="([^"]+)"/g, (m, id) => { DOM_IDS.add(id); return m; });

const els = {};
const missing = [];
function mkEl(id){
  return { id, innerHTML: '', textContent: '', value: '', hidden: false,
           options: [], selectedOptions: [{ textContent: '' }], dataset: {},
           style: {}, classList: { add(){}, remove(){}, toggle(){}, contains: () => false },
           addEventListener(){}, appendChild(){}, setAttribute(){}, getAttribute: () => '',
           querySelector: () => null, querySelectorAll: () => [], replaceWith(){}, focus(){} };
}
const document = {
  getElementById: id => { if (!DOM_IDS.has(id)){ missing.push(id); return null; }
                          return els[id] || (els[id] = mkEl(id)); },
  querySelector: () => null, querySelectorAll: () => [],
  createElement: () => mkEl('new'), addEventListener(){},
  documentElement: mkEl('html'), body: mkEl('body')
};
const src = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const sb = { console, out: null };
let err = null;
try {
  new Function('sandbox','document','window','localStorage','setInterval','clearInterval','fetch','alert',
    src + '\n; sandbox.out = { CATS, CATEGORIES, state, render, choose: null, els: null };')
    (sb, document, { addEventListener(){}, matchMedia: () => ({ matches:false, addEventListener(){} }) },
     { getItem: () => null, setItem(){} }, () => 0, () => 0,
     () => ({ then(){ return this; }, catch(){ return this; } }), () => 0);
} catch (e){ err = e; }

if (err){ console.log('*** THE SCRIPT THREW: ' + err.message); process.exit(1); }
console.log('script parsed and ran to completion : OK');
console.log('ids looked up but absent from markup:', missing.length,
            missing.length ? '*** ' + [...new Set(missing)].join(', ') : '');

const { CATS, state, render } = sb.out;
let total = 0, bad = [];
Object.keys(CATS).forEach(k => {
  state.cat = k; state.q = ''; state.fam = ''; state.wh = ''; state.st = '';
  state.sub2 = ''; state.attr = ''; state.pageSize = 'all'; state.page = 1;
  render();
  const n = (els.tb.innerHTML.match(/<tr>/g) || []).length;
  total += n;
  if (n !== CATS[k].data.length) bad.push(k + ': rendered ' + n + ' of ' + CATS[k].data.length);
  if (els.tb.innerHTML.indexOf('>undefined<') !== -1) bad.push(k + ': renders "undefined"');
  console.log('  ' + k.padEnd(5) + String(n).padStart(6) + ' rows');
});
console.log('total rows rendered                :', total.toLocaleString());
console.log('sections rendering the wrong count :', bad.length, bad.join(' | '));
console.log('header count is not 0 of 0         :', els.total.textContent !== '0' ? 'OK' : '*** ZERO');
process.exit(missing.length || bad.length ? 1 : 0);
