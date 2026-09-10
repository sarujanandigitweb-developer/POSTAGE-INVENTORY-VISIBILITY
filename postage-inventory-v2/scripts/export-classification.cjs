// One-time seed export.
//
// WHY THIS EXISTS. build.js states the central rule of the live dashboard:
// "an existing SKU keeps the classification it already has — the embedded arrays
// on disk are the authority for f, t, x, mt, sh, ft and sr." Section membership
// and type are CURATED data. They cannot be derived from PostgreSQL by SKU
// prefix, which is what the first version of lib/classify.js wrongly did.
//
// So the curated placement is exported once into data/, and the app joins live
// stock/price/description onto it — the same shape build.js works in. Re-run this
// whenever the live dashboard's arrays change.
//
//   node scripts/export-classification.cjs
const fs = require('node:fs');
const path = require('node:path');
const { read } = require('../../sql/refresh/raw-arrays.js');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = path.join(ROOT, 'dashboard', 'inventory-dashboard.html');
const OUT = path.resolve(__dirname, '..', 'data');

const { bySku } = read();

// sku -> the classification fields only. Volatile fields (stock, price, image,
// description) are deliberately dropped: those come from the database at run time.
const KEEP = ['f', 't', 'x', 'mt', 'sh', 'ft', 'sr', 'gp'];
const cls = {};
for (const sku of Object.keys(bySku)) {
  const e = bySku[sku];
  const o = { key: e.key, arr: e.arr };
  for (const k of KEEP) if (e.row[k] !== undefined) o[k] = e.row[k];
  cls[sku] = o;
}

// ---------------------------------------------------------------------------
// The page re-types three sections IN MEMORY after loading the arrays. The
// arrays on disk keep their byte-identical hashes, so the transforms live in the
// page, not in the data — and anything reading the arrays directly (this script,
// and before it lib/classify.js) gets the PRE-transform shape and disagrees with
// what the dashboard shows. Reproduced here in the page's own order.
// ---------------------------------------------------------------------------

// 1. HANDLES_MOVED — 31 HL SKUs sit in HAP_DATA but are lamp and cabinet
//    hardware, so the team files them with Lamp Spares. Taken BEFORE any
//    re-typing: re-type first and nothing matches 'ZHL' any more.
//    Effect: Lamp Spares 1456 -> 1487, Home Appliances 715 -> 684.
let handles = 0;
for (const o of Object.values(cls)) {
  if (o.arr === 'HAP_DATA' && o.f === 'ZHL') { o.key = 'SPR'; o.f = 'HL'; handles++; }
}

// 2. Wall Arm collapse — the sheet's 11 subtype codes merge into 4 business
//    families; the original subtype is kept verbatim as the `ws` attribute.
const WA_MERGE = { WA:'WAAR', GN:'WAAR', AW:'WAAD', PL:'WAAD', AC:'WAAD',
                   DA:'WADB', DS:'WADB', WB:'WAWB',
                   CR:'WAOT', BN:'WAOT', BI:'WAOT' };
let waCollapsed = 0;
for (const o of Object.values(cls)) {
  if (o.arr !== 'WA_DATA') continue;
  o.ws = o.t;                            // the sheet's own subtype, kept verbatim
  if (WA_MERGE[o.f]) { o.f = WA_MERGE[o.f]; waCollapsed++; }
}

// 3. Bulbs re-typing — the 218 SOT rows become "LED Bulbs" and their banner
//    series moves to the Series attribute. Rows added by prefix (x:1) are left
//    alone, which is why the test is `!o.x`.
const LB_SERIES = { WWCW:'WW-CW Range', FDE:'Filament-Deco', A60:'A60',
  DCO:'Deco-Colour', ST64:'ST64', SMS:'Small-Shapes', GLO:'Globe',
  EXO:'Exotic-Special', PIN:'Pin-Spot', SPF:'Spiral-Filament' };
let lbRetyped = 0;
for (const o of Object.values(cls)) {
  if (o.key !== 'LB' || o.x) continue;
  o.sr = LB_SERIES[o.f] || o.f;
  o.f = 'BLD'; o.t = 'LED Bulbs'; lbRetyped++;
}

// 4. Home Appliances grouping attribute
const HAP_GROUP = { ZLBT:'Bags', ZSB:'Bags', ZHB:'Bags', ZMB:'Bags' };
for (const o of Object.values(cls)) if (o.key === 'HAP' && HAP_GROUP[o.f]) o.gp = HAP_GROUP[o.f];

