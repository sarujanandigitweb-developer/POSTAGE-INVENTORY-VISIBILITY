-- Corrected extraction query for the Postage Inventory Visibility dashboard.
-- Written 2026-08-25 after re-reading the LEDSone schema against the three
-- structure exports supplied by the team. SELECT-only.
--
-- Every change below is justified by a measurement recorded in evidence/34.
-- Nothing here guesses a value: where the database has no data, the column stays
-- Unavailable rather than being filled with a near-miss.

-- ===========================================================================
-- WHAT THE SCHEMA REVIEW CHANGED
-- ===========================================================================
-- 1. `Unassign` is a placeholder row in suppliers.final_containers, NOT a
--    container. 5 dashboard rows were displaying it as a real shipment.
--        -> excluded below, and filtered at render as a belt-and-braces guard.
-- 2. Canada (warehouse 4) HAS shelf locations - 135 of 1,001 sampled SKUs.
--    The dashboard has no Canada location column, so that data was never fetched.
--        -> added as `cal`.
-- 3. inventory.physical_product_stock.product_bulk_location is EMPTY
--    (0 of 1,001 across all seven warehouses) -> no recovery route, not added.
-- 4. UK Unit 18 (wh 6) and US (wh 32) have 0 shelf locations at all
--    -> the dashboard is right to have no location column for them.
-- 5. reserved_quantity IS populated (Unit 3: 118 rows of 1,001)
--    -> added as `ar`,`br`,`kr`,`mr` so "why can I not pick it" is answerable.
-- 6. Containers that are shipped-but-not-arrived (81 SKUs) and on-order
--    (254 SKUs) were invisible. -> added as `ic` (incoming container) + `is`
--    (its status), kept SEPARATE from the arrived container so the two are
--    never confused.
-- 7. inventory.products.title is 100% populated and is the product's real name;
--    `description` is the long marketplace blurb. -> `n` added alongside `d`.
--
-- WHAT COULD NOT BE FIXED
-- 8. RECEIVED DATE: there is no goods-receipt date anywhere in the database.
--    Searched every column and table matching receiv|arriv|grn|intake|delivered|
--    landed|goods_in across all schemas - the only hit is
--    suppliers.orders.status_arrived, which is a BOOLEAN, not a date.
--    suppliers.invoices.invoice_date exists but is the supplier's invoice date
--    (populated for only 2 of the 10 most recent containers) and
--    final_containers.updated_at is a row-touch timestamp. Neither is a receipt
--    date, so neither is used. Received Date stays Unavailable.
-- 9. RECEIVED WAREHOUSE: the database records only the container's region
--    (main_container = UK | DE | US), which the dashboard's column grouping
--    already conveys. There is no per-warehouse receipt record.

WITH pop AS (
  -- population unchanged: the validated SOT tab list, never a SKU prefix
  SELECT upper(sku) AS sku FROM configurator.components_sot_skus WHERE source_tab = :tab),
prod AS (
  SELECT pop.sku, p.id AS pid, p.title, p.description
  FROM pop JOIN inventory.products p ON upper(p.sku) = pop.sku),
st AS (
  SELECT inventory, warehouse, quantity, reserved_quantity,
         NULLIF(NULLIF(trim(product_shelf_location), ''), '-') AS loc
  FROM inventory.physical_product_stock),
-- containers that have ARRIVED (unchanged rule) with the placeholder excluded
cont AS (
  SELECT sku, region, max(container_name) AS container_name, count(*) AS n FROM (
    SELECT DISTINCT upper(oi.sku) AS sku,
      CASE WHEN COALESCE(fc.main_container, c.main_container) IN ('DE','GERMAN') THEN 'DE'
           ELSE COALESCE(fc.main_container, c.main_container) END AS region,
      COALESCE(fc.name, c.name) AS container_name
    FROM suppliers.order_items oi
    JOIN suppliers.orders o ON o.id = oi.order_id
    LEFT JOIN suppliers.final_containers fc ON fc.id = oi.final_container_id
    LEFT JOIN suppliers.containers      c  ON c.id  = oi.assigned_container_id
    WHERE o.status_arrived
      AND COALESCE(fc.name, c.name) IS NOT NULL
      AND upper(trim(COALESCE(fc.name, c.name))) <> 'UNASSIGN'   -- (1)
  ) x GROUP BY 1, 2),
