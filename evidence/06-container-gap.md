# Evidence 06 — Container Data: Partial, and Not "Received"

## What exists

```
suppliers.containers        (id, main_container, name, current_cbm, status, created_at, updated_at)
suppliers.final_containers  (id, main_container, name, type, current_cbm, status, created_at, updated_at)
suppliers.orders            (..., order_date, status_confirmed, status_finished_production,
                             status_shipped, status_arrived, container_id, final_container_id, ...)
suppliers.order_items       (..., sku, assigned_container_id, final_container_id, ...)
```

`containers.name` values match the dashboard's "Container Number" column exactly —
e.g. `Container 08 2026`, `Container 05 2026`. `final_containers.name` values are
`UK Container 8th 2026`, `DE Container 02 2026`, etc.
`main_container` holds `'UK'` / `'DE'` — a destination **region**, not a warehouse unit.

## Coverage for the 332 SOT ceilingrose SKUs

| Measure | Value |
|---|---|
| SOT ceilingrose SKUs | 332 |
| SKUs with any container link via `suppliers.order_items` | **109 (32.8%)** |
| SKUs linked to a container on an order marked `status_arrived = true` | **94 (28.3%)** |
| SKUs with **no** container data at all | **223 (67.2%)** |

All CR order_items rows: 300 rows / 117 distinct CR-prefixed SKUs
(272 with `assigned_container_id`, 151 with `final_container_id`).

## What does NOT exist

| Dashboard column | Status in LEDSone MCP |
|---|---|
| Last Container **number** | Partially derivable — `containers.name` / `final_containers.name`, but only for 109/332 SKUs, and "last" would require an invented rule (no receipt ordering exists) |
| Last Container **received warehouse** | **ABSENT.** No column on `containers`, `final_containers`, `orders`, or `order_items` records a receiving warehouse. `main_container` is a region ('UK'/'DE'), not one of Unit 3 / Unit 4 / Unit 18 / Kronen / Schmutter |
| Last Container **received date** | **ABSENT.** `orders.status_arrived` is a boolean with no accompanying date. `containers.updated_at` is a row-modification timestamp, not a goods-receipt date |

A catalog-wide scan for `%receiv%` and `%arriv%` returned only `orders.status_arrived`
(boolean) — plus unrelated Amazon-feedback and eBay-message columns.

## Current vs historical

Container links in `suppliers.order_items` are **forward-looking purchase orders**, not
receipts. The most recent CR rows (order_date 2026-07-23, orders `CRG072026-02`, `ELP072026`,
container `Container 08 2026`) carry `status_shipped = false` and `status_arrived = false` —
i.e. this is upcoming stock. Nothing in the source distinguishes "the last container this SKU
was *received* in" from "a container this SKU is *ordered* on".
