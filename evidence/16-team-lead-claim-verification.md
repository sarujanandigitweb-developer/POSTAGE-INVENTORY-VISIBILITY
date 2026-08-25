# Evidence 16 — Verification of "All the required data is available in the database"

Date: 2026-08-20 · Mode: READ-ONLY · Nothing modified

## Claim under test

> Team lead: *"All the required data is available in the database."*

**Verdict: PARTLY TRUE. 16 of the 23 required dashboard fields are available. 7 are not present
anywhere in the database.**

The database is the correct and complete *system of record* — but it does not contain every field
the Ceiling Rose dashboard was specified to show.

## Source of the structure

Google Sheet `ledsone_postgresql_data_structure`
(`1KbyvKhLr0fGc6N0IV-OhSaVl9YLAXdbw4zA4cUdhI-k`, GID 208319972).
Re-checked 2026-08-20: `modifiedTime` = `2026-08-20T05:29:10.965Z` — **unchanged** since it was
parsed, so the structure analysis in `evidence/14` and `evidence/15` remains current.

Structure understood and validated: 3 tabs (table catalogue / subject rollup / README),
127 catalogued tables, 71,166,442 rows, 16 schemas, read-only role `dbhub_readonly`.
126 of 127 catalogued tables confirmed live. The live database additionally holds 33 tables the
Sheet does not document, across 2 undocumented schemas (`configurator`, `public`).

## Exhaustive search performed before concluding a field is absent

Four independent sweeps of the **live database** (not just the catalogue):

| # | Sweep | Scope | Result |
|---|---|---|---|
| 1 | Column names matching `%container%`, `%receiv%`, `%arriv%` | all 159 objects | Only `suppliers.orders.status_arrived` (boolean) + unrelated Amazon/eBay feedback columns |
| 2 | Column names matching `%log%`, `%history%`, `%movement%`, `%adjust%` | `inventory`, `suppliers`, `order_management` | Only `suppliers.order_item_logs` (purchase-order field edits) |
| 3 | **Every `date`/`timestamp` column** | `inventory`, `suppliers`, `order_management`, `configurator`, `staff`, `employee_management` | **93 columns — not one is a goods-receipt date.** `inventory.physical_product_stock` has **no date column at all** |
| 4 | Column names matching `%warehouse%`, `%shelf%`, `%stock%` | all 159 objects | 24 columns — all accounted for; no history/receipt object among them |

### Last candidate ruled out: `employee_management.logs`

48,828 rows with `component_name, component_id, action, field_name, old_value, new_value, made_by,
created_at` — a generic audit-log shape that could in principle have held stock changes.

| Check | Result |
|---|---|
| `component_name` values | `assigntask` (19,950), `notes` (10,566), `StaffLeave` (8,344), `task` (7,486), `staff` (1,269), `status`, `team`, `department`… |
| `field_name` matching stock / quantity / qty / shelf / warehouse / location | **0 rows** |
| Rows referencing any `CRSF` / `CRFF` SKU | **0 rows** |

It is an **HR and task-management audit log**, not a stock log. Ruled out.

## Field-by-field verification — all 23 dashboard columns

Population: the 332 validated Ceiling Rose SKUs (CRSF 219 Side Fitting, CRFF 113 Front Fit).

### Available and complete — 9 fields (332/332)

| Field | Source | Coverage |
|---|---|---|
| SKU | `inventory.products.sku` | 332/332 |
| Type | `configurator` attr `fitting_type` | 332/332 |
| Image | `inventory.product_images.image_url` | 332/332 |
| UK Unit 3 Stock | `physical_product_stock.quantity` wh=1 | 332/332 |
| UK Unit 4 Stock | `physical_product_stock.quantity` wh=8 | 332/332 |
| UK Unit 18 Stock | `physical_product_stock.quantity` wh=6 | 332/332 |
| German Kronen Stock | `physical_product_stock.quantity` wh=10 | 332/332 |
| German Schmutter Stock | `physical_product_stock.quantity` wh=7 | 332/332 |
| CA Stock | `physical_product_stock.quantity` wh=4 | 332/332 |