// ---- the section registry, which drives the category bar and its dropdowns ---
const html = fs.readFileSync(HTML, 'utf8');
function block(src, from) {
  const open = src.indexOf('{', from);
  let d = 0;
  for (let p = open; p < src.length; p++) {
    if (src[p] === '{') d++;
    else if (src[p] === '}') { d--; if (!d) return [open, p + 1]; }
  }
  throw new Error('unbalanced block');
}
const [cs, ce] = block(html, html.indexOf('const CATS = {'));
const src = html.slice(cs, ce);
const decode = s => String(s).replace(/&amp;/g, '&').replace(/&middot;/g, '·')
  .replace(/&mdash;/g, '—').replace(/&hellip;/g, '…').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const sections = {};
const keyRe = /\n  ([A-Z]{2,3}):\s*\{/g;
const bounds = [];
let m;
while ((m = keyRe.exec(src))) bounds.push([m[1], m.index + 1]);
bounds.forEach(([key, at], i) => {
  const body = src.slice(at, i + 1 < bounds.length ? bounds[i + 1][1] : src.length);
  const pick = re => { const r = re.exec(body); return r ? r[1] : null; };
  // fams is an array of [code, label, value] — match its brackets, do not guess
  const fams = [];
  const fi = body.indexOf('fams:');
  if (fi >= 0) {
    const start = body.indexOf('[', fi);
    let d = 0, end = start;
    for (let p = start; p < body.length; p++) {
      if (body[p] === '[') d++;
      else if (body[p] === ']') { d--; if (!d) { end = p + 1; break; } }
    }
    // THREE OR MORE, not exactly three. The six original sections write their
    // families as ['code','label','value']; the four newest — Cosmetics, Clothes,
    // Home Appliances and Refurbished — write a FOURTH element, the SKU prefix:
    //   ['ZLBT','Laundry bags','Laundry bags','LBT']
    // A pattern that demanded ']' straight after the third string matched none of
    // them and silently produced zero families for exactly those four sections, so
    // their dropdowns offered nothing but "All ...". Anything after the third
    // string is consumed up to the closing bracket and ignored.
    const fre = /\[\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*(?:,\s*'((?:[^'\\]|\\.)*)'\s*)?\]/g;
    let f; while ((f = fre.exec(body.slice(start, end)))) {
      // f[4] is the SKU PREFIX, present only on the four prefix-defined sections.
      // classifySKU builds its PREFIX_RULES from it, so without it a new SKU in
      // those sections cannot be placed.
      fams.push({ code: f[1], label: decode(f[2]), value: f[3], prefix: f[4] || null });
    }
  }
  const sub2 = /sub2:\s*\{\s*key:\s*'([^']*)',\s*label:\s*'([^']*)'/.exec(body);
  const attr = /attr:\s*\{\s*key:\s*'([^']*)',\s*label:\s*'([^']*)'/.exec(body);
  sections[key] = {
    key,
    name: decode(pick(/name:\s*'([^']*)'/) || key),
    placeholder: decode(pick(/ph:\s*'([^']*)'/) || ''),
    file: pick(/file:\s*'([^']*)'/) || key.toLowerCase(),
    fams,
    sub2: sub2 ? { key: sub2[1], label: sub2[2] } : null,
    attr: attr ? { key: attr[1], label: attr[2] } : null,
  };
});

// ---------------------------------------------------------------------------
// THE CLASSIFIER, so a SKU THE EXPORT HAS NEVER SEEN can still be placed.
//
// classification.json is a list of SKUs that already existed when it was made. A
// lampshade added to inventory.products tomorrow is not in it, and the Inventory page
// scopes its query to that list — so the new SKU simply would not appear, and the
// dashboard would be failing at the one job it has.
//
// The published page does not have that problem: it derives rules from the data and
// classifies any SKU on sight. Those same three indexes are emitted here so the app can
// do it too, built exactly as the page builds them.
const PREFIX_DEFINED = { SPR: 1, LGT: 1, LB: 1, CSM: 1, CLO: 1, HAP: 1, RFB: 1 };

// 1. the four-character index, DERIVED FROM THE DATA. Where every SKU sharing a 4-char
//    prefix agrees on its family, that is a rule; where they disagree it is recorded as
//    ambiguous and the type is left as "Other" rather than guessed.
const seen = {};
for (const sku of Object.keys(cls)) {
  const e = cls[sku];
  if (!e.f || PREFIX_DEFINED[e.key]) continue;   // prefix-defined sections are routed by rule, not derived
  const p4 = sku.slice(0, 4).toUpperCase();
  if (p4.length < 4) continue;
  ((seen[p4] ||= {})[e.key + '|' + e.f] ||= 0, seen[p4][e.key + '|' + e.f]++);
}
const sub4 = {}, sub4Ambiguous = {};
for (const p4 of Object.keys(seen)) {
  const codes = Object.keys(seen[p4]);
  if (codes.length === 1) {
    const [key, code] = codes[0].split('|');
    const fam = (sections[key]?.fams || []).find(f => f.code === code);
    sub4[p4] = { key, code, label: fam ? fam.label : code };
  } else {
    sub4Ambiguous[p4] = { key: codes[0].split('|')[0], codes: codes.map(c => c.split('|')[1]) };
  }
}

// 2. prefixes DECLARED by a prefix-defined section, longest first so CTKMP (Pajamas
//    K.M) is tested before CTMP (Pajamas M) and a kids' SKU is never taken by the
//    adult type.
const prefixRules = [];
for (const key of Object.keys(sections))
  for (const f of sections[key].fams || [])
    if (f.prefix) prefixRules.push({ p: String(f.prefix).toUpperCase(), key, code: f.code, label: f.label });
prefixRules.sort((a, b) => b.p.length - a.p.length);

// 3. the two-character map, read from the page's own CLASSIFY literal
const classify = {};
{
  const [cb, ce] = block(html, html.indexOf('const CLASSIFY = {'));
  const body = html.slice(cb, ce);
  const re = /([A-Z0-9]{2,4})\s*:\s*\{([^}]*)\}/g;
  let m2;
  while ((m2 = re.exec(body))) {
    const k = (/key:\s*'([^']*)'/.exec(m2[2]) || [])[1];
    const name = (/name:\s*'([^']*)'/.exec(m2[2]) || [])[1];
    const sub = (/sub:\s*'([^']*)'/.exec(m2[2]) || [])[1];
    const code = (/code:\s*'([^']*)'/.exec(m2[2]) || [])[1];
    if (k) classify[m2[1]] = { key: k, name: decode(name || k), sub: sub ? decode(sub) : null, code: code || null };
  }
}
const names = {};
for (const k of Object.keys(sections)) names[k] = sections[k].name;

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'classification.json'), JSON.stringify(cls));
fs.writeFileSync(path.join(OUT, 'sections.json'), JSON.stringify(sections, null, 2));
fs.writeFileSync(path.join(OUT, 'classifier.json'),
  JSON.stringify({ names, classify, sub4, sub4Ambiguous, prefixRules, prefixDefined: PREFIX_DEFINED }, null, 2));

