'use strict';
// Builds every dashboard data block from live Postgres. WRITES NO HTML — it emits JSON
// into sql/refresh/out/ for apply.js to install.
//
// THE CENTRAL RULE: an existing SKU keeps the classification it already has.
// The embedded arrays on disk are the authority for `f`, `t`, `x`, `mt`, `sh`, `ft` and
// `sr`. Only the volatile fields are refreshed — description, image, stock, shelf
// locations, price, comment, containers, received, history. Nothing reclassifies a SKU
// that is already placed, so the validated logic cannot drift.
//
// A SKU that Postgres has and the dashboard does not is classified by rules DERIVED FROM
// THOSE SAME ARRAYS (longest prefix wins), and where no rule matches, by the page's own
// two-character CLASSIFY table so it lands in the right section's existing Others
// bucket. A SKU matching neither is reported, never silently dropped.
//
//   node sql/refresh/build.js
const fs = require('fs');
const path = require('path');
const { connect } = require('./db.js');
const { read } = require('./raw-arrays.js');
const { load } = require('./rules.js');

const P = require('./extract/products.js');
const S = require('./extract/stock.js');
const C = require('./extract/containers.js');
const H = require('./extract/history.js');
const PR = require('./extract/price.js');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'out');
const log = (...a) => console.log('[build]', ...a);

// which array a NEW SKU joins, per section. The "EXTRA" arrays are the established home
// for prefix-added rows; LB_EXTRA additionally requires the x:1 flag.
const NEW_HOME = { CR:'DATA', LS:'LS_EXTRA', PH:'PH_DATA', WA:'WA_DATA', LB:'LB_EXTRA',
                   LH:'LH_EXTRA', SPR:'SPR_DATA', LGT:'LGT_DATA', CSM:'CSM_DATA',
                   CLO:'CLO_DATA', HAP:'HAP_DATA', RFB:'RFB_DATA' };
const NEEDS_X = { LB_EXTRA: 1, LS_EXTRA: 1, SPR_DATA: 1, LGT_DATA: 1, CSM_DATA: 1,
                  CLO_DATA: 1, HAP_DATA: 1, RFB_DATA: 1 };

