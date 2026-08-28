-- New-SKU detection for the Postage Inventory Visibility dashboard.
-- SELECT-only. Run this on a schedule (daily is enough) to surface products that
-- have entered inventory.products but carry no category, so nothing silently
-- goes missing from the dashboard.
--
-- IMPORTANT: none of these queries guess a category from the SKU string.
-- The prefix is not the category — measured contamination is 73–95% on every
-- category tested (evidence/21, 25, 29). Detection is safe; inference is not.

-- ---------------------------------------------------------------------------
-- (1) THE DETECTOR — products with no classification anywhere
--     A product is classified only if it has a row in components_sot_skus.
-- ---------------------------------------------------------------------------
SELECT p.sku, p.description, p.created_at
FROM inventory.products p
WHERE NOT EXISTS (SELECT 1 FROM configurator.components_sot_skus s
                   WHERE upper(s.sku) = upper(p.sku))
  AND p.sku NOT LIKE '%+%'              -- not a bundle
  AND p.sku !~ '[0-9A-Z]PK$'            -- not a pack
  AND lower(p.description) NOT LIKE '%combo%'
  AND NOT EXISTS (SELECT 1 FROM inventory.end_of_line_products e
                   WHERE upper(e.sku) = upper(p.sku))
ORDER BY p.created_at DESC NULLS LAST;

-- ---------------------------------------------------------------------------
-- (2) THE DAILY ALERT — only what is NEW since the last sync
--     Replace the date with max(synced_at) from components_sot_skus.
-- ---------------------------------------------------------------------------
SELECT count(*) AS new_products,
       count(*) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM configurator.components_sot_skus s
          WHERE upper(s.sku) = upper(p.sku))) AS new_and_unclassified
FROM inventory.products p
WHERE p.created_at >= (SELECT max(synced_at) FROM configurator.components_sot_skus);
-- 2026-08-24 result: 40 new products, 40 unclassified.

-- ---------------------------------------------------------------------------
-- (3) DRIFT CHECK — a classified SKU that vanished from the catalogue
-- ---------------------------------------------------------------------------
SELECT s.source_tab, s.sku
FROM configurator.components_sot_skus s
WHERE NOT EXISTS (SELECT 1 FROM inventory.products p
                   WHERE upper(p.sku) = upper(s.sku))
ORDER BY 1, 2;

-- ---------------------------------------------------------------------------
-- (4) PROOF THAT PREFIX INFERENCE IS UNSAFE — the LS example
--     Of the LS-prefixed products that are NOT on the lampshade tab, how many
--     carry a 4-character prefix the tab has never seen?
-- ---------------------------------------------------------------------------
WITH sot   AS (SELECT upper(sku) AS sku FROM configurator.components_sot_skus WHERE source_tab='lampshade'),
     known AS (SELECT DISTINCT left(sku,4) AS p4 FROM sot)
SELECT left(upper(p.sku),4) AS prefix, count(*) AS products,
       (left(upper(p.sku),4) IN (SELECT p4 FROM known)) AS prefix_already_known,
       left(min(p.description),80) AS example
FROM inventory.products p
WHERE upper(p.sku) LIKE 'LS%'
  AND NOT EXISTS (SELECT 1 FROM sot WHERE sot.sku = upper(p.sku))
  AND p.sku NOT LIKE '%+%' AND p.sku !~ '[0-9A-Z]PK$'
  AND lower(p.description) NOT LIKE '%combo%'
GROUP BY 1, 3 ORDER BY 3 DESC, 2 DESC;
-- 2026-08-24 result: 233 LS products are not on the tab. 166 of them carry one of
-- 42 prefixes the tab has never seen. The largest, LSCA (82 products), is
-- "100cm French gold crystal light" — a chandelier, not a lampshade.

-- ---------------------------------------------------------------------------
-- (5) WHERE THE CATEGORY ALREADY LIVES IN THE DATABASE
--     For the three synced tabs the category IS a database field, so a newly
--     synced SKU is classified automatically with no code change.
-- ---------------------------------------------------------------------------
SELECT s.source_tab, a.key AS category_attribute, count(*) AS skus,
       count(DISTINCT v.value) AS distinct_values
FROM configurator.components_sot_skus s
JOIN configurator.components_sot_attribute_values v ON v.sot_sku_id = s.id
JOIN configurator.components_sot_attributes a ON a.id = v.attribute_id
WHERE (s.source_tab, a.key) IN (('lampshade','material_primary'),
                                ('ceilingrose','fitting_type'),
                                ('bulb','bulb_series'))
GROUP BY 1, 2 ORDER BY 1;
-- lampshade / material_primary -> Metal 352 · Glass 72 · Fabric 13 ·
-- Crystal Glass 9 · Natural Rope 5 — exactly the five families the dashboard shows.