### Available, near-complete — 1 field

| Field | Source | Coverage |
|---|---|---|
| US Stock | `physical_product_stock.quantity` wh=32 | **331/332** — one CRSF SKU has no US row |

### Available but incomplete — 6 fields

| Field | Source | Coverage | Why incomplete |
|---|---|---:|---|
| UK Unit 3 Location | `product_shelf_location` wh=1 | 281/332 (84.6%) | NULL or `'-'` sentinel |
| German Schmutter Location | `product_shelf_location` wh=7 | 181/332 (54.5%) | NULL |
| UK Unit 4 Location | `product_shelf_location` wh=8 | 169/332 (50.9%) | NULL or `'-'` sentinel |
| Shopify Price | `listings.shopify_listings.price` site=UK | 58/332 (17.5%) | 244 SKUs have conflicting prices across UK stores with no primary-store rule; 30 have no UK listing |
| UK Container Number | `suppliers` via `orders.status_arrived` | 54/332 (16.3%) | 250 have no arrived container; 28 have several with no receipt date to order them |
| German Container Number | same | 16/332 (4.8%) | 309 none; 7 ambiguous |

### NOT present anywhere in the database — 7 fields (0/332)

| Field | Why it does not exist |
|---|---|
| German Kronen Location | `product_shelf_location` is NULL for **all 332** Ceiling Rose SKUs at warehouse 10. Column exists, data does not |
| UK Last Container — Received Warehouse | No receiving-warehouse column on `containers`, `final_containers`, `orders` or `order_items`. `main_container` holds a region (`UK`/`DE`/`GERMAN`, inconsistently coded), not a warehouse unit |
| UK Last Container — Received Date | No receipt date column exists. `suppliers.orders` has only `order_date`, `confirmed_date`, `finished_date`, `expected_completion_date` — all production dates. `status_arrived` is a bare boolean |
| German Last Container — Received Warehouse | as UK |
| German Last Container — Received Date | as UK |
| UK History | No stock-history, movement or adjustment table exists. `physical_product_stock` carries no timestamp, so not even a last-changed date can be shown |
| German History | as UK |

## Summary

| Category | Fields | Share of 23 |
|---|---:|---:|
| Complete (332/332) | 9 | 39.1% |
| Near-complete (331/332) | 1 | 4.3% |
| Available but incomplete | 6 | 26.1% |
| **Not present in the database** | **7** | **30.4%** |

## What is correct

Everything the database does hold was verified correct:

| Check | Result |
|---|---|
| CRSF (Side Fitting) | **219** — matches target |
| CRFF (Front Fit) | **113** — matches target |
| Total | **332** — matches target |
| Duplicate SKUs | 0 |
| Bundle SKUs | 0 |
| Unresolved in `inventory.products` | 0 |
| Prefix/`fitting_type` mismatches | 0 |
| Warehouse mapping (7 warehouses) | All exact against `inventory.warehouse`; 332/332 stock rows each (US 331) |
| Authoritative stock source | `inventory.physical_product_stock.quantity` — the only warehouse-grain source; corroborated by the Sheet's own description |
| Dashboard embedded data | Unchanged, SHA-256 `3fb73cc4f4f6886209f561cdc8cbe9f3…` |

## Bottom line for the team lead

The claim holds for **product identity, all warehouse stock, and images** — those are complete and
correct. It does not hold for **goods-receipt information (received warehouse and received date)**
or for **stock history**: those are not partially populated or hard to query, they have no column
and no table anywhere in the database. Adding them would require a schema change and a new
capture process at goods-in, which is outside this task's read-only scope.

Location and price gaps are different in kind — the columns exist and are correct where populated;
they are simply not filled in for every SKU, and for price there is no rule in the database to
choose between conflicting store prices.