-- NEW: containers still on the way, kept separate from arrived stock
incoming AS (
  SELECT DISTINCT ON (sku) sku, container_name, stage FROM (
    SELECT upper(oi.sku) AS sku,
           COALESCE(fc.name, c.name) AS container_name,
           CASE WHEN o.status_shipped THEN 'Shipped'
                WHEN o.status_finished_production THEN 'Production finished'
                WHEN o.status_confirmed THEN 'Confirmed'
                ELSE 'Ordered' END AS stage,
           o.order_date
    FROM suppliers.order_items oi
    JOIN suppliers.orders o ON o.id = oi.order_id
    LEFT JOIN suppliers.final_containers fc ON fc.id = oi.final_container_id
    LEFT JOIN suppliers.containers      c  ON c.id  = oi.assigned_container_id
    WHERE NOT o.status_arrived
      AND COALESCE(fc.name, c.name) IS NOT NULL
      AND upper(trim(COALESCE(fc.name, c.name))) <> 'UNASSIGN'
  ) y ORDER BY sku, order_date DESC NULLS LAST),
px AS (
  SELECT upper(sku) AS sku, count(DISTINCT price) AS np, min(price) AS pmin, max(price) AS pmax
  FROM listings.shopify_listings WHERE site = 'UK' AND price IS NOT NULL GROUP BY 1)
SELECT json_agg(json_strip_nulls(json_build_object(
  's',  prod.sku,
  'n',  NULLIF(trim(prod.title), ''),                       -- (7) real product name
  'd',  prod.description,
  'i',  (SELECT regexp_replace(i.image_url, '^.*/product_images/', '')::text
         FROM inventory.product_images i WHERE i.product_id = prod.pid LIMIT 1),
  -- UK
  'a',  (SELECT quantity FROM st WHERE inventory=prod.pid AND warehouse=1),
  'al', (SELECT loc      FROM st WHERE inventory=prod.pid AND warehouse=1),
  'ar', (SELECT NULLIF(reserved_quantity,0) FROM st WHERE inventory=prod.pid AND warehouse=1),  -- (5)
  'b',  (SELECT quantity FROM st WHERE inventory=prod.pid AND warehouse=8),
  'bl', (SELECT loc      FROM st WHERE inventory=prod.pid AND warehouse=8),
  'br', (SELECT NULLIF(reserved_quantity,0) FROM st WHERE inventory=prod.pid AND warehouse=8),
  'c',  (SELECT quantity FROM st WHERE inventory=prod.pid AND warehouse=6),  -- no location exists (4)
  -- Germany
  'k',  (SELECT quantity FROM st WHERE inventory=prod.pid AND warehouse=10),
  'kl', (SELECT loc      FROM st WHERE inventory=prod.pid AND warehouse=10),
  'kr', (SELECT NULLIF(reserved_quantity,0) FROM st WHERE inventory=prod.pid AND warehouse=10),
  'm',  (SELECT quantity FROM st WHERE inventory=prod.pid AND warehouse=7),
  'ml', (SELECT loc      FROM st WHERE inventory=prod.pid AND warehouse=7),
  'mr', (SELECT NULLIF(reserved_quantity,0) FROM st WHERE inventory=prod.pid AND warehouse=7),
  -- Other markets
  'ca', (SELECT quantity FROM st WHERE inventory=prod.pid AND warehouse=4),
  'cal',(SELECT loc      FROM st WHERE inventory=prod.pid AND warehouse=4),  -- (2) NEW
  'us', (SELECT quantity FROM st WHERE inventory=prod.pid AND warehouse=32), -- no location exists (4)
  -- arrived containers
  'uc', (SELECT CASE WHEN n=1 THEN container_name END FROM cont WHERE cont.sku=prod.sku AND region='UK'),
  'un', (SELECT n FROM cont WHERE cont.sku=prod.sku AND region='UK'),
  'gc', (SELECT CASE WHEN n=1 THEN container_name END FROM cont WHERE cont.sku=prod.sku AND region='DE'),
  'gn', (SELECT n FROM cont WHERE cont.sku=prod.sku AND region='DE'),
  -- (6) NEW: what is still on the way, never mixed with arrived stock
  'ic', (SELECT container_name FROM incoming WHERE incoming.sku = prod.sku),
  'is', (SELECT stage          FROM incoming WHERE incoming.sku = prod.sku),
  -- price
  'p',  (SELECT CASE WHEN np=1 THEN pmin END FROM px WHERE px.sku=prod.sku),
  'pn', (SELECT np   FROM px WHERE px.sku=prod.sku),
  'p0', (SELECT pmin FROM px WHERE px.sku=prod.sku),
  'p1', (SELECT pmax FROM px WHERE px.sku=prod.sku)
)) ORDER BY prod.sku)::text AS data,
md5(json_agg(json_strip_nulls(json_build_object('s',prod.sku)) ORDER BY prod.sku)::text) AS checksum
FROM prod;
