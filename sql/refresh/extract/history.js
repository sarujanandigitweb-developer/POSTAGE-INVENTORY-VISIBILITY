'use strict';
// Stock history and the Received warehouse/date, from inventory.product_history.
// Pure read, deterministic.
//
// THE PARSER IS NOT REIMPLEMENTED HERE. sql/product-history-parser.js is required and
// used unchanged, so the refresh cannot drift from the validated rules:
//   four types only; the FIELD names the warehouse (Quantity=Unit 3, unit1=Unit 18,
//   unit3=Unit 4, unit2=Mark, unit5=Unit 5); a Supply line yields the LAST segment that
//   actually moved; 12 most recent per SKU per region.
//
// Received is read from the FULL history, not the capped record: a SKU with a busy
// recent recount history would otherwise lose its receipt off the end of the 12.
const { q } = require('../db.js');
const { parseLine } = require('../../product-history-parser.js');

const CAP = 12;
const region = tl => tl === 'German' ? 'DE' : 'UK';

const LINES = `
  SELECT upper(p.sku) AS sku, trim(l.line) AS line
    FROM inventory.products p
    JOIN inventory.product_history h ON h.inventory_id = p.id,
    LATERAL unnest(string_to_array(h.history, E'\\n')) WITH ORDINALITY AS l(line, ord)
   WHERE upper(p.sku) = ANY($1)
     AND trim(l.line) <> ''
     AND (l.line ILIKE '%UK stock changes%'
       OR trim(l.line) ILIKE 'Supply%'
       OR trim(l.line) ILIKE 'German Supply%'
       OR l.line ~* 'german ?Inventory +Changed +from')`;

async function extract(client, skus){
  const lines = {};
  let lineCount = 0;
  for (let i = 0; i < skus.length; i += 800){
    const rows = await q(client, LINES, [skus.slice(i, i + 800)]);
    rows.forEach(r => { (lines[r.sku] = lines[r.sku] || []).push(r.line); lineCount++; });
  }

  // ---- movements, parsed with the shipped parser ---------------------------
  const moves = {};                          // sku -> region -> [movement]
  let parsed = 0;
  Object.keys(lines).forEach(sku => {
    const mv = [];
    lines[sku].forEach(l => parseLine(l).forEach(m => mv.push(m)));
    parsed += mv.length;
    const byRg = {};
    mv.forEach(m => { (byRg[region(m.tl)] = byRg[region(m.tl)] || []).push(m); });
    const out = {};
    ['UK', 'DE'].forEach(rg => {
      const all = (byRg[rg] || []).slice()
        .sort((a, b) => (b.dt + ' ' + (b.tm || '')).localeCompare(a.dt + ' ' + (a.tm || '')));
      if (all.length) out[rg] = all;
    });
    if (Object.keys(out).length) moves[sku] = out;
  });

  // ---- the latest genuine receipt, from the FULL set -----------------------
  const received = {};                       // sku -> region -> {wh, dt, cn}
  Object.keys(moves).forEach(sku => {
    ['UK', 'DE'].forEach(rg => {
      (moves[sku][rg] || []).forEach(m => {
        if (m.ac !== 'Goods received') return;
        const cur = (received[sku] = received[sku] || {})[rg];
        const stamp = m.dt + ' ' + (m.tm || '');
        if (!cur || stamp > cur.stamp) received[sku][rg] = { wh: m.tl, dt: m.dt, cn: m.cn, stamp };
      });
    });
  });

  return { lines, lineCount, moves, received, parsed };
}

// HIST_RAW: interned exactly as the page's decodeHistory expects.
// row = [dIdx, aIdx, lIdx, sb, sa, qt, pIdx(cp), pIdx(ip), rIdx(rm), cIdx(cn), lIdx(fl), tm, sIdx(sr)]
function histRaw(moves){
  const d = [], a = [], l = [], p = [], r = [], c = [], s = [];
  const idx = (t, v) => { const x = (v === undefined || v === null) ? '' : v;
                          let i = t.indexOf(x); if (i < 0){ t.push(x); i = t.length - 1; } return i; };
  [p, r, c, s].forEach(t => idx(t, ''));     // '' at index 0 in each people/text table
  const h = {}, tot = {};
  let carried = 0;
  Object.keys(moves).sort().forEach(sku => {
    const out = {};
    ['UK', 'DE'].forEach(rg => {
      const all = moves[sku][rg];
      if (!all || !all.length) return;
      if (all.length > CAP){ tot[sku] = tot[sku] || {}; tot[sku][rg] = all.length; }
      out[rg] = all.slice(0, CAP).map(m => {
        carried++;
        return [ idx(d, m.dt), idx(a, m.ac), idx(l, m.tl), m.sb, m.sa, m.qt,
                 idx(p, m.cp), idx(p, m.ip), idx(r, m.rm), idx(c, m.cn), idx(l, m.fl),
                 m.tm, idx(s, m.sr) ];
      });
    });
    if (Object.keys(out).length) h[sku] = out;
  });
  return { raw: { d, a, l, p, r, c, s, t: tot, h }, carried };
}

// RECEIVED: { w:[warehouses], n:[containers], o:[orders],
//             r:{ sku:{ UK:[whIdx, date, nameIdx, orderIdx, supplyCode] } } }
function receivedLookup(received, byRegion, skus){
  const w = [''], n = [''], o = [''];
  const idx = (t, v) => { const x = v || ''; let i = t.indexOf(x); if (i < 0){ t.push(x); i = t.length - 1; } return i; };
  const out = {};
  let matched = 0, unmatched = 0;
  skus.forEach(sku => {
    const L = received[sku];
    if (!L) return;
    const rec = {};
    ['UK', 'DE'].forEach(rg => {
      const e = L[rg];
      if (!e) return;
      const list = ((byRegion[sku] || {})[rg]) || [];
      let pick = null;
      for (let i = 0; i < list.length; i++) if (list[i].od <= e.dt) pick = list[i];
      pick ? matched++ : unmatched++;
      rec[rg] = [ idx(w, e.wh), e.dt, idx(n, pick && pick.name), idx(o, pick && pick.order), e.cn || '' ];
    });
    if (Object.keys(rec).length) out[sku] = rec;
  });
  return { lookup: { w, n, o, r: out }, matched, unmatched };
}

module.exports = { extract, histRaw, receivedLookup, CAP, LINES };
