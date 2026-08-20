# Ceiling Rose Inventory Visibility — LEDSone MCP Discovery Report

**Date:** 2026-08-20 · **Scope:** CRSF (Side Fitting), CRFF (Front Fit) · **Mode:** READ-ONLY

## Business question

> Can we reliably fetch complete and accurate Ceiling Rose inventory data from LEDSone MCP for
> CRSF and CRFF so that the Postage & Warehouse Team can see how much stock is available in
> each warehouse?

**Answer: not yet.** The *product* side is solid. The *stock* side is not — LEDSone MCP holds
three different stock figures for the same SKU and nothing in the database says which one is right.

## What is solid

- **SKU identification.** `configurator.components_sot_skus` (`source_tab='ceilingrose'`) holds
  exactly 332 Ceiling Rose SKUs: 219 CRSF, 113 CRFF. Every one resolves 1:1 to
  `inventory.products`. The `fitting_type` attribute reads `Side Fitting` for all 219 CRSF and
  `Front Fitting` for all 113 CRFF — matching the required business mapping.
- **Warehouse mapping.** Every dashboard warehouse column maps to exactly one row in
  `inventory.warehouse`: Unit 3 = 1, Unit 4 = 8, Unit 18 = 6, Kronen = 10, Schmutter = 7,
  CA = 4, US = 32.
- **Stock grain.** `inventory.physical_product_stock` is clean at (inventory_id, warehouse) —
  zero duplicates. Every one of the 332 SKUs has a row in every dashboard warehouse.
- **Images and product identity.** 100% coverage.

## What blocks implementation

1. **Three conflicting stock sources.** Per-warehouse counts
   (`inventory.physical_product_stock`), a country rollup
   (`inventory.local_inventory_current_stock_location_wise`), and a Google-Sheet-synced
   `total_stock` attribute all disagree. For UK, the two stock sources differ by
   **108,073 units (≈1.84×)**; 381 of 688 comparable UK rows mismatch. The sheet-synced figure
   disagrees with physical stock on **161 of 332 SKUs (48.5%)**.
2. **An undefined warehouse.** `warehouse = 33` carries 2,225 stock rows but has no entry in
   `inventory.warehouse` — no name, no country, no meaning.
3. **No goods-receipt data.** No column anywhere records a container's receiving warehouse or
   received date. `orders.status_arrived` is a bare boolean. Container links exist for only
   109 of 332 SKUs, and the most recent ones are *unshipped purchase orders*, not receipts.
4. **No history.** There is no stock history, movement, or adjustment table, and
   `physical_product_stock` has no timestamp column — so freshness cannot even be shown.
5. **Unresolvable Shopify price.** 244 of 332 SKUs carry conflicting UK prices across store
   channels with no primary-channel flag (`CRSF100BM` spans £3.99–£7.90). `currency` is NULL throughout.
6. **Two location columns, one empty.** `product_bulk_location` is NULL for 100% of Ceiling
   Rose rows. `product_shelf_location` is the only usable one — and it is empty for
   **every** SKU at Unit 18 and Kronen.
7. **Undefined stock rules.** Negative quantities are stored (28 CRSF rows in Unit 3 alone) with
   no documented meaning; `reserved_quantity` and `shelf_quantity` exist but no rule defines
   their role in "available stock". The database contains **zero** user-defined functions or
   views encoding any of this.

## Why this is RED, not AMBER

AMBER would fit if the problem were only absent fields — those are enumerable and can be
scoped out or backfilled. The blocker here is different: for the single most important number
on the dashboard, **stock per warehouse**, LEDSone MCP returns three different answers and
provides no rule for choosing. Building on top of that would mean picking one silently — which
is exactly the act of creating a new source of truth before discovery is complete.

The live dashboard at
`varman-aios-hub-varmens.vercel.app/view/hub_pages/Postage_Inventory_dashboard`
already renders 147 Ceiling Rose records with GAP badges on precisely the fields found missing
here (received warehouse, received date, container number, several locations) — consistent with
these findings, but its data-access code is not in this repository, so which of the three stock
sources it reads could not be verified.

## Description mapping (recorded exactly as required)

| Code | Business Description | Source `fitting_type` value |
|---|---|---|
| `CRSF` | Side Fitting | `Side Fitting` |
| `CRFF` | Front Fit | `Front Fitting` |

## Recommendation

**RED — Source/data structure is unclear or conflicts with existing truth; stop before implementation.**

Single next step: hold a source-of-truth ruling with the Postage & Warehouse and Inventory
owners to designate **one** authoritative per-warehouse stock source, and record the ruling
before any further work.

## Evidence index

| File | Contents |
|---|---|
| `evidence/01-mcp-sources-inspected.md` | MCP tools, schemas, objects inspected; objects searched for and not found |
| `evidence/02-sku-identification.md` | CRSF/CRFF identification, bundle-SKU problem, duplicate analysis |
| `evidence/03-warehouse-mapping.md` | Warehouse master, orphan warehouse 33, location coverage |
| `evidence/04-source-of-truth-conflict.md` | Three-way stock conflict with figures; negative stock; currency of data |
| `evidence/05-price-and-history-gaps.md` | Shopify price ambiguity; absence of history |
| `evidence/06-container-gap.md` | Container coverage; missing received warehouse/date |
| `evidence/07-records-retrieved.md` | 20 CRSF + 20 CRFF record extracts; aggregate stock by warehouse |
| `evidence/08-repository-assets.md` | Existing repository asset discovery (none found) |
| `evidence/09-discovery-queries.sql` | All 17 read-only queries executed |
| `data-maps/ceiling-rose-field-availability-matrix.md` | Full field availability matrix + grain summary |
| `validation/ceiling-rose-discovery-validation.md` | Pass/fail criteria and stop-condition evaluation |
