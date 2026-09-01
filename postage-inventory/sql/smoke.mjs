// Connectivity + shape check. Prints no credentials, writes nothing.
import { query } from '../lib/pg-core.js';

const rows = await query(`
  SELECT current_database() AS db, current_user AS usr,
         (SELECT count(*)::int FROM information_schema.schemata
           WHERE schema_name NOT IN ('pg_catalog','information_schema')) AS schemas`);
console.log('  connected  :', rows[0].db, 'as', rows[0].usr, '·', rows[0].schemas, 'schemas');

// taken from the working extract scripts in ../sql/refresh/extract, not guessed
const need = [
  ['inventory', 'products'], ['inventory', 'physical_product_stock'], ['inventory', 'warehouse'],
  ['inventory', 'product_images'], ['inventory', 'product_pk'], ['inventory', 'product_history'],
  ['listings', 'shopify_listings'], ['listings', 'ebay_listings'],
  ['listings', 'amazon_listings'], ['listings', 'bandq_listings'],
  ['order_management', 'orders'], ['order_management', 'order_item_info'],
  ['order_management', 'order_combo'], ['order_management', 'shipment'],
  ['order_management', 'carrier_service'], ['order_management', 'market_place'],
  ['staff', 'users'], ['staff', 'ph_categories'], ['staff', 'ph_category_products'],
  ['suppliers', 'containers'], ['suppliers', 'final_containers'], ['suppliers', 'orders'],
];
const found = await query(
  `SELECT table_schema, table_name FROM information_schema.tables
    WHERE (table_schema, table_name) IN (${need.map((_, i) => `($${i * 2 + 1},$${i * 2 + 2})`).join(',')})`,
  need.flat());
const set = new Set(found.map(r => r.table_schema + '.' + r.table_name));
console.log('  tables the dashboard needs:');
for (const [s, t] of need) console.log('    ' + (set.has(s + '.' + t) ? 'OK  ' : '*** ') + s + '.' + t);
process.exit(0);
