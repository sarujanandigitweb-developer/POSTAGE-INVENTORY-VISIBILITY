-- Evidence 27–29 — every query run during Lamp Holder discovery (gid 1423341591).
-- SELECT-only. Run 2026-08-24 via mcp__claude_ai_Ledsone_postgres__execute_sql.
-- Nothing was written, and dashboard/inventory-dashboard.html was not modified.

-- ---------------------------------------------------------------------------
-- (1) Is there a Lamp Holder source of truth in the database?  -> NO
-- ---------------------------------------------------------------------------
SELECT source_tab, count(*) AS skus,
       count(*) FILTER (WHERE upper(sku) LIKE 'LH%') AS lh_skus,
       max(synced_at) AS last_sync
FROM configurator.components_sot_skus GROUP BY 1 ORDER BY 1;
-- => bulb 218/0 · ceilingrose 332/0 · lampshade 451/0
--    no lampholder tab; zero LH SKUs under any tab.

-- ---------------------------------------------------------------------------
-- (2) Does any table carry a category/type/subtype/family/fitting column?
-- ---------------------------------------------------------------------------
SELECT table_schema||'.'||table_name AS tbl, column_name, data_type
FROM information_schema.columns
WHERE (lower(column_name) LIKE '%categor%' OR lower(column_name) LIKE '%product_type%'
       OR lower(column_name) LIKE '%subtype%' OR lower(column_name) LIKE '%family%'
       OR lower(column_name) LIKE '%fitting%' OR lower(column_name)='type')
  AND table_schema IN ('inventory','configurator','listings','suppliers')
ORDER BY 1,2;
-- => nothing on inventory.products. Only marketplace listing tables, which are
--    free text (see query 6).

-- ---------------------------------------------------------------------------
-- (3) Sheet -> Database resolution. `sheet` is the 247 SKU_ID values exactly as
--     they appear on the tab; full list in data-maps/lamp-holder-sheet-skus.csv.
-- ---------------------------------------------------------------------------
WITH sheet(sku) AS (VALUES ('LHAHE27AM') /* … 247 rows verbatim … */)
SELECT count(*) AS candidates,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM inventory.products p
              WHERE upper(p.sku)=upper(sheet.sku))) AS resolved,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM inventory.products p
              WHERE upper(p.sku)=upper(sheet.sku))) AS unresolved
FROM sheet;
-- => 247 candidates · 232 resolved · 15 unresolved  (93.9% 1:1)

-- ---------------------------------------------------------------------------
-- (4) Are the 15 unresolvable under any repaired spelling?  -> NO
-- ---------------------------------------------------------------------------
SELECT sku FROM inventory.products WHERE upper(sku) LIKE '%-IDE';    -- 0 rows, whole catalogue
SELECT sku FROM inventory.products WHERE upper(sku) LIKE 'LHCE27%';  -- 0 rows
SELECT sku FROM inventory.products WHERE upper(sku) = 'LHNSE27';     -- 0 rows

-- (4b) Recovery attempt through the sheet's IMG_LINK image ids.
--      Every one belongs to an unrelated combo -> the rows are corrupt.
SELECT regexp_replace(i.image_url,'^.*/product_images/','') AS img, p.sku, p.description
FROM inventory.product_images i JOIN inventory.products p ON p.id=i.product_id
WHERE regexp_replace(i.image_url,'^.*/product_images/','') IN
 ('10597.jpg','10598.jpg','10599.jpg','10600.jpg','7710.jpg','7813.jpg','7814.jpg',
  '7815.jpg','7816.jpg','7817.jpg','7818.jpg','7819.jpg','7820.jpg','7821.jpg','11202.jpg')
ORDER BY 1;
-- => WCFRHE+RPR44WH, CRSF2003BC+PHSH1PBRYB3PK+WCDCBC3PK,
--    PLBXBM+PCBI500TP+PCBITB+PCPTPH+LSDO210RR, CTBOP2L+CTBOP3L+CTBOP8L, …

-- ---------------------------------------------------------------------------
-- (5) Prefix contamination — why LIKE 'LH%' is not the population
-- ---------------------------------------------------------------------------
SELECT count(*) AS lh_prefixed,
       count(*) FILTER (WHERE sku LIKE '%+%')                    AS bundles,
       count(*) FILTER (WHERE sku ~ '[0-9A-Z]PK$')               AS packs,
       count(*) FILTER (WHERE lower(description) LIKE '%combo%') AS combo_desc,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM inventory.end_of_line_products e
              WHERE upper(e.sku)=upper(p.sku)))                  AS eol
FROM inventory.products p WHERE upper(sku) LIKE 'LH%';
-- => 1060 total · 100 bundles · 587 packs · 642 combo descriptions · 101 EOL
--    1060 - 231 genuine = 829 contaminants = 78.2%

