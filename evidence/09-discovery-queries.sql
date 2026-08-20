-- Evidence 09 — Read-only discovery queries executed against LEDSone MCP
-- Date: 2026-08-20. ALL statements are SELECT-only. No DDL, no DML.

-- [1] Schema / table inventory
SELECT table_schema, table_name, table_type FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY 1,2;

-- [2] Column definitions for the inventory schema
SELECT table_schema, table_name, ordinal_position, column_name, data_type, is_nullable
FROM information_schema.columns WHERE table_schema='inventory' ORDER BY table_name, ordinal_position;

-- [3] Warehouse master
SELECT * FROM inventory.warehouse ORDER BY warehouse;

-- [4] CRSF/CRFF prefix population + duplicate check
SELECT CASE WHEN upper(sku) LIKE 'CRSF%' THEN 'CRSF' ELSE 'CRFF' END AS prefix,
       count(*) row_count, count(DISTINCT sku) distinct_sku, count(DISTINCT id) distinct_id,
       count(*) FILTER (WHERE inventory_bool) inventory_bool_true
FROM inventory.products WHERE upper(sku) LIKE 'CRSF%' OR upper(sku) LIKE 'CRFF%' GROUP BY 1;

-- [5] Single vs combo/bundle SKU split
SELECT CASE WHEN upper(sku) LIKE 'CRSF%' THEN 'CRSF' ELSE 'CRFF' END AS prefix,
       CASE WHEN sku LIKE '%+%' THEN 'combo/bundle' ELSE 'single' END AS sku_shape, count(*)
FROM inventory.products WHERE upper(sku) LIKE 'CRSF%' OR upper(sku) LIKE 'CRFF%' GROUP BY 1,2;

-- [6] Ceiling rose SOT population
SELECT source_tab, count(*) skus,
       count(*) FILTER (WHERE upper(sku) LIKE 'CRSF%') crsf,
       count(*) FILTER (WHERE upper(sku) LIKE 'CRFF%') crff, max(synced_at) last_sync
FROM configurator.components_sot_skus GROUP BY 1;

-- [7] fitting_type / product_type / product_subtype attribute values
SELECT CASE WHEN upper(s.sku) LIKE 'CRSF%' THEN 'CRSF' ELSE 'CRFF' END AS prefix,
       a.key, COALESCE(NULLIF(v.value,''),'(empty)') AS value, count(*) skus
FROM configurator.components_sot_attribute_values v
JOIN configurator.components_sot_attributes a ON a.id=v.attribute_id
JOIN configurator.components_sot_skus s ON s.id=v.sot_sku_id
WHERE a.key IN ('fitting_type','product_subtype','product_type','product_status','mount_type','install_type')
GROUP BY 1,2,3 ORDER BY 2,1,4 DESC;

-- [8] Stock + location coverage per warehouse
WITH p AS (SELECT id, sku, CASE WHEN upper(sku) LIKE 'CRSF%' THEN 'CRSF' ELSE 'CRFF' END prefix
           FROM inventory.products WHERE upper(sku) LIKE 'CRSF%' OR upper(sku) LIKE 'CRFF%')
SELECT p.prefix, s.warehouse, w.warehouse_name, w.warehouse_location,
       count(*) stock_rows, sum(s.quantity) total_qty,
       count(*) FILTER (WHERE s.quantity>0) pos, count(*) FILTER (WHERE s.quantity=0) zero,
       count(*) FILTER (WHERE s.quantity<0) neg,
       count(*) FILTER (WHERE s.product_shelf_location IS NULL OR s.product_shelf_location='') null_shelf,
       count(*) FILTER (WHERE s.product_bulk_location IS NULL OR s.product_bulk_location='') null_bulk
FROM p JOIN inventory.physical_product_stock s ON s.inventory=p.id
LEFT JOIN inventory.warehouse w ON w.warehouse=s.warehouse
GROUP BY 1,2,3,4 ORDER BY 1,2;

-- [9] Grain check: is (inventory, warehouse) unique?
WITH p AS (SELECT id FROM inventory.products WHERE upper(sku) LIKE 'CRSF%' OR upper(sku) LIKE 'CRFF%')
SELECT count(*) violations FROM (
  SELECT s.inventory, s.warehouse FROM inventory.physical_product_stock s JOIN p ON p.id=s.inventory
  GROUP BY 1,2 HAVING count(*)>1) x;

-- [10] Orphan warehouse ids
SELECT string_agg(DISTINCT s.warehouse::text, ',') AS undefined_warehouse_ids
FROM inventory.physical_product_stock s LEFT JOIN inventory.warehouse w ON w.warehouse=s.warehouse
WHERE w.warehouse IS NULL;
SELECT count(*) FROM inventory.physical_product_stock WHERE warehouse=33;

