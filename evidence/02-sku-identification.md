# Evidence 02 — CRSF / CRFF Identification

## Business description mapping (recorded exactly as instructed)

| Code | Business Description |
|---|---|
| `CRSF` | Side Fitting |
| `CRFF` | Front Fit |

## Two competing ways to identify a Ceiling Rose SKU

### (A) Prefix match on `inventory.products.sku` — NOT reliable

```sql
SELECT CASE WHEN upper(sku) LIKE 'CRSF%' THEN 'CRSF' ELSE 'CRFF' END AS prefix,
       CASE WHEN sku LIKE '%+%' THEN 'combo/bundle' ELSE 'single' END AS sku_shape,
       count(*) AS skus, count(*) FILTER (WHERE inventory_bool) AS inventory_bool_true
FROM inventory.products
WHERE upper(sku) LIKE 'CRSF%' OR upper(sku) LIKE 'CRFF%'
GROUP BY 1,2;
```

| prefix | sku_shape | skus | inventory_bool_true |
|---|---|---|---|
| CRFF | combo/bundle | 2424 | 0 |
| CRFF | single | 251 | 115 |
| CRSF | combo/bundle | 10500 | 0 |
| CRSF | single | 482 | 230 |

**Total prefix matches: 13,657 (CRSF 10,982 / CRFF 2,675).**
**12,924 of those (94.6%) are bundle SKUs** such as
`CRFF10020SN+WSLS155SN+LSTF40SN`, `CRFF100BM+PHSH1PBRYB+LSUL220BM+ICST64E27` —
multi-component kits that merely *start with* the prefix. A prefix filter therefore
does NOT uniquely identify Ceiling Rose products.

`inventory.products.eng_description` is not a usable descriptor either:
206/251 CRFF and 388/482 CRSF single SKUs have it empty, and the populated values are
free-text dimensions ("100x25 Front fittings", "120*25 face 9 holes"), not the
CRSF/CRFF business descriptions.

### (B) `configurator.components_sot_skus` where `source_tab='ceilingrose'` — reliable

```sql
SELECT source_tab, count(*) skus,
       count(*) FILTER (WHERE upper(sku) LIKE 'CRSF%') crsf,
       count(*) FILTER (WHERE upper(sku) LIKE 'CRFF%') crff,
       max(synced_at) last_sync
FROM configurator.components_sot_skus GROUP BY 1;
```

| source_tab | skus | crsf | crff | last_sync |
|---|---|---|---|---|
| ceilingrose | **332** | **219** | **113** | 2026-08-10 08:16:21 |
| bulb | 218 | 0 | 0 | 2026-08-10 08:16:21 |

All 332 carry `product_type = 'Ceiling Rose'` and `product_status = 'Active'`, and the
`fitting_type` attribute separates them cleanly:

| Prefix | `fitting_type` value in source | SKUs |
|---|---|---|
| CRSF | `Side Fitting` | 219 |
| CRFF | `Front Fitting` | 113 |

Note: source value for CRFF is **"Front Fitting"**; the required business description is
**"Front Fit"**. Recorded as-is; not altered.

All 332 SOT SKUs resolve 1:1 to `inventory.products.sku` (0 unmatched).
`configurator.components_sot_attributes` exposes 208 attribute keys per SKU, including
`fitting_type`, `product_subtype`, `product_type`, `product_status`, `outlet_count`,
`finish_name`, `img_link`, `product_name`, and `total_stock`.

## Duplicate analysis

- `inventory.products`: `sku` is unique — 13,657 rows / 13,657 distinct SKUs / 13,657 distinct ids. No duplicates.
- `inventory.physical_product_stock`: grain is (inventory, warehouse); **0 duplicate (inventory, warehouse) pairs** for CR SKUs.
- `configurator.components_sot_skus`: 332 ceilingrose rows, 1 row per SKU.
- `listings.shopify_listings`: **NOT unique per SKU** — see Evidence 05.
