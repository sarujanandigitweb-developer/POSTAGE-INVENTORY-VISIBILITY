-- Evidence 30 — queries behind the Lamp Holder source-correction report.
-- SELECT-only, run 2026-08-24. Nothing was written to the database, the SOT or
-- the dashboard.

-- (A) No Lamp Holder SOT, and no LH SKU under any synced tab
SELECT source_tab, count(*) AS skus,
       count(*) FILTER (WHERE upper(sku) LIKE 'LH%') AS lh_skus, max(synced_at)
FROM configurator.components_sot_skus GROUP BY 1 ORDER BY 1;
-- => bulb 218/0 · ceilingrose 332/0 · lampshade 451/0

-- (B) The 15 corrupt rows cannot be resolved under any spelling
SELECT count(*) AS ide_products_in_whole_catalogue
FROM inventory.products WHERE upper(sku) LIKE '%-IDE';                 -- 0
SELECT count(*) FROM inventory.products WHERE upper(sku) LIKE 'LHCE27%'; -- 0
SELECT count(*) FROM inventory.products WHERE upper(sku) = 'LHNSE27';    -- 0

-- (B.3) Proof only — which product each corrupt row's image really belongs to.
-- Run to DISPROVE recoverability; no identity was inferred from the result.
SELECT regexp_replace(i.image_url,'^.*/product_images/','') AS img, p.sku, p.description
FROM inventory.product_images i JOIN inventory.products p ON p.id=i.product_id
WHERE regexp_replace(i.image_url,'^.*/product_images/','') IN
 ('10597.jpg','10598.jpg','10599.jpg','10600.jpg','7710.jpg','7813.jpg','7814.jpg',
  '7815.jpg','7816.jpg','7817.jpg','7818.jpg','7819.jpg','7820.jpg','7821.jpg','11202.jpg')
ORDER BY 1;
-- => all 15 belong to WC…/CRSF…/PLBXBM…/CTBOP… combos and bundles

-- (C) The 5 pack rows: placeholder description, zero stock rows
SELECT p.sku, p.description,
       (SELECT count(*) FROM inventory.physical_product_stock s WHERE s.inventory=p.id) AS stock_rows
FROM inventory.products p
WHERE upper(p.sku) IN ('LHC1E27WH3PK','LHC1E27WH5PK','LHC1E27WHAPK','LHC6E27WH5PK','LHC6E27WHAPK')
ORDER BY 1;
-- => all five: 'Combo Default Title.', 0 stock rows

-- (D) PHXSH1PBRWH belongs to Pendant Lamp Holder
SELECT sku, description FROM inventory.products WHERE upper(sku)='PHXSH1PBRWH';
-- => id 40741, 'E27 lamp Holder with LED Housing & 1 meter of 0.75 sq mm two…'
-- Cross-checked outside SQL: present on gid 2041874053 and inside the shipped
-- sql/pendant-lamp-holder_data.json (one of the locked 398).

-- (E) The 157 database-only live candidates.
--     Selection uses database evidence only: LH prefix, not on the sheet,
--     not a bundle, not a pack, not a combo, not end of line.
WITH sheet(sku) AS (VALUES ('LHAHE27AM') /* … the 247 sheet SKU_ID values … */)
SELECT p.sku, p.description,
       EXISTS (SELECT 1 FROM inventory.product_images i WHERE i.product_id=p.id) AS has_image,
       (SELECT count(*) FROM inventory.physical_product_stock s WHERE s.inventory=p.id) AS stock_rows,
       (SELECT s.quantity FROM inventory.physical_product_stock s
        WHERE s.inventory=p.id AND s.warehouse=1) AS unit3_qty,
       (SELECT string_agg(DISTINCT NULLIF(trim(l.product_type),''),' | ')
        FROM listings.shopify_listings l WHERE upper(l.sku)=upper(p.sku) AND l.site='UK') AS shopify_product_type
FROM inventory.products p
WHERE upper(p.sku) LIKE 'LH%'
  AND p.sku NOT LIKE '%+%' AND p.sku !~ '[0-9A-Z]PK$'
  AND lower(p.description) NOT LIKE '%combo%'
  AND NOT EXISTS (SELECT 1 FROM inventory.end_of_line_products e WHERE upper(e.sku)=upper(p.sku))
  AND NOT EXISTS (SELECT 1 FROM sheet WHERE upper(sheet.sku)=upper(p.sku))
ORDER BY p.sku;
-- => 157 rows. Classified in data-maps/lamp-holder-157-database-only.csv as
--    genuine 117 · unrelated 22 · unresolved 18 · bundle 0 · pack 0 · combo 0.
--    Classification uses inventory.products.description only; nothing was guessed.

-- (A.1) The bulb already inside the sheet population
SELECT sku, description FROM inventory.products
WHERE upper(sku) IN ('LHXDE27WH','LHXDE27BM') ORDER BY 1;
-- => BOTH: 'XD-3027 (E27) LED Bulb/Light with Copper Granules, AC 220–250V, 4A, 50/60Hz'
--    LHXDE27WH is on the sheet; LHXDE27BM is not and was classified 'unrelated'.

-- (F) The 68 end-of-line SKUs currently on the sheet
WITH sheet(sku) AS (VALUES ('LHAHE27AM') /* … the 226 usable SKUs … */)
SELECT string_agg(p.sku, ',' ORDER BY p.sku) AS eol_skus, count(*) AS n
FROM sheet JOIN inventory.products p ON upper(p.sku)=upper(sheet.sku)
WHERE EXISTS (SELECT 1 FROM inventory.end_of_line_products e WHERE upper(e.sku)=upper(p.sku));
-- => 68

-- (G) Database-side category search — nothing authoritative exists
SELECT table_schema||'.'||table_name AS tbl, column_name
FROM information_schema.columns
WHERE (lower(column_name) LIKE '%categor%' OR lower(column_name) LIKE '%product_type%'
       OR lower(column_name) LIKE '%subtype%' OR lower(column_name) LIKE '%family%'
       OR lower(column_name) LIKE '%fitting%' OR lower(column_name)='type')
  AND table_schema IN ('inventory','configurator','listings','suppliers')
ORDER BY 1,2;
-- => nothing on inventory.products; only marketplace listing tables.

SELECT COALESCE(NULLIF(trim(product_type),''),'(blank)') AS shopify_product_type,
       count(DISTINCT upper(sku)) AS distinct_skus
FROM listings.shopify_listings WHERE upper(sku) LIKE 'LH%' AND site='UK'
GROUP BY 1 ORDER BY 2 DESC;
-- => 21 free-text values incl. LAMPSHADE, Light Bulbs, Wall Light, Pendant Lighting.
--    Rejected as a classifier.

-- (A.2) Freshness comparison with the synced tabs
SELECT 'ceilingrose' AS tab, count(*) AS skus,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM inventory.end_of_line_products e
              WHERE upper(e.sku)=upper(s.sku))) AS eol
FROM configurator.components_sot_skus s WHERE source_tab='ceilingrose'
UNION ALL
SELECT 'lampshade', count(*),
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM inventory.end_of_line_products e
              WHERE upper(e.sku)=upper(s.sku)))
FROM configurator.components_sot_skus s WHERE source_tab='lampshade';
-- => ceilingrose 39/332 (11.7%) · lampshade 11/451 (2.4%)
--    Lamp Holder sheet: 68/231 (29.4%)
