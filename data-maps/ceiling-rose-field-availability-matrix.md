# Ceiling Rose (CRSF / CRFF) — Field Availability Matrix

Discovery date: 2026-08-20 · Source: LEDSone MCP (PostgreSQL) · READ-ONLY
Population: 332 SKUs — `configurator.components_sot_skus WHERE source_tab='ceilingrose'`
(CRSF 219 = Side Fitting, CRFF 113 = Front Fit)

Legend — Validation Status: **OK** = usable as-is · **AMBIGUOUS** = present but no rule selects the value · **CONFLICT** = multiple sources disagree · **MISSING** = not in source

| Required Field | LEDSone MCP Available? | Source Object / Field | CRSF Coverage | CRFF Coverage | Data Example / Count | Validation Status | Gap |
|---|---|---|---|---|---|---|---|
| SKU | YES | `inventory.products.sku` (varchar) · SKU grain · unique | 219/219 (100%) | 113/113 (100%) | `CRSF100BM`, `CRFF100BM` | OK | — |
| SKU type (Side/Front) | YES | `configurator.components_sot_attribute_values.value` where `attributes.key='fitting_type'` (text) · SKU grain | 219/219 → `Side Fitting` | 113/113 → `Front Fitting` | 100% populated | OK | Source says "Front Fitting"; business description is "Front Fit" — label difference only |
| Description | PARTIAL | `inventory.products.title` / `.description` (text, 100% populated) · `.eng_description` (mostly empty) | title 219/219; eng_description 94/482 singles | title 113/113; eng_description 45/251 singles | "Black Colour Front fitting Ceiling Rose…" | AMBIGUOUS | Three competing descriptors (`title`, `description`, SOT `product_name`/`product_subtype`); no rule says which is the display description |
| Image | YES | `inventory.product_images.image_url` (text) · product grain · also SOT `img_link` | 219/219 (100%) | 113/113 (100%) | 1 image row per product | OK | Second image source (SOT `img_link`) not reconciled |
| UK availability | YES | `inventory.warehouse.warehouse_location='UK'` → warehouses 1, 8, 6 | 219/219 | 113/113 | — | OK | — |
| German availability | YES | `warehouse_location='Germany'` → warehouses 10, 7 (also 5 Duisburg, not on dashboard) | 219/219 | 113/113 | — | OK | Duisburg (5) is a third German warehouse not represented on the dashboard |
| CA availability | YES | warehouse 4 `Canada1` | 219/219 | 113/113 | Σ 2,062 / 542 | OK | — |
| US availability | YES | warehouse 32 `US1` | 218/219 | 113/113 | Σ 3,782 / 855 | OK | 1 CRSF SKU has no US row |
| **Unit 3 stock** | YES | `inventory.physical_product_stock.quantity` WHERE `warehouse=1` (int) | 219/219 | 113/113 | CRSF100BM = 2264 | CONFLICT | Disagrees with country rollup and SOT `total_stock` (Evidence 04) |
| **Unit 3 location** | YES | `physical_product_stock.product_shelf_location` WHERE `warehouse=1` | 196/219 (89.5%) | 111/113 (98.2%) | `1-F-01`, `L-B-17` | OK | 23 CRSF / 2 CRFF NULL; `'-'` used as a non-location sentinel |
| **Unit 4 stock** | YES | `physical_product_stock.quantity` WHERE `warehouse=8` | 219/219 | 113/113 | CRSF100BM = 1071 | CONFLICT | as above |
| **Unit 4 location** | YES | `physical_product_stock.product_shelf_location` WHERE `warehouse=8` | 191/219 (87.2%) | 113/113 (100%) | `1-I-08-B`, `1-H-02` | OK | 28 CRSF NULL; heavy use of `'-'` sentinel |
| **Unit 18 stock** | YES | `physical_product_stock.quantity` WHERE `warehouse=6` | 219/219 | 113/113 | CRSF100BM = 5700 | CONFLICT | as above |
| **Unit 18 location** | **NO** | `product_shelf_location` WHERE `warehouse=6` | **0/219 (0%)** | **0/113 (0%)** | all NULL | MISSING | Column exists but is empty for every Ceiling Rose SKU |
| Last Container (UK) | PARTIAL | `suppliers.order_items` → `containers.name` / `final_containers.name` | 109/332 SKUs total have any link | same | `Container 08 2026` | AMBIGUOUS | 67.2% of SKUs unlinked; "last" needs an invented ordering rule |
| **LC received warehouse (UK)** | **NO** | — | 0 | 0 | — | MISSING | No receiving-warehouse column anywhere; `main_container` is a region ('UK'/'DE') |
| **LC received date (UK)** | **NO** | — | 0 | 0 | — | MISSING | `orders.status_arrived` is boolean with no date |
| Last Container number (UK) | PARTIAL | `suppliers.containers.name` | 109/332 | same | `Container 05 2026` | AMBIGUOUS | Same 32.8% coverage; orders are forward-looking (status_arrived=false on latest) |
| **Shopify price** | PARTIAL | `listings.shopify_listings.price` (numeric) · (sku, site, channel) grain | 265/332 SKUs have >1 UK listing; **244 have conflicting prices**; 30 have none | same population | CRSF100BM = £3.99–£7.90 | AMBIGUOUS | No primary-channel flag or precedence rule; `currency` is NULL for all CR rows |
| **History (UK)** | **NO** | — | 0 | 0 | — | MISSING | No stock-history/movement table exists; `physical_product_stock` has no timestamp |
| **Kronen stock** | YES | `physical_product_stock.quantity` WHERE `warehouse=10` | 219/219 | 113/113 | Σ 346 / −6 | CONFLICT | as above; near-entirely zero |
| **Kronen location** | **NO** | `product_shelf_location` WHERE `warehouse=10` | **0/219 (0%)** | **0/113 (0%)** | all NULL | MISSING | Empty for every Ceiling Rose SKU |
| **Schmutter stock** | YES | `physical_product_stock.quantity` WHERE `warehouse=7` | 219/219 | 113/113 | CRSF100BM = 3839 | CONFLICT | as above |
| **Schmutter location** | PARTIAL | `product_shelf_location` WHERE `warehouse=7` | 143/219 (65.3%) | 38/113 (33.6%) | `R1-S08`, `R2-S15-B` | AMBIGUOUS | 76 CRSF / 75 CRFF NULL |
| **LC received warehouse (DE)** | **NO** | — | 0 | 0 | — | MISSING | as UK |
| **LC received date (DE)** | **NO** | — | 0 | 0 | — | MISSING | as UK |
| Last Container number (DE) | PARTIAL | `final_containers.name` where `main_container='DE'` | very low | very low | `DE Container 02 2026` | AMBIGUOUS | Only 1 DE container row exists in the whole table |
| **History (German)** | **NO** | — | 0 | 0 | — | MISSING | as UK |

## Grain summary

| Object | Grain | Timestamped? |
|---|---|---|
| `inventory.products` | 1 row per SKU | `created_at` / `updated_at` |
| `inventory.physical_product_stock` | 1 row per (inventory_id, warehouse) — verified 0 duplicates | **NO timestamp column at all** |
| `inventory.local_inventory_current_stock_location_wise` | 1 row per (inventory_id, country) | NO |
| `configurator.components_sot_skus` | 1 row per SKU per sheet tab | `synced_at` (2026-08-10) |
| `listings.shopify_listings` | 1 row per (sku, site, channel) — **many per SKU** | `created_at` / `updated_at` |
| `suppliers.order_items` | 1 row per (purchase order, sku) | `created_at` / `updated_at` |
