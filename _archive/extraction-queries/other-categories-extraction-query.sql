-- Cosmetics / Clothes / Home Appliances / Refurbished extraction. SELECT-only.
--
-- Four prefix-defined sections, 32 types, exactly as the team's sheet lists them.
-- No SOT tab exists for any of them, so the SKU prefix is the only authority --
-- the same basis as Lamp Spares and Lighting.
--
-- Matching is LONGEST-PREFIX-WINS (ORDER BY length(p) DESC), which is what makes
-- CTKMP (Pajamas K.M) win over CTMP (Pajamas M) and CTMS, rather than whichever
-- row the planner happened to reach first.
--
-- Several prefixes are only two characters (SB, HB, MB, SS, BS, CK, WM, MA, WB,
-- TC, WK, AP, HL, RB). Every result is checked against the 4,303 SKUs already
-- embedded before anything is added -- see evidence/40.
WITH pfx(cat, key, sub, code, p) AS (VALUES
 ('Cosmetics','CSM','Hair Ornaments','XHO','CSHO'),
 ('Cosmetics','CSM','Hair Clips','XHC','CSHC'),
 ('Cosmetics','CSM','Belt','XBE','CSBE'),
 ('Cosmetics','CSM','Wallets','XWA','CSWA'),
 ('Clothes','CLO','Boxer','YBO','CTBO'),
 ('Clothes','CLO','Shorts (M)','YMS','CTMS'),
 ('Clothes','CLO','Pajamas (M)','YMP','CTMP'),
 ('Clothes','CLO','Pajamas (Fem)','YFP','CTFP'),
 ('Clothes','CLO','Pajamas (K.M)','YKMP','CTKMP'),
 ('Clothes','CLO','Pajamas (K.Fem)','YKFP','CTKFP'),
 ('Clothes','CLO','T-Shirts (K.M)','YKMT','CTKMT'),
 ('Clothes','CLO','T-Shirts (K.Fem)','YKFT','CTKFT'),
 ('Clothes','CLO','Apron','YAP','AP'),
 ('Home Appliances','HAP','Laundry bags','ZLBT','LBT'),
 ('Home Appliances','HAP','Storage Box','ZSB','SB'),
 ('Home Appliances','HAP','Hanging layer bags','ZHB','HB'),
 ('Home Appliances','HAP','Mail bags','ZMB','MB'),
 ('Home Appliances','HAP','Sports','ZSS','SS'),
 ('Home Appliances','HAP','Bathroom sets','ZBS','BS'),
 ('Home Appliances','HAP','Clock','ZCK','CK'),
 ('Home Appliances','HAP','Weight Machine','ZWM','WM'),
 ('Home Appliances','HAP','Mat','ZMA','MA'),
 ('Home Appliances','HAP','White Board','ZWB','WB'),
 ('Home Appliances','HAP','Clip Board','ZFCB','FCB'),
 ('Home Appliances','HAP','Artificial Flowers','ZAFW','AFW'),
 ('Home Appliances','HAP','Foot wear','ZFWS','FWS'),
 ('Home Appliances','HAP','Table cloth','ZTC','TC'),
 ('Home Appliances','HAP','Shower curtain','ZSUA','SUA'),
 ('Home Appliances','HAP','Walking Stick','ZWK','WK'),
 ('Home Appliances','HAP','Back Scratchers','ZBTR','BTR'),
 ('Home Appliances','HAP','Mortar and Pestle','ZPMS','PMS'),
 ('Home Appliances','HAP','Handles','ZHL','HL'),
 ('Refurbished','RFB','Refurbished','RRB','RB')),
prod AS (
  SELECT DISTINCT ON (upper(pr.sku))
         upper(pr.sku) AS sku, pr.id AS pid, pr.description,
         pfx.cat, pfx.key, pfx.sub, pfx.code
  FROM pfx JOIN inventory.products pr ON upper(pr.sku) LIKE pfx.p || '%'
  WHERE pr.sku NOT LIKE '%+%' AND pr.sku !~ '[0-9A-Z]PK$'
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
  'K',  prod.key,
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
)) ORDER BY prod.key, prod.code, prod.sku)::text AS data
FROM prod;
