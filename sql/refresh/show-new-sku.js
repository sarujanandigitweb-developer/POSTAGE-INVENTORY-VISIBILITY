'use strict';
// Shows, in full, what the refresh would do with the SKUs Postgres has that the
// dashboard does not — so a new arrival can be checked by eye before anything ships.
//
//   node sql/refresh/show-new-sku.js            one worked example
//   node sql/refresh/show-new-sku.js LSBF3BWG   a named SKU
//   node sql/refresh/show-new-sku.js --list 20  the first 20, one line each
const fs = require('fs');
const path = require('path');
const { load } = require('./rules.js');
const { connect, q } = require('./db.js');

const ROOT = path.resolve(__dirname, '..', '..');
const R = load();
const table = JSON.parse(fs.readFileSync(path.join(__dirname, 'prefix-table.json'), 'utf8'));
const classify = sku => table.find(t => sku.indexOf(t.p) === 0) || null;

const today = new Set();
Object.keys(R.CATS).forEach(k => R.CATS[k].data.forEach(r => today.add(r.s)));
const live = fs.readFileSync(path.join(ROOT, 'sql', 'live-skus.txt'), 'utf8').split('\n').filter(Boolean);
const added = live.filter(s => !today.has(s));

const NAME = { CR:'Ceiling Rose', LS:'Lampshade', PH:'Pendant Lamp Holder', WA:'Wall Arm',
               LH:'Lamp Holder', LB:'Bulbs', SPR:'Lamp Spares', LGT:'Lighting',
               CSM:'Cosmetics', CLO:'Clothes', HAP:'Home Appliances', RFB:'Refurbished',
               OTHER:'Other' };
const WH = { 1:'UK Unit 3', 8:'UK Unit 4', 6:'UK Unit 18', 33:'UK Unit 5',
             10:'German Kronen', 7:'German Schmutter', 4:'Canada', 32:'US' };

(async () => {
  const arg = process.argv[2];
  if (arg === '--list'){
    const n = Number(process.argv[3] || 20);
    console.log(added.length + ' SKUs Postgres has that the dashboard does not. First ' + n + ':');
    added.slice(0, n).forEach(s => {
      const c = classify(s);
      console.log('  ' + s.padEnd(18) + (c ? (NAME[c.key] + ' / ' + c.t) : 'Other (no rule)'));
    });
    return;
  }

  // pick a worked example: a newly added SKU that actually carries stock
  const c = await connect();
  let sku = arg && added.indexOf(arg.toUpperCase()) !== -1 ? arg.toUpperCase() : null;
  if (!sku){
    const withStock = await q(c, `SELECT upper(p.sku) AS sku
      FROM inventory.products p
      WHERE upper(p.sku) = ANY($1)
        AND EXISTS (SELECT 1 FROM inventory.physical_product_stock s
                    WHERE s.inventory = p.id AND s.quantity > 0)
      ORDER BY upper(p.sku) LIMIT 1`, [added]);
    sku = withStock.length ? withStock[0].sku : added[0];
  }

  const rule = classify(sku);
  const p = await q(c, `SELECT id, sku, description, title, inventory_bool, created_at
                        FROM inventory.products WHERE upper(sku) = $1 LIMIT 1`, [sku]);
  const row = p[0];

  console.log('=== ' + sku + ' ===');
  console.log('description   :', String(row.description || '(none)').replace(/\s+/g, ' ').trim());
  console.log('added to LEDSone:', row.created_at ? row.created_at.toISOString().slice(0, 10) : '(unknown)');
  console.log('inventory_bool:', row.inventory_bool);

  console.log('\n-- where the refresh would file it --');
  if (!rule){ console.log('  Other — no prefix rule matches. Kept, not dropped.'); }
  else {
    console.log('  section     :', NAME[rule.key]);
    console.log('  type        :', rule.t);
    console.log('  family code :', rule.f);
    console.log('  matched rule: prefix "' + rule.p + '" (' + rule.n + ' existing SKUs share it)');
  }

  const st = await q(c, `SELECT warehouse, quantity, product_shelf_location
                         FROM inventory.physical_product_stock
                         WHERE inventory = $1 AND quantity <> 0 ORDER BY warehouse`, [row.id]);
  console.log('\n-- stock --');
  if (!st.length) console.log('  none anywhere');
  st.forEach(s => console.log('  ' + (WH[s.warehouse] || ('warehouse ' + s.warehouse)).padEnd(18) +
    String(s.quantity).padStart(7) + '   ' + (s.product_shelf_location || '-')));

  const px = await q(c, `SELECT channel, min(price) AS p
    FROM listings.shopify_listings
    WHERE COALESCE(wrong_sku,0)=0 AND all_list=1 AND price>0
      AND upper(COALESCE(NULLIF(mapped_sku,''), sku)) = $1
    GROUP BY channel ORDER BY 1`, [sku]);
  console.log('\n-- Shopify, exact SKU --');
  if (!px.length) console.log('  no exact listing (the refresh would then try combo, then pack)');
  px.forEach(x => console.log('  ' + x.channel.padEnd(18) + x.p));

  const h = await q(c, `SELECT trim(l.line) AS line
    FROM inventory.product_history hh,
    LATERAL unnest(string_to_array(hh.history, E'\\n')) AS l(line)
    WHERE hh.inventory_id = $1 AND trim(l.line) <> ''
      AND (l.line ILIKE '%UK stock changes%' OR trim(l.line) ILIKE 'Supply%'
        OR trim(l.line) ILIKE 'German Supply%' OR l.line ~* 'german ?Inventory +Changed +from')
    LIMIT 4`, [row.id]);
  console.log('\n-- history (the four types) --');
  if (!h.length) console.log('  no stock movement recorded');
  h.forEach(x => console.log('  ' + x.line.slice(0, 110)));

  console.log('\n-- why it is not on the dashboard today --');
  console.log('  The six sheet-defined sections were populated from the components');
  console.log('  Google Sheet. This SKU is in Postgres but not on that sheet, so it has');
  console.log('  never appeared. The refresh takes membership from Postgres instead.');

  await c.end();
})().catch(e => { console.error(String(e.message)); process.exit(1); });
