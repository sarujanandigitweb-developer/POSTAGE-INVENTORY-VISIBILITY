'use strict';
// OLD vs NEW: runs every refresh query against live Postgres and compares the result,
// field by field, with what the dashboard holds today. Read-only, writes nothing.
//
// The point is not to count differences — it is to say WHY each one differs:
//
//   REAL   the database genuinely moved since the extraction, and there is independent
//          evidence for it (a history line, or a listing updated after the extraction)
//   QUERY  the new query returns something different for data that did NOT move — a bug
//          in the new query, and a reason not to ship it
//   NEW    a record that did not exist before
//
// inventory.physical_product_stock carries NO timestamp, so a stock change cannot be
// dated directly. It is corroborated against inventory.product_history instead: a real
// movement leaves a line naming that warehouse. That is the only independent evidence
// available, and where it is absent the difference is reported as UNCORROBORATED rather
// than quietly called real.
//
//   node sql/refresh/compare-old-new.js [--sample N] [--verbose]
const fs = require('fs');
const path = require('path');
const { load } = require('./rules.js');
const { connect, q } = require('./db.js');
const { parseLine } = require('../product-history-parser.js');

const ROOT = path.resolve(__dirname, '..', '..');
const R = load();
const OLD = [].concat(...Object.keys(R.CATS).map(k => R.CATS[k].data.map(r => ({ ...r, key: k }))));
const OLD_BY = {}; OLD.forEach(r => { OLD_BY[r.s] = r; });

const argN = process.argv.indexOf('--sample');
const LIMIT = argN > 0 ? Number(process.argv[argN + 1]) : 0;
const VERBOSE = process.argv.indexOf('--verbose') > 0;

// the dashboard's own extraction date — anything after this can explain a change
const EXTRACTED = '2026-08-20';

const COL = { a: 1, b: 8, c: 6, u5: 33, k: 10, m: 7, ca: 4, us: 32 };
const WHN = { 1:'Unit 3', 8:'Unit 4', 6:'Unit 18', 33:'Unit 5', 10:'Kronen', 7:'Schmutter', 4:'Canada', 32:'US' };
// which history field names touch which warehouse — used only for corroboration
const FIELD_OF = { 1:['quantity'], 8:['unit3'], 6:['unit1'], 33:['unit5'], 7:['german'], 10:['german','tros'], 4:['canada'], 32:['usa'] };

const pct = (a, b) => b === 0 ? '100.00' : (100 * a / b).toFixed(2);
const pad = (s, n) => String(s).padEnd(n);

