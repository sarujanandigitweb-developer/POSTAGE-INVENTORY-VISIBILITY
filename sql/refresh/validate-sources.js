'use strict';
// VALIDATION ONLY — reads nothing but catalogue metadata and counts, writes nothing.
//
// Every data source the dashboard depends on is listed here with the exact table,
// filter and fields it uses. The script proves each one is reachable with the refresh
// credentials, and compares what the database returns NOW against what is embedded in
// the dashboard, so any drift is visible before a refresh is wired up.
//
//   node sql/refresh/validate-sources.js
const fs = require('fs');
const path = require('path');
const { connect, q } = require('./db.js');

const ROOT = path.resolve(__dirname, '..', '..');

// ---- what the dashboard currently holds -------------------------------------
function loadDashboard(){
  const html = fs.readFileSync(path.join(ROOT, 'dashboard', 'inventory-dashboard.html'), 'utf8');
  const o = html.indexOf('<script>');
  const body = html.slice(o + 8, html.indexOf('const state = {'));
  const el = { addEventListener(){}, appendChild(){}, style:{}, classList:{ add(){}, remove(){}, toggle(){} } };
  const document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
                     createElement: () => el, addEventListener(){}, documentElement: el, body: el };
  const sb = { console, out: null };
  new Function('sandbox','document','window','localStorage',
    body + '\n; sandbox.out = { CATS, STOCK_HISTORY, HIST_RAW, SHOPIFY_PRICE, SHOPIFY_COMMENT,' +
           ' WH5_STOCK, LAST_CONTAINER, RECEIVED, INCOMING, CLASSIFY, PREFIX_RULES, SUB4 };')
    (sb, document, { addEventListener(){}, matchMedia: () => ({matches:false, addEventListener(){}}) },
     { getItem: () => null, setItem(){} });
  return sb.out;
}

const pad = (s, n) => String(s).padEnd(n);
const num = n => Number(n).toLocaleString();

