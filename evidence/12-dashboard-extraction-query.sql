-- Evidence 12 — EXACT query used to build the embedded dashboard dataset
-- Run twice via mcp__claude_ai_Ledsone_postgres__execute_sql on 2026-08-20:
--   once with  prod.fitting_type = 'Front Fitting'  (113 rows)
--   once with  prod.fitting_type = 'Side Fitting'   (219 rows)
-- SELECT-only. Output merged with jq and concatenated into the HTML by shell.

WITH sot AS (
  SELECT s.id AS sot_id, upper(s.sku) AS sku,
    (SELECT v.value FROM configurator.components_sot_attribute_values v
     JOIN configurator.components_sot_attributes a ON a.id=v.attribute_id AND a.key='fitting_type'
     WHERE v.sot_sku_id=s.id) AS fitting_type,
    (SELECT NULLIF(v.value,'') FROM configurator.components_sot_attribute_values v
     JOIN configurator.components_sot_attributes a ON a.id=v.attribute_id AND a.key='product_subtype'
     WHERE v.sot_sku_id=s.id) AS subtype
  FROM configurator.components_sot_skus s WHERE s.source_tab='ceilingrose'),
prod AS (SELECT sot.*, p.id AS pid FROM sot JOIN inventory.products p ON upper(p.sku)=sot.sku),
st AS (SELECT inventory, warehouse, quantity,
         NULLIF(NULLIF(trim(product_shelf_location),''),'-') AS loc   -- '-' is a non-location sentinel
       FROM inventory.physical_product_stock),
cont AS (   -- only containers on orders genuinely marked arrived
  SELECT sku, region, max(container_name) AS container_name, count(*) AS n FROM (
    SELECT DISTINCT upper(oi.sku) AS sku,
      CASE WHEN COALESCE(fc.main_container,c.main_container) IN ('DE','GERMAN') THEN 'DE'
           ELSE COALESCE(fc.main_container,c.main_container) END AS region,
      COALESCE(fc.name,c.name) AS container_name
    FROM suppliers.order_items oi JOIN suppliers.orders o ON o.id=oi.order_id
    LEFT JOIN suppliers.final_containers fc ON fc.id=oi.final_container_id
    LEFT JOIN suppliers.containers c ON c.id=oi.assigned_container_id
    WHERE o.status_arrived AND COALESCE(fc.name,c.name) IS NOT NULL) x
  GROUP BY 1,2),
px AS (SELECT upper(sku) AS sku, count(DISTINCT price) AS np, min(price) AS pmin, max(price) AS pmax
       FROM listings.shopify_listings WHERE site='UK' AND price IS NOT NULL GROUP BY 1)
SELECT json_agg(row ORDER BY sku)::text AS data FROM (
SELECT prod.sku,
  json_build_object(
   's',  prod.sku,
   'f',  CASE WHEN prod.fitting_type='Side Fitting' THEN 'CRSF' ELSE 'CRFF' END,
   't',  CASE WHEN prod.fitting_type='Side Fitting' THEN 'Side Fitting' ELSE 'Front Fit' END,
   'd',  prod.subtype,
   'i',  (SELECT i.image_url FROM inventory.product_images i WHERE i.product_id=prod.pid LIMIT 1),
   'a',  (SELECT quantity FROM st WHERE inventory=prod.pid AND warehouse=1),   -- UK Unit 3
   'al', (SELECT loc      FROM st WHERE inventory=prod.pid AND warehouse=1),
   'b',  (SELECT quantity FROM st WHERE inventory=prod.pid AND warehouse=8),   -- UK Unit 4
   'bl', (SELECT loc      FROM st WHERE inventory=prod.pid AND warehouse=8),
   'c',  (SELECT quantity FROM st WHERE inventory=prod.pid AND warehouse=6),   -- UK Unit 18
   'k',  (SELECT quantity FROM st WHERE inventory=prod.pid AND warehouse=10),  -- Kronen
   'kl', (SELECT loc      FROM st WHERE inventory=prod.pid AND warehouse=10),
   'm',  (SELECT quantity FROM st WHERE inventory=prod.pid AND warehouse=7),   -- Schmutter
   'ml', (SELECT loc      FROM st WHERE inventory=prod.pid AND warehouse=7),
   'ca', (SELECT quantity FROM st WHERE inventory=prod.pid AND warehouse=4),   -- Canada
   'us', (SELECT quantity FROM st WHERE inventory=prod.pid AND warehouse=32),  -- US
   'uc', (SELECT CASE WHEN n=1 THEN container_name END FROM cont WHERE cont.sku=prod.sku AND region='UK'),
   'un', (SELECT n FROM cont WHERE cont.sku=prod.sku AND region='UK'),
   'gc', (SELECT CASE WHEN n=1 THEN container_name END FROM cont WHERE cont.sku=prod.sku AND region='DE'),
   'gn', (SELECT n FROM cont WHERE cont.sku=prod.sku AND region='DE'),
   'p',  (SELECT CASE WHEN np=1 THEN pmin END FROM px WHERE px.sku=prod.sku),
   'pn', (SELECT np   FROM px WHERE px.sku=prod.sku),
   'p0', (SELECT pmin FROM px WHERE px.sku=prod.sku),
   'p1', (SELECT pmax FROM px WHERE px.sku=prod.sku)
  ) AS row
FROM prod WHERE prod.fitting_type = 'Front Fitting') z;   -- second run: 'Side Fitting'

-- ---------------------------------------------------------------------------
-- Source-of-truth proof query (Evidence 10): is the country rollup derived from
-- physical_product_stock rather than competing with it?
-- ---------------------------------------------------------------------------
WITH sot AS (SELECT sku FROM configurator.components_sot_skus WHERE source_tab='ceilingrose'),
p AS (SELECT pr.id FROM inventory.products pr JOIN sot ON upper(sot.sku)=upper(pr.sku)),
calc AS (SELECT p.id, w.warehouse_location AS loc,
                GREATEST(sum(s.quantity)-sum(s.reserved_quantity),0) AS formula
         FROM p JOIN inventory.physical_product_stock s ON s.inventory=p.id
         JOIN inventory.warehouse w ON w.warehouse=s.warehouse
         WHERE w.warehouse_location IN ('UK','Germany','Canada','US') GROUP BY 1,2)
SELECT calc.loc, count(*) AS skus,
       count(*) FILTER (WHERE calc.formula = r.stock) AS reproduced,
       count(*) FILTER (WHERE calc.formula <> r.stock) AS not_reproduced
FROM calc JOIN inventory.local_inventory_current_stock_location_wise r
  ON r.inventory_id=calc.id AND r.warehouse_location=calc.loc
GROUP BY 1 ORDER BY 1;