(async () => {
  const c = await connect();
  const report = [];

  // ================= 1. SKU records ==========================================
  console.log('=== 1. SKU RECORDS ===');
  const live = (await q(c, `SELECT DISTINCT ON (upper(sku)) upper(sku) AS sku, id,
      regexp_replace(trim(COALESCE(description,'')),'\\s+',' ','g') AS d, updated_at
    FROM inventory.products
    WHERE inventory_bool AND sku NOT LIKE '%+%' AND sku !~ '[0-9A-Z]PK$'
      AND upper(sku) NOT LIKE '%DUMMY%'
    ORDER BY upper(sku)`));
  const LIVE_BY = {}; live.forEach(r => { LIVE_BY[r.sku] = r; });

  const kept = OLD.filter(r => LIVE_BY[r.s]);
  const removed = OLD.filter(r => !LIVE_BY[r.s]);
  const added = live.filter(r => !OLD_BY[r.sku]);
  console.log('  old (dashboard)       :', OLD.length.toLocaleString());
  console.log('  new (query)           :', live.length.toLocaleString());
  console.log('  present in both       :', kept.length.toLocaleString(),
              '(' + pct(kept.length, OLD.length) + '% of old retained)');
  console.log('  ADDED   (new only)    :', added.length.toLocaleString());
  console.log('  REMOVED (old only)    :', removed.length.toLocaleString(),
              removed.length ? '*** investigate' : '');
  if (removed.length) console.log('    ' + removed.slice(0, 15).map(r => r.s).join(', '));
  report.push(['SKU records', OLD.length, kept.length, added.length, removed.length]);

  // description drift, which is harmless but worth counting
  let descSame = 0, descDiff = 0;
  kept.forEach(r => { (String(r.d || '').trim() === String(LIVE_BY[r.s].d || '').trim()) ? descSame++ : descDiff++; });
  console.log('  description identical :', descSame.toLocaleString(), '/ changed', descDiff.toLocaleString());

  // ================= 2. Warehouse / stock ====================================
  console.log('\n=== 2. WAREHOUSE / STOCK ===');
  const ids = kept.map(r => LIVE_BY[r.s].id);
  const stock = {};
  const CH = 4000;
  for (let i = 0; i < ids.length; i += CH){
    (await q(c, `SELECT inventory, warehouse, quantity FROM inventory.physical_product_stock
                 WHERE inventory = ANY($1)`, [ids.slice(i, i + CH)]))
      .forEach(r => { (stock[r.inventory] = stock[r.inventory] || {})[r.warehouse] = Number(r.quantity); });
  }
  let cells = 0, cellSame = 0;
  const stockDiff = [];
  kept.forEach(r => {
    const st = stock[LIVE_BY[r.s].id] || {};
    Object.keys(COL).forEach(col => {
      cells++;
      const oldV = Number(r[col] || 0);
      const newV = st[COL[col]] === undefined ? 0 : st[COL[col]];
      if (oldV === newV) cellSame++;
      else stockDiff.push({ sku: r.s, wh: COL[col], col, oldV, newV });
    });
  });
  console.log('  stock cells compared  :', cells.toLocaleString());
  console.log('  identical             :', cellSame.toLocaleString(), '(' + pct(cellSame, cells) + '%)');
  console.log('  changed               :', stockDiff.length.toLocaleString(), '(' + pct(stockDiff.length, cells) + '%)');
  const skusMoved = new Set(stockDiff.map(d => d.sku));
  console.log('  SKUs affected         :', skusMoved.size.toLocaleString(),
              '(' + pct(skusMoved.size, kept.length) + '% of rows)');
  const byWh = {};
  stockDiff.forEach(d => { byWh[WHN[d.wh]] = (byWh[WHN[d.wh]] || 0) + 1; });
  console.log('  by warehouse          :', JSON.stringify(byWh));
  report.push(['Stock cells', cells, cellSame, 0, stockDiff.length]);

  // ---- corroboration: does history explain the move? ------------------------
  console.log('\n  -- corroborating stock changes against product_history --');
  const moveSkus = [...skusMoved];
  const hist = {};
  for (let i = 0; i < moveSkus.length; i += 500){
    const batch = moveSkus.slice(i, i + 500);
    const rows = await q(c, `SELECT upper(p.sku) AS sku, trim(l.line) AS line
      FROM inventory.products p JOIN inventory.product_history h ON h.inventory_id = p.id,
      LATERAL unnest(string_to_array(h.history, E'\\n')) AS l(line)
      WHERE upper(p.sku) = ANY($1) AND trim(l.line) <> ''
        AND (l.line ILIKE '%UK stock changes%' OR trim(l.line) ILIKE 'Supply%'
          OR trim(l.line) ILIKE 'German Supply%' OR l.line ~* 'german ?Inventory +Changed +from')`,
      [batch]);
    rows.forEach(r => { (hist[r.sku] = hist[r.sku] || []).push(r.line); });
  }
  let corroborated = 0, uncorroborated = 0;
  const unc = [];
  stockDiff.forEach(d => {
    const lines = hist[d.sku] || [];
    // a movement AFTER the extraction date, naming this warehouse's field
    const hit = lines.some(l => {
      const ms = parseLine(l);
      return ms.some(m => m.dt >= EXTRACTED &&
        (m.tl === WHN[d.wh] || (d.wh === 10 && m.tl === 'German') || (d.wh === 7 && m.tl === 'German')));
    });
    if (hit) corroborated++; else { uncorroborated++; unc.push(d); }
  });
  console.log('  REAL (history since ' + EXTRACTED + ' names that warehouse):', corroborated,
              '(' + pct(corroborated, stockDiff.length) + '%)');
  console.log('  UNCORROBORATED                                      :', uncorroborated,
              '(' + pct(uncorroborated, stockDiff.length) + '%)');
  if (unc.length && VERBOSE){
    console.log('    ' + unc.slice(0, 20).map(d => d.sku + ' ' + WHN[d.wh] + ' ' + d.oldV + '->' + d.newV).join('\n    '));
  }

  fs.writeFileSync(path.join(__dirname, 'compare-stock-diff.json'), JSON.stringify(stockDiff));
  fs.writeFileSync(path.join(__dirname, 'compare-uncorroborated.json'), JSON.stringify(unc));

  await c.end();

  console.log('\n=== SUMMARY SO FAR ===');
  report.forEach(r => console.log('  ' + pad(r[0], 16) + 'total ' + pad(r[1].toLocaleString(), 10) +
    'same ' + pad(r[2].toLocaleString(), 10) + 'added ' + pad(r[3], 7) + 'changed ' + r[4]));
})().catch(e => { console.error(String(e.message)); process.exit(1); });