-- (5b) Database -> Sheet, bucketed
WITH sheet(sku) AS (VALUES ('LHAHE27AM') /* … 247 … */)
SELECT CASE WHEN p.sku LIKE '%+%' THEN 'bundle (+)'
            WHEN p.sku ~ '[0-9A-Z]PK$' THEN 'pack/combo (PK)'
            WHEN lower(p.description) LIKE '%combo%' THEN 'combo (description)'
            WHEN EXISTS (SELECT 1 FROM inventory.end_of_line_products e
                 WHERE upper(e.sku)=upper(p.sku)) THEN 'end of line'
            ELSE 'single, not on sheet' END AS bucket,
       count(*), (array_agg(p.sku ORDER BY p.sku))[1:5] AS examples
FROM inventory.products p
WHERE upper(p.sku) LIKE 'LH%'
  AND NOT EXISTS (SELECT 1 FROM sheet WHERE upper(sheet.sku)=upper(p.sku))
GROUP BY 1 ORDER BY 2 DESC;
-- => pack/combo 539 · single-not-on-sheet 157 · bundle 100 · end of line 33

-- ---------------------------------------------------------------------------
-- (6) Shopify product_type rejected as a fallback classifier
-- ---------------------------------------------------------------------------
SELECT COALESCE(NULLIF(trim(product_type),''),'(blank)') AS shopify_product_type,
       count(DISTINCT upper(sku)) AS distinct_skus
FROM listings.shopify_listings WHERE upper(sku) LIKE 'LH%' AND site='UK'
GROUP BY 1 ORDER BY 2 DESC;
-- => 21 free-text values, one SKU can carry several, and they include
--    LAMPSHADE (9), Light Bulbs (18), Wall Light (1), Pendant Lighting (2).

-- ---------------------------------------------------------------------------
-- (7) The 5 pack SKUs are disqualified by the data, not just by their names
-- ---------------------------------------------------------------------------
SELECT p.sku, p.description,
       (SELECT count(*) FROM inventory.physical_product_stock s WHERE s.inventory=p.id) AS stock_rows
FROM inventory.products p
WHERE upper(p.sku) IN ('LHC1E27WH3PK','LHC1E27WH5PK','LHC1E27WHAPK','LHC6E27WH5PK','LHC6E27WHAPK')
ORDER BY 1;
-- => all five: description 'Combo Default Title.', stock_rows 0

-- ---------------------------------------------------------------------------
-- (8) Coverage of the clean 226 population
--     (247 sheet rows - 15 corrupt - 5 pack/combo - 1 locked-elsewhere PH SKU)
-- ---------------------------------------------------------------------------
WITH sheet(sku) AS (VALUES ('LHAHE27AM') /* … the 226 … */),
prod AS (SELECT p.id AS pid, upper(p.sku) AS sku
         FROM sheet JOIN inventory.products p ON upper(p.sku)=upper(sheet.sku))
SELECT count(*) AS n,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM inventory.physical_product_stock s
         WHERE s.inventory=pid AND s.warehouse=1))  AS w1_unit3,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM inventory.physical_product_stock s
         WHERE s.inventory=pid AND s.warehouse=8))  AS w8_unit4,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM inventory.physical_product_stock s
         WHERE s.inventory=pid AND s.warehouse=6))  AS w6_unit18,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM inventory.physical_product_stock s
         WHERE s.inventory=pid AND s.warehouse=10)) AS w10_kronen,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM inventory.physical_product_stock s
         WHERE s.inventory=pid AND s.warehouse=7))  AS w7_schmutter,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM inventory.physical_product_stock s
         WHERE s.inventory=pid AND s.warehouse=4))  AS w4_canada,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM inventory.physical_product_stock s
         WHERE s.inventory=pid AND s.warehouse=32)) AS w32_us,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM inventory.end_of_line_products e
         WHERE upper(e.sku)=prod.sku))              AS end_of_line,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM listings.shopify_listings l
         WHERE upper(l.sku)=prod.sku AND l.site='UK' AND l.price IS NOT NULL)) AS uk_price
FROM prod;
-- => 226 · 226 · 226 · 226 · 226 · 226 · 226 · 226 · eol 68 · uk_price 220

-- ---------------------------------------------------------------------------
-- (9) Freshness comparison against the two synced tabs
-- ---------------------------------------------------------------------------
SELECT 'ceilingrose' AS tab, count(*) AS skus,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM inventory.end_of_line_products e
              WHERE upper(e.sku)=upper(s.sku))) AS eol
FROM configurator.components_sot_skus s WHERE source_tab='ceilingrose'
UNION ALL
SELECT 'lampshade', count(*),
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM inventory.end_of_line_products e
              WHERE upper(e.sku)=upper(s.sku)))
FROM configurator.components_sot_skus s WHERE source_tab='lampshade';
-- => ceilingrose 39/332 = 11.7% EOL · lampshade 11/451 = 2.4% EOL
--    Lamp Holder sheet: 68/231 = 29.4% EOL