// IMAGE URLs. The page normalises most arrays with imgURL() at load, turning a bare
// "2905.jpg" into a full URL. Two arrays are NOT in any of those loops — `DATA` and
// `LH_EXTRA` — so whatever they hold is used verbatim as the <img src>.
//
// `DATA` therefore has to carry ABSOLUTE urls; writing bare filenames into it would
// 404 every Ceiling Rose thumbnail. `LH_EXTRA` holds bare filenames today and its 190
// images are consequently already broken — emitting absolute urls fixes that too.
const NO_IMG_NORM = { DATA: 1, LH_EXTRA: 1 };
const IMG_BASE = (function(){
  const html = fs.readFileSync(path.join(ROOT, 'dashboard', 'inventory-dashboard.html'), 'utf8');
  const m = /const LS_IMG_BASE = '([^']+)'/.exec(html);
  if (!m) throw new Error('LS_IMG_BASE not found — cannot build absolute image urls');
  return m[1];
})();
const imgFor = (arr, img) => !img ? undefined
  : (NO_IMG_NORM[arr] && !/^https?:\/\//i.test(img)) ? IMG_BASE + img : img;

// ---- prefix rules, induced from the RAW arrays -----------------------------
function derive(bySku){
  const rows = Object.keys(bySku).map(s => ({ s, ...bySku[s].row, arr: bySku[s].arr, key: bySku[s].key }));
  const sig = r => r.key + '' + r.arr + '' + r.f + '' + r.t;
  const table = [], covered = new Set();
  for (let len = 2; len <= 12; len++){
    const g = {};
    rows.forEach(r => { if (covered.has(r.s) || r.s.length < len) return;
                        (g[r.s.slice(0, len)] = g[r.s.slice(0, len)] || []).push(r); });
    Object.keys(g).forEach(p => {
      const set = g[p];
      if (new Set(set.map(sig)).size !== 1) return;
      if (rows.some(r => !covered.has(r.s) && r.s.indexOf(p) === 0 && sig(r) !== sig(set[0]))) return;
      const o = set[0];
      table.push({ p, key: o.key, arr: o.arr, f: o.f, t: o.t });
      set.forEach(r => covered.add(r.s));
    });
  }
  table.sort((a, b) => b.p.length - a.p.length || a.p.localeCompare(b.p));
  return table;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const started = Date.now();
  const { arrays, bySku } = read();
  const R = load();
  const table = derive(bySku);
  log('raw arrays read:', Object.keys(arrays).length, '· existing SKUs', Object.keys(bySku).length,
      '· prefix rules derived', table.length);

  const c = await connect();
  log('connected');

  // ---- extract -------------------------------------------------------------
  const prod = await P.extract(c);
  log('products          :', prod.count);
  const pids = prod.rows.map(r => r.pid);
  const stock = await S.extract(c, pids);
  log('stock rows        :', Object.keys(stock.st).length,
      '· warehouses named', Object.keys(stock.names).length,
      stock.missing.length ? '· NO master row for ' + stock.missing.join(',') : '');
  const cont = await C.extract(c);
  log('arrived containers:', cont.arrived.length, '· incoming SKUs', Object.keys(cont.incoming).length);
  const price = await PR.extract(c);
  log('listing SKUs      :', Object.keys(price.listing).length,
      '· pack codes', Object.keys(price.packs).length);

  const liveSkus = prod.rows.map(r => r.sku);
  const hist = await H.extract(c, liveSkus);
  log('history lines     :', hist.lineCount, '· movements', hist.parsed,
      '· SKUs', Object.keys(hist.moves).length);
  await c.end();

  // ---- place every live SKU ------------------------------------------------
  const out = {}; Object.keys(arrays).forEach(k => { out[k] = []; });
  const classify = s => { for (let i = 0; i < table.length; i++) if (s.indexOf(table[i].p) === 0) return table[i]; return null; };
  const kept = [], added = [], sectionOnly = [], unplaced = [];

  liveSkus.forEach(sku => {
    const p = prod.bySku[sku];
    const st = S.rowFields(stock.st, p.pid);
    const existing = bySku[sku];
    let row, arr;

    if (existing){
      // keep every classification field exactly as it is on disk
      const o = existing.row;
      arr = existing.arr;
      row = { s: sku };
      ['f','t','x','mt','sh','ft','sr','gp'].forEach(k => { if (o[k] !== undefined) row[k] = o[k]; });
      kept.push(sku);
    } else {
      const rule = classify(sku);
      if (rule){ arr = rule.arr; row = { s: sku, f: rule.f, t: rule.t }; }
      else {
        const two = R.CLASSIFY[sku.slice(0, 2)];
        if (!two){ unplaced.push(sku); return; }
        arr = NEW_HOME[two.key];
        row = { s: sku, t: 'Others' };            // the page's Others pass assigns f
        sectionOnly.push(sku);
      }
      if (NEEDS_X[arr]) row.x = 1;
      added.push(sku);
    }

    if (p.d) row.d = p.d;
    const img = imgFor(arr, p.img);
    if (img) row.i = img;
    Object.keys(st).forEach(k => { if (st[k] !== undefined) row[k] = st[k]; });
    out[arr].push(row);
  });

  Object.keys(out).forEach(k => out[k].sort((a, b) => a.s.localeCompare(b.s)));

  log('kept              :', kept.length);
  log('added             :', added.length, '(' + (added.length - sectionOnly.length) +
      ' by prefix, ' + sectionOnly.length + ' to a section Others bucket)');
  log('UNPLACED          :', unplaced.length, unplaced.length ? '— reported, not dropped' : '');

  // ---- lookups -------------------------------------------------------------
  const wh5 = {};
  liveSkus.forEach(s => { const e = (stock.st[prod.bySku[s].pid] || {})[33];
                          if (e && e.q) wh5[s] = e.q; });
  const last = C.lastContainer(cont.byRegion, liveSkus);
  const { raw: histRaw, carried } = H.histRaw(hist.moves);
  const { lookup: received, matched, unmatched } = H.receivedLookup(hist.received, cont.byRegion, liveSkus);

  // INCOMING keeps its interned shape: sku -> "containerIdx,stageIdx"
  const incNames = [], incStages = ['Confirmed','Production done','Shipped','Ordered'];
  const incoming = {};
  liveSkus.forEach(s => {
    const e = cont.incoming[s];
    if (!e) return;
    let ci = incNames.indexOf(e.name); if (ci < 0){ incNames.push(e.name); ci = incNames.length - 1; }
    const si = incStages.indexOf(e.stage);
    incoming[s] = ci + ',' + (si < 0 ? 3 : si);
  });

  const meta = {
    generated: new Date().toISOString(),
    products: prod.count, kept: kept.length, added: added.length,
    sectionOnly: sectionOnly.length, unplaced,
    rows: Object.keys(out).reduce((n, k) => n + out[k].length, 0),
    sections: Object.keys(out).reduce((o, k) => (o[k] = out[k].length, o), {}),
    historySkus: Object.keys(histRaw.h).length, historyCarried: carried,
    wh5: Object.keys(wh5).length, lastContainer: Object.keys(last.c).length,
    received: Object.keys(received.r).length, receivedMatched: matched, receivedUnmatched: unmatched,
    incoming: Object.keys(incoming).length,
    warehousesMissingMaster: stock.missing,
    ms: Date.now() - started
  };

  const write = (n, v) => fs.writeFileSync(path.join(OUT, n), JSON.stringify(v));
  Object.keys(out).forEach(k => write('array_' + k + '.json', out[k]));
  write('WH5_STOCK.json', wh5);
  write('LAST_CONTAINER.json', last);
  write('HIST_RAW.json', histRaw);
  write('RECEIVED.json', received);
  write('INCOMING.json', { INCOMING: incoming, INC_CONTAINER: incNames, INC_STAGE: incStages });
  write('_prefix-table.json', table);
  write('_meta.json', meta);
  // price + comments are produced by the existing validated builder, fed this listing set
  write('_listing.json', { listing: price.listing, packs: price.packs, skus: liveSkus });

  log('rows built        :', meta.rows, JSON.stringify(meta.sections));
  log('history           :', meta.historySkus, 'SKUs /', meta.historyCarried, 'carried');
  log('received          :', meta.received, '(' + matched + ' containers matched)');
  log('written to        :', OUT);
  log('took              :', (meta.ms / 1000).toFixed(1) + 's');
})().catch(e => { console.error('[build] FAILED: ' + e.message); process.exit(1); });
