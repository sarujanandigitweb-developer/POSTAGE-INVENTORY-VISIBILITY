'use strict';
// UI round: comment popover, passport-size image view, stock alerts in the header,
// a Shopify price badge, and "-" instead of Unavailable for Unit 3 / Unit 4 locations.
//
//   node sql/apply-ui-alerts.js
//
// Every dialog is authored ABOVE <script>. An element added below it does not exist
// when the script runs, getElementById returns null, and the whole page dies - that
// cost a full release once already (evidence/45).
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'dashboard', 'inventory-dashboard.html');
let src = fs.readFileSync(FILE, 'utf8');
const orig = src.length;
if (src.indexOf('id="cmmodal"') >= 0){
  console.error('the alert/popover UI is already applied - nothing to do.');
  process.exit(1);
}
function sub(a, b, what){
  if (src.indexOf(a) < 0) throw new Error('anchor not found: ' + what);
  src = src.replace(a, b);
}

// ---------------------------------------------------------------- CSS ------
sub('.pos{color:var(--pos);font-weight:700}', `/* --- stock alerts in the header ------------------------------------------- */
.alerts{display:flex;gap:6px;align-items:center;margin-left:8px}
.alrt{display:inline-flex;align-items:center;gap:6px;border:0;cursor:pointer;font-family:inherit;
  border-radius:999px;padding:6px 11px 6px 9px;font-size:12px;font-weight:700;line-height:1;
  font-variant-numeric:tabular-nums}
.alrt svg{flex:none}
.alrt-y{background:#ffd233;color:#4a3800}
.alrt-y:hover{background:#ffdd5c}
.alrt-r{background:#d93a3a;color:#fff}
.alrt-r:hover{background:#e75151}
.alrt[aria-pressed=true]{outline:2px solid #fff;outline-offset:2px}
.alrt:focus-visible{outline:2px solid #8fb4ff;outline-offset:2px}
/* --- Shopify price badge --------------------------------------------------- */
.pb{display:inline-block;border-radius:6px;padding:2px 7px;font-weight:700;
  font-variant-numeric:tabular-nums;font-size:12px}
.pb-ok{background:var(--na-bg);color:var(--ink)}
.pb-y{background:#ffd233;color:#4a3800}
.pb-r{background:#d93a3a;color:#fff}
/* --- comment cell: small, click for the whole thing ------------------------ */
.cmb{max-width:118px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;
  border:0;background:transparent;padding:0;margin:0;font:inherit;font-size:11px;
  color:var(--muted);cursor:pointer;text-align:left;text-decoration:underline dotted;
  text-underline-offset:2px}
.cmb:hover{color:var(--accent)}
.cmb:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
/* --- shared small modal: comment + image ----------------------------------- */
.smod{position:fixed;inset:0;background:rgba(8,14,25,.62);z-index:70;
  display:flex;align-items:center;justify-content:center;padding:20px}
.smbox{background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:14px;
  box-shadow:0 24px 60px rgba(0,0,0,.42);padding:20px 22px;position:relative;
  max-width:min(460px,100% - 40px)}
.smx{position:absolute;top:8px;right:10px;border:0;background:transparent;color:var(--muted);
  font-size:22px;line-height:1;cursor:pointer;font-family:inherit;padding:2px 6px}
.smx:hover{color:var(--ink)}
.smsku{margin:0 0 10px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  font-weight:700;font-size:13px}
.smtxt{margin:0;font-size:13.5px;line-height:1.55;word-break:break-word}
/* Passport size is 35 x 45 mm. At 96dpi that is 132 x 170 px; shown at 2x so the
   product is actually readable, with the real ratio kept. */
.ppt{width:264px;height:340px;object-fit:contain;background:#fff;border:1px solid var(--line);
  border-radius:8px;display:block;margin:0 auto}
.ppcap{margin:10px 0 0;font-size:11.5px;color:var(--muted);text-align:center}
.thumb{cursor:zoom-in}
.pos{color:var(--pos);font-weight:700}`, 'CSS block');

// ------------------------------------------------------------- markup ------
sub('<script>\nconst DATA =', `<div class="smod" id="cmmodal" hidden>
  <div class="smbox" role="dialog" aria-modal="true" aria-labelledby="cmsku">
    <button type="button" class="smx" id="cmx" aria-label="Close">&times;</button>
    <p class="smsku" id="cmsku"></p>
    <p class="smtxt" id="cmtxt"></p>
  </div>
</div>
<div class="smod" id="imgmodal" hidden>
  <div class="smbox" role="dialog" aria-modal="true" aria-labelledby="imsku">
    <button type="button" class="smx" id="imx" aria-label="Close">&times;</button>
    <p class="smsku" id="imsku"></p>
    <img class="ppt" id="imimg" alt="">
    <p class="ppcap">Passport size &mdash; 35 &times; 45 mm</p>
  </div>
</div>
<script>
const DATA =`, 'dialog markup');

