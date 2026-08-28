-- Evidence 19 — EXACT query used to build the embedded Lampshade (LS) dataset.
--
-- Identical to evidence/12 (the validated Ceiling Rose extraction) except for:
--   * source_tab           'ceilingrose' -> 'lampshade'
--   * 'f' / 't' mapping    fitting_type -> LS family codes (below)
--   * 'd' (subtype)        dropped — it is the constant 'Lampshade' for all 451
--   * 'i' (image)          stored as the bare filename; all 451 share one CDN
--                          prefix, expanded once in JS (saves ~46KB)
--   * json_strip_nulls     omits null keys (the JS already treats missing and
--                          null identically) — 193KB -> 72KB
--
-- SELECT-only. Run via mcp__claude_ai_Ledsone_postgres__execute_sql on 2026-08-20
-- in 3 chunks (ntile(3): 151/150/150 rows), each verified against md5() computed
-- server-side, then merged with `jq -s add`. The data was never hand-retyped
-- without a checksum proving it byte-identical to the server's output.
--
-- NOTE: this is a live database. Chunk 3's aggregate md5 changed between the
-- sizing query and the fetch (24,580 -> 24,579 chars — one stock quantity lost a
-- digit). Row-level md5 comparison confirmed all 150 rows matched current state.
-- The embedded dataset is a point-in-time snapshot, exactly as Ceiling Rose is.

WITH sot AS (
  SELECT s.id AS sot_id, upper(s.sku) AS sku,
    (SELECT NULLIF(trim(v.value),'') FROM configurator.components_sot_attribute_values v
     JOIN configurator.components_sot_attributes a ON a.id=v.attribute_id AND a.key='fitting_type'
     WHERE v.sot_sku_id=s.id) AS ft
  FROM configurator.components_sot_skus s WHERE s.source_tab='lampshade'),
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
       FROM listings.shopify_listings WHERE site='UK' AND price IS NOT NULL GROUP BY 1),
rows AS (
SELECT prod.sku, ntile(3) OVER (ORDER BY prod.sku) AS chunk,
  json_strip_nulls(json_build_object(
   's',  prod.sku,
   -- family code drives the filter chips; unclassified stays unclassified, never guessed
   'f',  CASE prod.ft WHEN 'Easy Fit'        THEN 'EF'
                      WHEN 'Pendant Light'   THEN 'PL'
                      WHEN 'Ceiling Mounted' THEN 'CM'
                      ELSE 'UN' END,
   -- display type; NULL for blank/[VERIFY] so the UI renders "Unavailable"
   't',  CASE WHEN prod.ft IN ('Easy Fit','Pendant Light','Ceiling Mounted')
              THEN prod.ft ELSE NULL END,
   'i',  (SELECT regexp_replace(i.image_url,'^.*/product_images/','')::text
          FROM inventory.product_images i WHERE i.product_id=prod.pid LIMIT 1),
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
  )) AS row
FROM prod)
SELECT json_agg(row ORDER BY sku)::text AS data FROM rows WHERE chunk = 1;  -- then 2, then 3

-- ---------------------------------------------------------------------------
-- Integrity checks run alongside the extraction
-- ---------------------------------------------------------------------------

-- (a) LS is clean at source — 451 / 451 / 0 / 0 / 451 / 0
WITH sot AS (
  SELECT s.id, upper(s.sku) AS sku,
    (SELECT NULLIF(trim(v.value),'') FROM configurator.components_sot_attribute_values v
     JOIN configurator.components_sot_attributes a ON a.id=v.attribute_id AND a.key='product_subtype'
     WHERE v.sot_sku_id=s.id) AS subtype
  FROM configurator.components_sot_skus s WHERE s.source_tab='lampshade')
SELECT count(*) AS ls_skus, count(DISTINCT sku) AS distinct_sku,
       count(*) FILTER (WHERE sku LIKE '%+%')     AS bundles,
       count(*) FILTER (WHERE sku NOT LIKE 'LS%') AS non_ls_prefix,
       count(*) FILTER (WHERE subtype='Lampshade') AS subtype_lampshade,
       count(*) FILTER (WHERE NOT EXISTS
         (SELECT 1 FROM inventory.products p WHERE upper(p.sku)=sot.sku)) AS unresolved
FROM sot;

-- (b) fitting_type distribution — Easy Fit 404 · empty 31 · Pendant Light 9
--     · Ceiling Mounted 4 · [VERIFY] 3   (= 451)
WITH sot AS (
  SELECT s.id,
    (SELECT NULLIF(trim(v.value),'') FROM configurator.components_sot_attribute_values v
     JOIN configurator.components_sot_attributes a ON a.id=v.attribute_id AND a.key='fitting_type'
     WHERE v.sot_sku_id=s.id) AS fitting_type
  FROM configurator.components_sot_skus s WHERE s.source_tab='lampshade')
SELECT COALESCE(fitting_type,'(NULL/empty)') AS fitting_type, count(*) FROM sot GROUP BY 1 ORDER BY 2 DESC;

-- (c) every LS image shares one CDN prefix — 451 / 451 / 451 / 451
WITH sot AS (SELECT upper(s.sku) AS sku FROM configurator.components_sot_skus s WHERE s.source_tab='lampshade'),
prod AS (SELECT sot.sku, p.id AS pid FROM sot JOIN inventory.products p ON upper(p.sku)=sot.sku),
im AS (SELECT (SELECT i.image_url FROM inventory.product_images i WHERE i.product_id=prod.pid LIMIT 1) AS url FROM prod)
SELECT count(*) AS total,
  count(*) FILTER (WHERE url LIKE 'https://sin1.contabostorage.com/4ad62276cb6d4a83bfb1b8a91b839703:newom/newom/newom/img/product_images/%') AS has_prefix,
  count(*) FILTER (WHERE url ~ '/product_images/[0-9]+\.jpg$') AS numeric_jpg,
  count(DISTINCT regexp_replace(url,'^.*/product_images/','')) AS distinct_files
FROM im;

-- (d) WC still has NO authoritative classification — every tab returns wc_skus = 0
SELECT source_tab, count(*) AS skus,
       count(*) FILTER (WHERE upper(sku) LIKE 'WC%') AS wc_skus,
       max(synced_at) AS last_sync
FROM configurator.components_sot_skus GROUP BY 1 ORDER BY 1;