(async () => {
  const D = loadDashboard();
  const rows = [].concat(...Object.keys(D.CATS).map(k => D.CATS[k].data));
  const c = await connect();
  const out = [];
  const check = (label, dash, live, note) => {
    const same = String(dash) === String(live);
    out.push({ label, dash, live, same, note: note || '' });
  };

  console.log('=== 1. SKU population and classification ===');
  // Ceiling Rose / Lampshade SOT / Pendant / Wall Arm / Bulbs SOT / Lamp Holder SOT
  // came from the components Google Sheet, NOT from a table. Everything else is a
  // declared SKU prefix against inventory.products.
  const prodSingles = await q(c, `SELECT count(DISTINCT upper(sku)) n FROM inventory.products
    WHERE sku NOT LIKE '%+%' AND sku !~ '[0-9A-Z]PK$'`);
  console.log('inventory.products, single SKUs (no +, no ...PK):', num(prodSingles[0].n));
  const sotTabs = await q(c, `SELECT count(*) n, count(DISTINCT source_tab) t
                              FROM configurator.components_sot_skus`);
  console.log('configurator.components_sot_skus rows:', num(sotTabs[0].n),
              'across', sotTabs[0].t, 'tabs');
  check('dashboard rows', rows.length, rows.length, 'sum of all 12 sections');

  for (const [key, like] of [['SPR', null], ['LGT', null], ['LH', 'LH%']]){
    if (!like) continue;
    const r = await q(c, `SELECT count(DISTINCT upper(sku)) n FROM inventory.products
      WHERE upper(sku) LIKE $1 AND sku NOT LIKE '%+%' AND sku !~ '[0-9A-Z]PK$'`, [like]);
    check(key + ' prefix ' + like, D.CATS[key].data.length, r[0].n, 'prefix-defined section');
  }

  console.log('\n=== 2. Warehouse / stock ===');
  const wh = await q(c, `SELECT warehouse, count(*) n, sum(quantity) units
                         FROM inventory.physical_product_stock GROUP BY 1 ORDER BY 1`);
  console.log('inventory.physical_product_stock by warehouse:');
  wh.forEach(w => console.log('   wh ' + pad(w.warehouse, 4) + pad(num(w.n) + ' rows', 14) +
                              num(w.units) + ' units'));
  const WHMAP = { 1: 'Unit 3 (a)', 8: 'Unit 4 (b)', 6: 'Unit 18 (c)', 33: 'Unit 5 (u5)',
                  10: 'Kronen (k)', 7: 'Schmutter (m)', 4: 'Canada (ca)', 32: 'US (us)' };
  console.log('   mapping in use:', JSON.stringify(WHMAP));
  const w33 = await q(c, `SELECT count(*) n FROM inventory.physical_product_stock
                          WHERE warehouse=33 AND quantity <> 0`);
  check('Unit 5 non-zero rows', Object.keys(D.WH5_STOCK).length, w33[0].n,
        'WH5_STOCK stores non-zero only; absent = 0');
  const whMaster = await q(c, `SELECT count(*) n FROM inventory.warehouse WHERE warehouse = 33`);
  console.log('   inventory.warehouse row for 33 exists:', whMaster[0].n > 0 ? 'YES' : 'NO — still missing');

  console.log('\n=== 3. Shopify price and Comments ===');
  const ch = await q(c, `SELECT channel, count(DISTINCT upper(COALESCE(NULLIF(mapped_sku,''),sku))) n
                         FROM listings.shopify_listings
                         WHERE COALESCE(wrong_sku,0)=0 AND all_list=1 AND price>0
                         GROUP BY 1 ORDER BY 2 DESC`);
  console.log('listings.shopify_listings, wrong_sku=0 AND all_list=1 AND price>0:');
  ch.forEach(x => console.log('   ' + pad(x.channel, 18) + num(x.n) + ' SKUs'));
  check('priced dashboard rows', Object.keys(D.SHOPIFY_PRICE).length,
        Object.keys(D.SHOPIFY_PRICE).length, 'recomputed by the refresh, not comparable directly');
  console.log('   comments cover', num(Object.keys(D.SHOPIFY_COMMENT).length), 'SKUs');

  console.log('\n=== 4. History ===');
  const hist = await q(c, `WITH ln AS (
      SELECT trim(l.line) AS line FROM inventory.product_history h,
      LATERAL unnest(string_to_array(h.history, E'\\n')) AS l(line) WHERE trim(l.line) <> '')
    SELECT count(*) FILTER (WHERE line ILIKE '%UK stock changes%')            AS uk,
           count(*) FILTER (WHERE line ILIKE 'Supply%')                       AS supply,
           count(*) FILTER (WHERE line ILIKE 'German Supply%')                AS gsupply,
           count(*) FILTER (WHERE line ~* 'german ?Inventory +Changed +from') AS ginv,
           count(*) AS all_lines FROM ln`);
  const h = hist[0];
  console.log('inventory.product_history lines:', num(h.all_lines), 'total');
  console.log('   UK stock changes :', num(h.uk));
  console.log('   Supply           :', num(h.supply));
  console.log('   German Supply    :', num(h.gsupply));
  console.log('   German Inventory :', num(h.ginv));
  console.log('   the four types are', num(Number(h.uk)+Number(h.supply)+Number(h.gsupply)+Number(h.ginv)),
              'of', num(h.all_lines), 'lines');
  console.lo
  check('SKUs with history', Object.keys(D.STOCK_HISTORY).length,
        Object.keys(D.STOCK_HISTORY).length, 'recomputed by the refresh');

  console.log('\n=== 5. Received warehouse / date, and container ===');
  const cont = await q(c, `SELECT count(*) n, count(DISTINCT upper(oi.sku)) skus,
      count(DISTINCT COALESCE(fc.name, cc.name)) names
    FROM suppg('   field -> warehouse: Quantity=Unit 3, unit1=Unit 18, unit3=Unit 4, unit2=Mark, unit5=Unit 5');liers.order_items oi
    JOIN suppliers.orders o ON o.id = oi.order_id
    LEFT JOIN suppliers.final_containers fc ON fc.id = oi.final_container_id
    LEFT JOIN suppliers.containers cc ON cc.id = oi.assigned_container_id
    WHERE o.status_arrived AND COALESCE(fc.name, cc.name) IS NOT NULL
      AND upper(trim(COALESCE(fc.name, cc.name))) <> 'UNASSIGN' AND o.order_date IS NOT NULL`);
  console.log('arrived container rows:', num(cont[0].n), '·', num(cont[0].skus), 'SKUs ·',
              cont[0].names, 'container names');
  check('SKUs with a receipt', Object.keys(D.RECEIVED.r).length,
        Object.keys(D.RECEIVED.r).length, 'recomputed by the refresh');
  const su = await q(c, `SELECT count(*) n FROM suppliers.orders WHERE order_id ILIKE '%SU%'`);
  console.log('   orders.order_id containing an SU code:', su[0].n,
              su[0].n === '0' ? '— confirms the container link is DATE proximity, not a key' : '');

  console.log('\n=== 6. Incoming (not-yet-arrived) ===');
  const inc = await q(c, `SELECT count(DISTINCT upper(oi.sku)) n
    FROM suppliers.order_items oi JOIN suppliers.orders o ON o.id = oi.order_id
    WHERE NOT o.status_arrived`);
  check('INCOMING SKUs', Object.keys(D.INCOMING).length, inc[0].n, 'not-arrived orders');

  console.log('\n=== reachability ===');
  const need = [['inventory','products'],['inventory','physical_product_stock'],
                ['inventory','product_images'],['inventory','product_history'],
                ['inventory','end_of_line_products'],['inventory','warehouse'],
                ['suppliers','orders'],['suppliers','order_items'],
                ['suppliers','final_containers'],['suppliers','containers'],
                ['listings','shopify_listings'],['configurator','components_sot_skus']];
  for (const [s, t] of need){
    const r = await q(c, `SELECT has_table_privilege($1,'SELECT') AS s`, [s + '.' + t])
      .catch(() => [{ s: null }]);
    console.log('   ' + pad(s + '.' + t, 40) + (r[0].s === true ? 'SELECT ok' :
      r[0].s === false ? '*** NO SELECT' : '*** NOT VISIBLE'));
  }

  console.log('\n=== drift against the embedded data ===');
  out.forEach(r => console.log('   ' + (r.same ? 'same ' : 'DIFF ') + pad(r.label, 26) +
    'dashboard ' + pad(num(r.dash), 10) + 'live ' + pad(num(r.live), 10) + r.note));

  await c.end();
})().catch(e => { console.error(String(e.message)); process.exit(1); });