sub(`      <button type="button" class="vtab" id="vpost" role="tab" aria-selected="false" data-view="postage">Postage Information</button>
    </nav>`,
`      <button type="button" class="vtab" id="vpost" role="tab" aria-selected="false" data-view="postage">Postage Information</button>
    </nav>
    <div class="alerts" id="alerts">
      <button class="alrt alrt-r" id="alertOut" type="button" aria-pressed="false" hidden></button>
      <button class="alrt alrt-y" id="alertLow" type="button" aria-pressed="false" hidden></button>
    </div>`, 'header alerts');

sub(`        <option value="neg">Negative</option>`,
    `        <option value="neg">Negative</option>
        <option value="low">Low stock (1&ndash;10)</option>
        <option value="out">Out of stock (0 or less)</option>`, 'stock select options');

// ---------------------------------------------------------------- JS -------
// Unit 3 / Unit 4 read a plain dash, not the Unavailable chip. Every other location
// column keeps the chip, because there the absence is a gap in the source and the
// tooltip says which one.
sub(`function loc(v, kronen){
  return (v === null || v === undefined || v === '')
    ? na(kronen ? NA_REASON.kloc : NA_REASON.loc)
    : '<span class="loc">' + esc(v) + '</span>';
}`,
`function loc(v, kronen){
  return (v === null || v === undefined || v === '')
    ? na(kronen ? NA_REASON.kloc : NA_REASON.loc)
    : '<span class="loc">' + esc(v) + '</span>';
}
// Unit 3 and Unit 4 show a plain dash where the shelf is not recorded. The team reads
// these two columns constantly and an "Unavailable" chip on every empty shelf was
// noise, not information. The database value is passed through untouched otherwise.
function locDash(v){
  return (v === null || v === undefined || v === '')
    ? '<span class="dash" title="No shelf location recorded for this SKU at this unit.">-</span>'
    : '<span class="loc">' + esc(v) + '</span>';
}
// A SKU's stock is the sum of every warehouse column. That is the number a picker
// acts on, and it is what the header alerts count and filter by.
const STOCK_KEYS = ['a','b','c','u5','k','m','ca','us'];
const stockTotal = r => STOCK_KEYS.reduce((t, k) => t + (typeof r[k] === 'number' ? r[k] : 0), 0);
const stockLevel = r => { const t = stockTotal(r); return t <= 0 ? 'out' : (t <= 10 ? 'low' : 'ok'); };`,
    'loc + stock level');

sub(`function price(p, n, lo, hi){
  if (p !== null && p !== undefined) return '£' + Number(p).toFixed(2);`,
`function price(p, n, lo, hi){
  if (p !== null && p !== undefined){
    const v = Number(p);
    // same thresholds as the stock alerts, so one colour rule governs the row
    const cls = v <= 0 ? 'pb-r' : (v <= 10 ? 'pb-y' : 'pb-ok');
    return '<span class="pb ' + cls + '">£' + v.toFixed(2) + '</span>';
  }`, 'price badge');

sub(`  return '<img class="thumb" loading="lazy" src="' + esc(url) + '" alt="' + esc(sku) +`,
    `  return '<img class="thumb" loading="lazy" data-sku="' + esc(sku) + '" src="' + esc(url) + '" alt="' + esc(sku) +`,
    'image data-sku');

sub(`    '<td class="cm">' + esc(r.cm || 'Not listed') + '</td>' +`,
    `    '<td class="cm"><button type="button" class="cmb" data-sku="' + esc(r.s) + '">' +
      esc(r.cm || 'Not listed') + '</button></td>' +`, 'comment cell');

sub(`    if (state.st === 'zero' && !vals.every(v => v === 0)) return false;`,
    `    if (state.st === 'zero' && !vals.every(v => v === 0)) return false;
    if (state.st === 'low'  && stockLevel(r) !== 'low') return false;
    if (state.st === 'out'  && stockLevel(r) !== 'out') return false;`, 'stock filters');

// Unit 3 / Unit 4 use the dash renderer
sub("'<td class=\"n\">' + num(r.a) + '</td><td>' + loc(r.al) + '</td>' +\n" +
    "    '<td class=\"n\">' + num(r.b) + '</td><td>' + loc(r.bl) + '</td>' +",
    "'<td class=\"n\">' + num(r.a) + '</td><td>' + locDash(r.al) + '</td>' +\n" +
    "    '<td class=\"n\">' + num(r.b) + '</td><td>' + locDash(r.bl) + '</td>' +",
    'unit 3/4 dash');

