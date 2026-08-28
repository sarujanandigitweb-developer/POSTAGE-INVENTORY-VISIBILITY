'use strict';
// History and Received: old (embedded) vs new (re-parsed from live Postgres).
// Read-only, writes nothing.
//
// The parser is the SAME module the embedded data was built with, so any difference is
// either a new line in the source or a bug. Every difference is dated, which is what
// separates the two: a movement dated after the extraction is new, one dated before is
// the parser disagreeing with itself.
//
//   node sql/refresh/compare-history-received.js
const fs = require('fs');
const path = require('path');
const { load } = require('./rules.js');
const { connect, q } = require('./db.js');
const { parseLine } = require('../product-history-parser.js');

const ROOT = path.resolve(__dirname, '..', '..');
const R = load();
const OLD = [].concat(...Object.keys(R.CATS).map(k => R.CATS[k].data));
const SKUS = OLD.map(r => r.s);
const OLDROW = {}; OLD.forEach(r => { OLDROW[r.s] = r; });
const pct = (a, b) => b === 0 ? '100.00' : (100 * a / b).toFixed(2);

(async () => {
  const c = await connect();

  // ---- pull the four types for the dashboard's SKUs, live --------------------
  const lines = {};
  let total = 0;
  for (let i = 0; i < SKUS.length; i += 800){
    const batch = SKUS.slice(i, i + 800);
    const rows = await q(c, `SELECT upper(p.sku) AS sku, trim(l.line) AS line, l.ord
      FROM inventory.products p JOIN inventory.product_history h ON h.inventory_id = p.id,
      LATERAL unnest(string_to_array(h.history, E'\\n')) WITH ORDINALITY AS l(line, ord)
      WHERE upper(p.sku) = ANY($1) AND trim(l.line) <> ''
        AND (l.line ILIKE '%UK stock changes%' OR trim(l.line) ILIKE 'Supply%'
          OR trim(l.line) ILIKE 'German Supply%' OR l.line ~* 'german ?Inventory +Changed +from')`,
      [batch]);
    rows.forEach(r => { (lines[r.sku] = lines[r.sku] || []).push(r.line); total++; });
  }
  console.log('=== HISTORY ===');
  console.log('  source lines (four types, live) :', total.toLocaleString());
  console.log('  SKUs with source lines          :', Object.keys(lines).length.toLocaleString());

  // ---- parse them with the same parser --------------------------------------
  const CAP = 12;
  const region = tl => tl === 'German' ? 'DE' : 'UK';
  const now = {};
  let parsed = 0;
  Object.keys(lines).forEach(sku => {
    const mv = [];
    lines[sku].forEach(l => { parseLine(l).forEach(m => mv.push(m)); });
    parsed += mv.length;
    const byRg = {};
    mv.forEach(m => { (byRg[region(m.tl)] = byRg[region(m.tl)] || []).push(m); });
    const out = {};
    ['UK','DE'].forEach(rg => {
      const all = (byRg[rg] || []).slice()
        .sort((a, b) => (b.dt + ' ' + (b.tm||'')).localeCompare(a.dt + ' ' + (a.tm||'')));
      if (all.length) out[rg] = all.slice(0, CAP);
    });
    if (Object.keys(out).length) now[sku] = out;
  });
  console.log('  movements parsed                :', parsed.toLocaleString());
  console.log('  SKUs with movements             :', Object.keys(now).length.toLocaleString());

  // ---- compare with what the dashboard carries -------------------------------
  const OLDH = R.CATS ? null : null;
  const H = (function(){ // decode the embedded record
    const src = fs.readFileSync(path.join(ROOT, 'dashboard', 'inventory-dashboard.html'), 'utf8');
    const o = src.indexOf('<script>');
    const body = src.slice(o + 8, src.indexOf('const state = {'));
    const el = { addEventListener(){}, appendChild(){}, style:{}, classList:{ add(){}, remove(){}, toggle(){} } };
    const document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
                       createElement: () => el, addEventListener(){}, documentElement: el, body: el };
    const sb = { console, out: null };
    new Function('sandbox','document','window','localStorage', body + '\n; sandbox.out = STOCK_HISTORY;')
      (sb, document, { addEventListener(){}, matchMedia: () => ({matches:false, addEventListener(){}}) },
       { getItem: () => null, setItem(){} });
    return sb.out;
  })();

  const key = m => [m.dt, m.ac, m.tl, m.sb, m.sa, m.qt, m.cp, m.ip, m.rm, m.cn].join('|');
  let sameSku = 0, diffSku = 0, newerOnly = 0, realDiff = 0;
  const examples = [];
  const EXTRACT_DAY = '2026-08-27';        // the day the embedded history was built
  Object.keys(now).forEach(sku => {
    const a = H[sku] || {}, b = now[sku];
    const rgs = [...new Set(Object.keys(a).concat(Object.keys(b)))];
    let identical = true, onlyNewer = true;
    rgs.forEach(rg => {
      const A = (a[rg] || []).map(key), B = (b[rg] || []).map(key);
      if (A.length === B.length && A.every((x, i) => x === B[i])) return;
      identical = false;
      // every movement in B that is not in A — is it dated after the extraction?
      const setA = new Set(A);
      const fresh = (b[rg] || []).filter(m => !setA.has(key(m)));
      if (!fresh.every(m => m.dt >= EXTRACT_DAY)) onlyNewer = false;
      if (examples.length < 8 && fresh.length)
        examples.push([sku, rg, fresh.slice(0, 2).map(m => m.dt + ' ' + m.ac + ' ' + m.tl +
          ' ' + m.sb + '->' + m.sa).join(' ; ')]);
    });
    if (identical) sameSku++;
    else { diffSku++; onlyNewer ? newerOnly++ : realDiff++; }
  });
  console.log('\n  SKUs identical to the dashboard :', sameSku.toLocaleString(),
              '(' + pct(sameSku, Object.keys(now).length) + '%)');
  console.log('  SKUs that differ                :', diffSku.toLocaleString());
  console.log('    of which ONLY new movements   :', newerOnly.toLocaleString(),
              '(dated ' + EXTRACT_DAY + ' or later — real)');
  console.log('    of which differ on OLD rows   :', realDiff.toLocaleString(),
              realDiff ? '*** parser disagreement, investigate' : '');
  examples.forEach(e => console.log('      ' + e[0].padEnd(14) + e[1] + '  ' + e[2]));

  // ---- Received --------------------------------------------------------------
  console.log('\n=== RECEIVED (warehouse + date) ===');
  const latest = {};
  Object.keys(lines).forEach(sku => {
    lines[sku].forEach(l => parseLine(l).forEach(m => {
      if (m.ac !== 'Goods received') return;
      const rg = region(m.tl);
      const cur = (latest[sku] = latest[sku] || {})[rg];
      const stamp = m.dt + ' ' + (m.tm || '');
      if (!cur || stamp > cur.stamp) latest[sku][rg] = { wh: m.tl, dt: m.dt, cn: m.cn, stamp };
    }));
  });
  let rSame = 0, rDiff = 0, rNew = 0;
  const rEx = [];
  OLD.forEach(r => {
    const L = latest[r.s] || {};
    [['UK','ruw','rud'], ['DE','rgw','rgd']].forEach(([rg, wcol, dcol]) => {
      const oldW = r[wcol] || null, oldD = r[dcol] || null;
      const nw = L[rg] ? L[rg].wh : null, nd = L[rg] ? L[rg].dt : null;
      if (oldW === nw && oldD === nd){ rSame++; return; }
      if (!oldW && nw){ rNew++; if (rEx.length < 6) rEx.push([r.s, rg, 'none -> ' + nw + ' ' + nd]); return; }
      rDiff++;
      if (rEx.length < 6) rEx.push([r.s, rg, (oldW||'-') + ' ' + (oldD||'-') + ' -> ' + (nw||'-') + ' ' + (nd||'-')]);
    });
  });
  const rTot = rSame + rDiff + rNew;
  console.log('  SKU/region pairs compared :', rTot.toLocaleString());
  console.log('  identical                 :', rSame.toLocaleString(), '(' + pct(rSame, rTot) + '%)');
  console.log('  newly received            :', rNew.toLocaleString());
  console.log('  changed                   :', rDiff.toLocaleString());
  rEx.forEach(e => console.log('      ' + e[0].padEnd(14) + e[1] + '  ' + e[2]));

  await c.end();
})().catch(e => { console.error(String(e.message)); process.exit(1); });
