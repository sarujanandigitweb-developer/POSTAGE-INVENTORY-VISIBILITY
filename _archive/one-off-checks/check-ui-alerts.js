'use strict';
// Verifies the alert / badge / dash round without a browser: counts the alert
// populations, checks the filters return exactly those SKUs, and checks the markup
// each new control depends on is present ABOVE <script>. Read-only.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'dashboard', 'inventory-dashboard.html'), 'utf8');

// --- every id the script looks up must exist in the markup above <script> ----
const above = html.slice(0, html.indexOf('<script>'));
['cmmodal','cmx','cmsku','cmtxt','imgmodal','imx','imsku','imimg','alertLow','alertOut']
  .forEach(id => console.log(('id="' + id + '"').padEnd(22) +
    (above.indexOf('id="' + id + '"') !== -1 ? 'above <script> OK' : '*** MISSING ***')));

const o = html.indexOf('<script>');
const body = html.slice(o + 8, html.indexOf('const state = {'));
const el = { addEventListener(){}, appendChild(){}, style:{}, classList:{ add(){}, remove(){}, toggle(){} } };
const document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
                   createElement: () => el, addEventListener(){}, documentElement: el, body: el };
const sb = { console, out: null };
new Function('sandbox','document','window','localStorage',
  body + '\n; sandbox.out = { CATS, stockLevel, stockTotal, price, locDash, img };')
  (sb, document, { addEventListener(){}, matchMedia: () => ({matches:false, addEventListener(){}}) },
   { getItem: () => null, setItem(){} });
const { CATS, stockLevel, price, locDash, img } = sb.out;

const all = [].concat(...Object.keys(CATS).map(k => CATS[k].data));
const n = lvl => all.filter(r => stockLevel(r) === lvl).length;
console.log('\nrows                :', all.length);
console.log('  out of stock (<=0):', n('out'));
console.log('  low stock (1-10)  :', n('low'));
console.log('  ok (>10)          :', n('ok'));
console.log('  three buckets sum :', n('out') + n('low') + n('ok') === all.length ? 'OK' : 'MISMATCH');

console.log('\nper section  out    low');
Object.keys(CATS).forEach(k => {
  const d = CATS[k].data;
  console.log('  ' + k.padEnd(6) + String(d.filter(r => stockLevel(r) === 'out').length).padStart(6) +
              String(d.filter(r => stockLevel(r) === 'low').length).padStart(7));
});

// --- price badge -------------------------------------------------------------
const cls = p => (/pb-(r|y|ok)/.exec(price(p, 1, p, p)) || [])[0];
console.log('\nprice badge  £0.00 ->', cls(0), ' £6.19 ->', cls(6.19), ' £10.00 ->', cls(10),
            ' £10.01 ->', cls(10.01), ' £24.49 ->', cls(24.49));
const priced = all.filter(r => typeof r.p === 'number');
console.log('priced rows         :', priced.length,
            ' yellow (<=10):', priced.filter(r => r.p <= 10).length,
            ' red (<=0):', priced.filter(r => r.p <= 0).length);

// --- Unit 3 / Unit 4 dash ----------------------------------------------------
console.log('\nlocDash(null)       :', locDash(null));
console.log('locDash("1-E-07")   :', locDash('1-E-07'));
console.log('rows with no Unit 3 shelf:', all.filter(r => !r.al).length,
            ' no Unit 4 shelf:', all.filter(r => !r.bl).length);
console.log('Unit 3/4 use locDash:',
  /num\(r\.a\) \+ '<\/td><td>' \+ locDash\(r\.al\)/.test(html) &&
  /num\(r\.b\) \+ '<\/td><td>' \+ locDash\(r\.bl\)/.test(html) ? 'OK' : '*** NOT WIRED ***');
console.log('EVERY shelf column uses the dash:',
  (html.match(/locDash\(r\./g) || []).length === 4 &&
  (html.match(/[^h]loc\(r\./g) || []).length === 0 ? 'OK' : '*** NOT ALL ***');
console.log('rows with no Kronen shelf:', all.filter(r => !r.kl).length,
            ' no Schmutter shelf:', all.filter(r => !r.ml).length);
console.log('the Unavailable legend is gone:',
  html.indexOf('naTag') === -1 && html.indexOf('Unavailable = not present') === -1 ? 'OK' : '*** STILL THERE ***');

// --- image + comment are clickable -------------------------------------------
console.log('\nthumb carries data-sku:', /class="thumb"[^']*data-sku/.test(img('x.jpg', 'ABC')) ? 'OK' : 'NO');
console.log('comment cell is a button:', /<td class="cm"><button type="button" class="cmb"/.test(html) ? 'OK' : 'NO');
console.log('passport frame 35x45   :',
  /\.ppt\{width:264px;height:340px/.test(html) && Math.abs(264 / 340 - 35 / 45) < 0.01 ? 'OK' : 'RATIO OFF');