sub('.zero{color:var(--zero)}', '.zero{color:var(--zero)}\n.dash{color:var(--zero)}', 'dash style');

// ---- alerts recomputed on every render -------------------------------------
sub(`  const label = $('wh').selectedOptions[0].textContent;
  $('whNote').textContent = state.wh ? 'Filtered to ' + label : '';
}`,
`  const label = $('wh').selectedOptions[0].textContent;
  $('whNote').textContent = state.wh ? 'Filtered to ' + label : '';
  renderAlerts(cfg);
}

// Two counts over the WHOLE section, not the filtered view: an alert that vanishes
// because you filtered it away is worse than no alert. Clicking one applies the
// matching stock filter, so the reader lands on exactly the SKUs it counted.
const WARN_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
  'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M10.3 3.9 1.8 18.4A1.9 1.9 0 0 0 3.5 21h17a1.9 1.9 0 0 0 1.7-2.6L13.7 3.9a1.9 1.9 0 0 0-3.4 0Z"/>' +
  '<path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
function renderAlerts(cfg){
  const out = cfg.data.filter(r => stockLevel(r) === 'out').length;
  const low = cfg.data.filter(r => stockLevel(r) === 'low').length;
  const set = (id, n, word, on) => {
    const b = $(id);
    b.hidden = n === 0;
    b.innerHTML = WARN_SVG + '<span>' + n + ' ' + word + '</span>';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.title = n + ' ' + cfg.name + ' SKU' + (n === 1 ? '' : 's') + ' ' +
      (word === 'out of stock' ? 'have a total of 0 or less across every warehouse.'
                               : 'have between 1 and 10 units in total across every warehouse.') +
      ' Click to show them.';
  };
  set('alertOut', out, 'out of stock', state.st === 'out');
  set('alertLow', low, 'low stock',    state.st === 'low');
}`, 'renderAlerts');

// ---- the two small dialogs --------------------------------------------------
sub(`$('hmx').addEventListener('click', closeHist);`,
`// Comment and image dialogs. Both open from a delegated click on the table body, so
// they keep working after every re-render without rebinding anything.
function openCm(sku){
  const r = active().data.find(x => x.s === sku);
  if (!r) return;
  $('cmsku').textContent = sku;
  $('cmtxt').textContent = r.cm || 'Not listed';
  $('cmmodal').hidden = false;
}
function openImg(sku, url){
  if (!url) return;
  $('imsku').textContent = sku;
  const im = $('imimg');
  im.setAttribute('src', url);
  im.setAttribute('alt', sku);
  $('imgmodal').hidden = false;
}
const closeSmall = () => { $('cmmodal').hidden = true; $('imgmodal').hidden = true; };
$('cmx').addEventListener('click', closeSmall);
$('imx').addEventListener('click', closeSmall);
$('cmmodal').addEventListener('click', e => { if (e.target === $('cmmodal')) closeSmall(); });
$('imgmodal').addEventListener('click', e => { if (e.target === $('imgmodal')) closeSmall(); });

// The header alerts set the stock filter. Clicking the one already applied clears it,
// so the same control turns the view on and off.
function alertClick(kind){
  state.st = state.st === kind ? '' : kind;
  $('st').value = state.st;
  render();
}
$('alertLow').addEventListener('click', () => alertClick('low'));
$('alertOut').addEventListener('click', () => alertClick('out'));

$('hmx').addEventListener('click', closeHist);`, 'dialog wiring');

sub(`document.addEventListener('keydown', e => { if (e.key === 'Escape') closeHist(); });`,
    `document.addEventListener('keydown', e => { if (e.key === 'Escape'){ closeHist(); closeSmall(); } });`,
    'escape closes all');

// ---- delegated clicks on the table body ------------------------------------
sub(`$('tb').addEventListener('click', e => {
  const key = e.target && e.target.dataset ? e.target.dataset.hs : '';
  if (!key) return;`,
`$('tb').addEventListener('click', e => {
  const t = e.target;
  if (t && t.classList && t.classList.contains('cmb')){ openCm(t.dataset.sku); return; }
  if (t && t.classList && t.classList.contains('thumb')){
    openImg(t.dataset.sku, t.getAttribute('src')); return;
  }
  const key = t && t.dataset ? t.dataset.hs : '';
  if (!key) return;`, 'tb delegation');

fs.writeFileSync(FILE, src);
console.log('inventory-dashboard.html', orig, '->', src.length, 'chars  (+' + (src.length - orig) + ')');
