-- Bulbs section extraction. SELECT-only.
--
-- The BULBS category replaces the old "LED Bulbs" section. It has five types,
-- each defined by a SKU prefix supplied by the team:
--     LD LED Bulbs | IC Incandescent Bulbs | LL LED Panel Light
--     LP LED Spot Light | LQ Lamp Bulbs
--
-- Only the 116 NEW rows are extracted here. The 218 rows already validated
-- against configurator.components_sot_skus source_tab='bulb' stay in LB_DATA,
-- byte-identical and locked; they are re-typed to "LED Bulbs" in memory at load
-- and keep their ten banner series as a Series attribute. Measured overlap:
--   LD prefix (220) is a strict SUPERSET of the bulb SOT (218) - it adds
--   LDCWA60HE277 and LDMT1852E274, two real single bulbs the SOT sync missed.
--   IC / LL / LP / LQ have ZERO overlap with all 4,187 SKUs already embedded.
--
-- Bundle SKUs are excluded by SKU SHAPE only ('%+%', trailing PK). Description
-- is NOT used as a bundle test: LDDMST64E276 and LDST64E278 are real single
-- bulbs whose description column holds the string 'Combo Default Title.'.
WITH pfx(sub, code, p) AS (VALUES
  ('LED Bulbs','BLD','LD'), ('Incandescent Bulbs','BIC','IC'),
  ('LED Panel Light','BLL','LL'), ('LED Spot Light','BLP','LP'),
  ('Lamp Bulbs','BLQ','LQ')),
prod AS (
  SELECT DISTINCT ON (upper(pr.sku))
         upper(pr.sku) AS sku, pr.id AS pid, pr.description, pfx.sub, pfx.code
  FROM pfx JOIN inventory.products pr ON upper(pr.sku) LIKE pfx.p || '%'
  WHERE pr.sku NOT LIKE '%+%' AND pr.sku !~ '[0-9A-Z]PK$'
    -- the 218 already-validated SOT rows stay in the locked LB_DATA
    AND NOT EXISTS (SELECT 1 FROM configurator.components_sot_skus s
                     WHERE s.source_tab = 'bulb' AND upper(s.sku) = upper(pr.sku))
  ORDER BY upper(pr.sku), length(pfx.p) DESC),
st AS (
  SELECT inventory, warehouse, quantity,
         NULLIF(NULLIF(trim(product_shelf_location), ''), '-') AS loc
  FROM inventory.physical_product_stock),
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
    WHERE o.status_arrived AND COALESCE(fc.name, c.name) IS NOT NULL
      AND upper(trim(COALESCE(fc.name, c.name))) <> 'UNASSIGN'
  ) x GROUP BY 1, 2),
px AS (
  SELECT upper(sku) AS sku, count(DISTINCT price) AS np, min(price) AS pmin, max(price) AS pmax
  FROM listings.shopify_listings WHERE site = 'UK' AND price IS NOT NULL GROUP BY 1)
SELECT json_agg(json_strip_nulls(json_build_object(
  's',  prod.sku, 'f', prod.code, 't', prod.sub, 'x', 1,
  'd',  NULLIF(trim(prod.description), ''),
  'i',  (SELECT regexp_replace(i.image_url, '^.*/product_images/', '')::text
         FROM inventory.product_images i WHERE i.product_id = prod.pid LIMIT 1),
  'a',  (SELECT quantity FROM st WHERE inventory=prod.pid AND warehouse=1),
  'al', (SELECT loc      FROM st WHERE inventory=prod.pid AND warehouse=1),
  'b',  (SELECT quantity FROM st WHERE inventory=prod.pid AND warehouse=8),
  'bl', (SELECT loc      FROM st WHERE inventory=prod.pid AND warehouse=8),
  'c',  (SELECT quantity FROM st WHERE inventory=prod.pid AND warehouse=6),
  'k',  (SELECT quantity FROM st WHERE inventory=prod.pid AND warehouse=10),
  'kl', (SELECT loc      FROM st WHERE inventory=prod.pid AND warehouse=10),
  'm',  (SELECT quantity FROM st WHERE inventory=prod.pid AND warehouse=7),
  'ml', (SELECT loc      FROM st WHERE inventory=prod.pid AND warehouse=7),
  'ca', (SELECT quantity FROM st WHERE inventory=prod.pid AND warehouse=4),
  'us', (SELECT quantity FROM st WHERE inventory=prod.pid AND warehouse=32),
  'uc', (SELECT CASE WHEN n=1 THEN container_name END FROM cont WHERE cont.sku=prod.sku AND region='UK'),
  'un', (SELECT n FROM cont WHERE cont.sku=prod.sku AND region='UK'),
  'gc', (SELECT CASE WHEN n=1 THEN container_name END FROM cont WHERE cont.sku=prod.sku AND region='DE'),
  'gn', (SELECT n FROM cont WHERE cont.sku=prod.sku AND region='DE'),
  'p',  (SELECT CASE WHEN np=1 THEN pmin END FROM px WHERE px.sku=prod.sku),
  'pn', (SELECT np   FROM px WHERE px.sku=prod.sku),
  'p0', (SELECT pmin FROM px WHERE px.sku=prod.sku),
  'p1', (SELECT pmax FROM px WHERE px.sku=prod.sku)
)) ORDER BY prod.code, prod.sku)::text AS data
FROM prod;
