'use strict';
// Random spot-check: takes N SKUs already on the dashboard, pulls what Postgres holds
// for them RIGHT NOW, and compares field by field. Read-only, nothing is written.
//
// This answers "is the data on screen still true?" — the question a refresh exists to
// fix. Every disagreement is a number a picker is reading today that is wrong.
//
//   node sql/refresh/random-check.js [count] [--seed N] [--all]
const fs = require('fs');
const path = require('path');
const { load } = require('./rules.js');
const { connect, q } = require('./db.js');

const ROOT = path.resolve(__dirname, '..', '..');
const R = load();
const rows = [].concat(...Object.keys(R.CATS).map(k => R.CATS[k].data.map(r => ({ ...r, key: k }))));

const N = Number(process.argv[2]) || 40;
const seedArg = process.argv.indexOf('--seed');
let seed = seedArg > 0 ? Number(process.argv[seedArg + 1]) : 20260827;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

const pick = [];
const used = new Set();
while (pick.length < Math.min(N, rows.length)){
  const i = Math.floor(rnd() * rows.length);
  if (used.has(i)) continue;
  used.add(i); pick.push(rows[i]);
}

// dashboard column -> warehouse id
const COL = { a: 1, b: 8, c: 6, u5: 33, k: 10, m: 7, ca: 4, us: 32 };
const LOC = { al: 1, bl: 8, kl: 10, ml: 7 };
const WHN = { 1:'Unit 3', 8:'Unit 4', 6:'Unit 18', 33:'Unit 5', 10:'Kronen', 7:'Schmutter', 4:'CA', 32:'US' };

(async () => {
  const c = await connect();
  const skus = pick.map(r => r.s);

  const live = {};
  (await q(c, `SELECT upper(p.sku) AS sku, p.id,
                      regexp_replace(trim(COALESCE(p.description,'')),'\\s+',' ','g') AS d
               FROM inventory.products p WHERE upper(p.sku) = ANY($1)`, [skus]))
    .forEach(r => { live[r.sku] = { id: r.id, d: r.d, st: {}, loc: {} }; });

  const ids = Object.values(live).map(v => v.id);
  const byId = {};
  Object.keys(live).forEach(s => { byId[live[s].id] = s; });
  (await q(c, `SELECT inventory, warehouse, quantity,
                      NULLIF(NULLIF(trim(product_shelf_location),''),'-') AS loc
               FROM inventory.physical_product_stock WHERE inventory = ANY($1)`, [ids]))
    .forEach(r => { const s = byId[r.inventory]; if (!s) return;
                    live[s].st[r.warehouse] = r.quantity; live[s].loc[r.warehouse] = r.loc; });

  // price: exact SKU, LEDSone first, then any other UK channel
  const px = {};
  (await q(c, `SELECT upper(COALESCE(NULLIF(mapped_sku,''),sku)) AS sku, channel, min(price) AS p
               FROM listings.shopify_listings
               WHERE COALESCE(wrong_sku,0)=0 AND all_list=1 AND price>0
                 AND upper(COALESCE(NULLIF(mapped_sku,''),sku)) = ANY($1)
               GROUP BY 1,2`, [skus]))
    .forEach(r => { (px[r.sku] = px[r.sku] || {})[r.channel] = Number(r.p); });
  const UK_ORDER = ['LEDSone','Electricalsone','Vintagelite','BesBet','Dcvoltage','dcvoltage'];
  const ukPrice = s => { const e = px[s]; if (!e) return null;
    for (const ch of UK_ORDER) if (e[ch] !== undefined) return e[ch]; return null; };

  // ---- compare -------------------------------------------------------------
  let clean = 0, notCompared = 0;
  const diffs = [];
  pick.forEach(r => {
    const L = live[r.s];
    const bad = [];
    if (!L){ diffs.push([r, ['GONE from inventory.products']]); return; }

    Object.keys(COL).forEach(col => {
      const dash = r[col];
      const db = L.st[COL[col]];
      const dbv = db === undefined ? 0 : Number(db);
      const dv = dash === null || dash === undefined ? 0 : Number(dash);
      if (dv !== dbv) bad.push(WHN[COL[col]] + ' stock ' + dv + ' -> ' + dbv);
    });
    Object.keys(LOC).forEach(col => {
      const dash = r[col] || null;
      const db = L.loc[LOC[col]] || null;
      if ((dash || '') !== (db || '')) bad.push(WHN[LOC[col]] + ' shelf ' + (dash || '-') + ' -> ' + (db || '-'));
    });
    // Price is only comparable where the dashboard took it from the EXACT SKU. On a
    // combo or pack row the number comes from a different listing entirely, and looking
    // up the bare SKU would report a difference that does not exist — it did, on 5 of
    // the first 40 sampled, until this guard was added.
    const exactPriced = r.cm === 'Standalone — no extra item';
    if (exactPriced){
      const lp = ukPrice(r.s);
      const dp = typeof r.p === 'number' ? r.p : null;
      if (lp !== null && dp !== null && Math.abs(lp - dp) > 0.005) bad.push('price ' + dp + ' -> ' + lp);
      else if (lp !== null && dp === null) bad.push('price none -> ' + lp);
      else if (lp === null && dp !== null) bad.push('price ' + dp + ' -> delisted');
    } else notCompared++;

    if (bad.length) diffs.push([r, bad]); else clean++;
  });

  console.log('random sample : ' + pick.length + ' SKUs (seed ' + (seedArg > 0 ? process.argv[seedArg+1] : '20260827') + ')');
  console.log('identical     : ' + clean);
  console.log('price not compared (combo/pack priced): ' + notCompared);
  console.log('DIFFERENT     : ' + diffs.length +
              '  (' + (100 * diffs.length / pick.length).toFixed(0) + '% of the sample)');

  if (diffs.length){
    console.log('\ndashboard -> Postgres now');
    diffs.slice(0, process.argv.indexOf('--all') > 0 ? 999 : 25).forEach(([r, bad]) => {
      console.log('\n  ' + r.s + '   [' + r.key + ' / ' + (r.sc || r.t) + ']');
      bad.forEach(b => console.log('      ' + b));
    });
  }

  // how big is the drift overall, on the stock columns only
  let cells = 0, moved = 0, unitsBefore = 0, unitsAfter = 0;
  pick.forEach(r => { const L = live[r.s]; if (!L) return;
    Object.keys(COL).forEach(col => {
      cells++;
      const dv = Number(r[col] || 0), bv = Number(L.st[COL[col]] === undefined ? 0 : L.st[COL[col]]);
      unitsBefore += dv > 0 ? dv : 0; unitsAfter += bv > 0 ? bv : 0;
      if (dv !== bv) moved++;
    });
  });
  console.log('\nstock cells compared : ' + cells + ', changed ' + moved +
              ' (' + (100 * moved / cells).toFixed(1) + '%)');
  console.log('units in the sample  : ' + unitsBefore.toLocaleString() +
              ' on the dashboard -> ' + unitsAfter.toLocaleString() + ' in Postgres now');

  await c.end();
})().catch(e => { console.error(String(e.message)); process.exit(1); });