const counts = {};
for (const s of Object.keys(cls)) counts[cls[s].key] = (counts[cls[s].key] || 0) + 1;
console.log('  transforms  : ' + handles + ' handles HAP->SPR · ' + waCollapsed +
            ' Wall Arm codes collapsed · ' + lbRetyped + ' Bulbs re-typed');
console.log('  classification.json : ' + Object.keys(cls).length.toLocaleString() + ' SKUs');
console.log('  sections.json       : ' + Object.keys(sections).length + ' sections');
console.log('  classifier.json     : ' + Object.keys(sub4).length + ' four-char rules, ' +
            Object.keys(sub4Ambiguous).length + ' ambiguous, ' + prefixRules.length +
            ' declared prefixes, ' + Object.keys(classify).length + ' two-char rules');
// What the published dashboard's own category strip shows. Kept in step with it by
// hand: when the strip moves, this moves. CR and LGT went 383->384 and 563->564 when
// CRSF100CF and WSSH68YBCF were added to the embedded arrays.
const LIVE = { CR:384, LS:996, PH:482, WA:181, LH:417, LB:335, SPR:1487, LGT:564,
               CSM:124, CLO:177, HAP:684, RFB:352 };
let bad = 0;
for (const [k, v] of Object.entries(sections)) {
  const got = counts[k] || 0, want = LIVE[k];
  const ok = want === undefined ? '' : (got === want ? '  OK' : '  *** live shows ' + want);
  if (want !== undefined && got !== want) bad++;
  console.log('    ' + k.padEnd(4) + v.name.padEnd(22) + String(got).padStart(5) +
    '  ' + String(v.fams.length).padStart(2) + ' families' +
    (v.sub2 ? ' · sub2 ' + v.sub2.key : '') + (v.attr ? ' · attr ' + v.attr.key : '') + ok);
}
console.log(bad ? '\n  *** ' + bad + ' section(s) do not match the live dashboard'
                : '\n  every section matches the live dashboard');
