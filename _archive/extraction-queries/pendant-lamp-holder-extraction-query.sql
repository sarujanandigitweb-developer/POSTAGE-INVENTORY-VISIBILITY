-- Evidence 26 — EXACT query used to build the embedded Pendant Lamp Holder (PH)
-- dataset in dashboard/inventory-dashboard.html.
--
-- WHY THIS DIFFERS FROM THE CEILING ROSE / LAMPSHADE EXTRACTIONS
-- -------------------------------------------------------------
-- Ceiling Rose and Lampshade both have an authoritative source of truth INSIDE
-- the database: configurator.components_sot_skus has synced tabs 'ceilingrose'
-- (332) and 'lampshade' (451), so their population came from a WHERE source_tab
-- filter.
--
-- Pendant Lamp Holder does NOT. Only three tabs are synced (bulb 218,
-- ceilingrose 332, lampshade 451) — there is no 'pendantlampholder' tab, so
-- there is no in-database SOT for this category (evidence/24 §3).
--
-- The population is therefore pinned by an explicit VALUES list of the 398
-- distinct SKUs read off the `Pendant Lamp Holder_SOT` sheet tab (gid
-- 2041874053) — NOT by `sku LIKE 'PH%'`, which returns 2,631 rows at 84.9%
-- contamination (ceiling-rose+chain sets, lampshades, chandeliers, wooden
-- ceiling lamps — evidence/25).
--
-- The full 398-value list is data-maps/pendant-lamp-holder-sheet-skus.csv; it is
-- abbreviated below for readability. The SKU regex used to lift it from the sheet
-- is PH[A-Z0-9.]+ — the dot is REQUIRED (PHSQ1.5PBRYB, PHUH0.5HETBM would
-- otherwise be dropped, which is what made the first pass read 404 not 406 rows).
--
-- SELECT-only. Run via mcp__claude_ai_Ledsone_postgres__execute_sql on 2026-08-24
-- in 4 chunks (ntile(4): 100/100/99/99 rows). Each chunk returned md5() computed
-- IN THE SAME TRANSACTION as the data — the Lampshade run showed that computing
-- the checksum in a separate round-trip lets live-DB drift invalidate it (a stock
-- quantity lost a digit between the sizing query and the fetch). Verified md5s:
--   chunk 1  28d15ac9a99a4ea52c5fd9efc1c0d3fa   (100 rows)
--   chunk 2  89ddcb9e4887a4eacf9fab8b80b5efe4   (100 rows)
--   chunk 3  d34cdcaab9b6679aba52ddec72a2185b   ( 99 rows)
--   chunk 4  e6d828bb182e4a7ba65b7385c8ae7b8f   ( 99 rows)
-- Merged with `jq -s add`. No inventory value was ever hand-typed unchecked.
--
-- The embedded dataset is a point-in-time snapshot, exactly as CR and LS are.

WITH sheet(sku) AS (VALUES
  ('PHAH2RBMBM'),('PHAH2RCHBW'),('PHAH2RGBGB'),('PHAH2RSNBW'),('PHBAF1BMRBM'),
  ('PHCD1PBRBM'),('PHCD1PBRBW'),('PHCGF1BMRBM'),('PHFSH1PBRBM'),('PHSF1PBR20WH'),
  ('PHSQ1.5PBRYB'),('PHTT1PBR5BM'),('PHTT1PBRBM'),('PHTT1PWR5WH'),('PHUH0.5HETBM')
  /* … 398 rows total — full list: data-maps/pendant-lamp-holder-sheet-skus.csv */
),
prod AS (
  -- 1:1 resolution. All 398 sheet SKUs resolve; no sheet SKU is missing from
  -- inventory.products and no product is pulled in that the sheet does not name.
  SELECT upper(sheet.sku) AS sku, p.id AS pid, p.description AS descr
  FROM sheet JOIN inventory.products p ON upper(p.sku)=upper(sheet.sku)),
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
SELECT prod.sku, ntile(4) OVER (ORDER BY prod.sku) AS chunk,
  json_strip_nulls(json_build_object(
   's',  prod.sku,
   'd',  prod.descr,
   -- image stored as the bare filename; all 398 share one CDN prefix, expanded
   -- once in JS (LS_IMG_BASE) — same trick as Lampshade, saves ~40KB
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
SELECT json_agg(row ORDER BY sku)::text AS data,
       md5(json_agg(row ORDER BY sku)::text) AS checksum   -- same transaction as the data
FROM rows WHERE chunk = 1;  -- then 2, 3, 4

-- ---------------------------------------------------------------------------
-- The three sheet-derived keys are NOT produced by this query
-- ---------------------------------------------------------------------------
-- 'f'  PD | CP          Mount_Type code — colours the type badge only
-- 't'  'Pendant Lamp Holder'  constant; the section name, since the sheet
--                       declares no Level-1 business category
-- 'mt' 'Pendant' | 'Ceiling Pendant'  the Mount Type ATTRIBUTE label
--
-- These come from the sheet's Mount_Type column and were merged onto the DB rows
-- locally by SKU. They are deliberately not read from the database: the database
-- has no authoritative classification for this category (that is precisely why
-- the discovery verdict was AMBER, not GREEN). Mount Type is exposed in the UI as
-- an attribute filter labelled "Mount Type" — NOT as the business category.

-- ---------------------------------------------------------------------------
-- Integrity checks run alongside the extraction
-- ---------------------------------------------------------------------------

-- (a) population resolves 1:1 — 398 / 398 / 398 / 0 / 0 / 0
WITH sheet(sku) AS (VALUES ('PHAH2RBMBM') /* … 398 */)
SELECT count(*) AS sheet_skus, count(DISTINCT upper(sku)) AS distinct_sku,
       count(*) FILTER (WHERE EXISTS
         (SELECT 1 FROM inventory.products p WHERE upper(p.sku)=upper(sheet.sku))) AS resolved,
       count(*) FILTER (WHERE NOT EXISTS
         (SELECT 1 FROM inventory.products p WHERE upper(p.sku)=upper(sheet.sku))) AS unresolved,
       count(*) FILTER (WHERE sku LIKE '%+%')      AS bundles,
       count(*) FILTER (WHERE sku ~ '[0-9]PK$')    AS packs
FROM sheet;

-- (b) prefix contamination — why LIKE 'PH%' was rejected as the population
--     2631 total PH-prefixed products vs 398 genuine => 84.9% contamination
SELECT count(*) AS ph_prefixed_products
FROM inventory.products WHERE upper(sku) LIKE 'PH%';

-- (c) no pendantlampholder tab exists — confirms there is no in-DB SOT
SELECT source_tab, count(*) AS skus, max(synced_at) AS last_sync
FROM configurator.components_sot_skus GROUP BY 1 ORDER BY 1;
-- => bulb 218 · ceilingrose 332 · lampshade 451   (no pendant lamp holder tab)

-- (d) every PH image shares the one CDN prefix — 398 / 398
WITH sheet(sku) AS (VALUES ('PHAH2RBMBM') /* … 398 */),
prod AS (SELECT p.id AS pid FROM sheet JOIN inventory.products p ON upper(p.sku)=upper(sheet.sku)),
im AS (SELECT (SELECT i.image_url FROM inventory.product_images i WHERE i.product_id=prod.pid LIMIT 1) AS url FROM prod)
SELECT count(*) AS total,
  count(*) FILTER (WHERE url LIKE 'https://sin1.contabostorage.com/4ad62276cb6d4a83bfb1b8a91b839703:newom/newom/newom/img/product_images/%') AS has_prefix
FROM im;