-- [11] CONFLICT: warehouse-level sum vs country rollup (matched ids only)
WITH p AS (SELECT id FROM inventory.products WHERE upper(sku) LIKE 'CRSF%' OR upper(sku) LIKE 'CRFF%'),
inv AS (SELECT DISTINCT s.inventory id FROM inventory.physical_product_stock s JOIN p ON p.id=s.inventory),
whs AS (SELECT s.inventory inv, w.warehouse_location loc, sum(s.quantity) qty
        FROM inventory.physical_product_stock s
        JOIN inventory.warehouse w ON w.warehouse=s.warehouse JOIN inv ON inv.id=s.inventory
        WHERE w.warehouse_location IN ('UK','Germany','Canada','US') GROUP BY 1,2),
roll AS (SELECT l.inventory_id inv, l.warehouse_location loc, l.stock qty
         FROM inventory.local_inventory_current_stock_location_wise l JOIN inv ON inv.id=l.inventory_id)
SELECT whs.loc, count(*) rows_compared,
       count(*) FILTER (WHERE whs.qty=roll.qty) exact_match,
       count(*) FILTER (WHERE whs.qty<>roll.qty) mismatch,
       sum(whs.qty) warehouse_sum, sum(roll.qty) rollup_sum
FROM whs JOIN roll ON whs.inv=roll.inv AND whs.loc=roll.loc GROUP BY 1;

-- [12] CONFLICT: SOT total_stock vs physical_product_stock
WITH sot AS (SELECT s.sku, NULLIF(v.value,'') total_stock_txt
             FROM configurator.components_sot_skus s
             JOIN configurator.components_sot_attribute_values v ON v.sot_sku_id=s.id
             JOIN configurator.components_sot_attributes a ON a.id=v.attribute_id AND a.key='total_stock'
             WHERE s.source_tab='ceilingrose'),
phys AS (SELECT p.sku, sum(st.quantity) phys_total FROM inventory.products p
         JOIN inventory.physical_product_stock st ON st.inventory=p.id GROUP BY 1)
SELECT count(*) sot_skus,
       count(*) FILTER (WHERE sot.total_stock_txt IS NULL) sot_empty,
       count(*) FILTER (WHERE phys.sku IS NULL) not_in_products,
       count(*) FILTER (WHERE sot.total_stock_txt ~ '^-?[0-9]+$'
                          AND phys.phys_total IS DISTINCT FROM sot.total_stock_txt::int) mismatch_vs_physical
FROM sot LEFT JOIN phys ON upper(phys.sku)=upper(sot.sku);

-- [13] Shopify price ambiguity
WITH sot AS (SELECT sku FROM configurator.components_sot_skus WHERE source_tab='ceilingrose')
SELECT count(*) sot_skus,
       count(*) FILTER (WHERE lc.uk_rows=0) no_uk_listing,
       count(*) FILTER (WHERE lc.uk_rows=1) one_uk_listing,
       count(*) FILTER (WHERE lc.uk_rows>1) multiple_uk_listings,
       count(*) FILTER (WHERE lc.distinct_uk_prices>1) conflicting_uk_prices
FROM sot LEFT JOIN LATERAL (
  SELECT count(*) uk_rows, count(DISTINCT sl.price) distinct_uk_prices
  FROM listings.shopify_listings sl WHERE upper(sl.sku)=upper(sot.sku) AND sl.site='UK') lc ON true;

-- [14] Container / received-field existence scan
SELECT table_schema, table_name, column_name, data_type FROM information_schema.columns
WHERE column_name ILIKE '%container%' OR column_name ILIKE '%receiv%' OR column_name ILIKE '%arriv%'
ORDER BY 1,2,3;

-- [15] History / movement existence scan
SELECT table_schema, table_name, column_name FROM information_schema.columns
WHERE table_schema IN ('inventory','suppliers','order_management')
  AND (column_name ILIKE '%log%' OR column_name ILIKE '%history%'
       OR column_name ILIKE '%movement%' OR column_name ILIKE '%adjust%');

-- [16] Container coverage for the 332 ceilingrose SOT SKUs
WITH sot AS (SELECT sku FROM configurator.components_sot_skus WHERE source_tab='ceilingrose')
SELECT (SELECT count(*) FROM sot) sot_skus,
       (SELECT count(DISTINCT oi.sku) FROM suppliers.order_items oi JOIN sot ON upper(sot.sku)=upper(oi.sku)) with_container_link,
       (SELECT count(DISTINCT oi.sku) FROM suppliers.order_items oi JOIN sot ON upper(sot.sku)=upper(oi.sku)
        JOIN suppliers.orders o ON o.id=oi.order_id WHERE o.status_arrived) with_arrived_container;

-- [17] User-defined functions/procedures (result: none)
SELECT n.nspname, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema');
