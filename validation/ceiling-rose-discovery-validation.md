# Validation Record — Ceiling Rose Discovery (CRSF / CRFF)

Date: 2026-08-20 · Mode: READ-ONLY

## Pass / Fail criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Both CRSF and CRFF can be identified | **PASS** (via `configurator.components_sot_skus` source_tab='ceilingrose' + `fitting_type`; **prefix matching alone FAILS** — 94.6% of prefix matches are bundle SKUs) | evidence/02 |
| 2 | LEDSone MCP source fields identified | **PASS** | evidence/01, data-maps/…matrix |
| 3 | Requested field availability mapped | **PASS** (30 dashboard fields mapped; 8 MISSING, 7 AMBIGUOUS, 6 CONFLICT) | data-maps/…matrix |
| 4 | Actual records inspected | **PASS** (332 SOT SKUs profiled; 20 CRSF + 20 CRFF full extracts) | evidence/07 |
| 5 | Missing / NULL data documented | **PASS** | evidence/03, 05, 06 |
| 6 | Duplicate / source-of-truth risk checked | **PASS** — no row duplicates, but **3 conflicting stock sources found** | evidence/04 |
| 7 | Evidence saved | **PASS** | 9 files under `evidence/` |
| 8 | No implementation changes made | **PASS** — SELECT-only; no DDL/DML; no dashboard, workflow, table, view, or function created or altered | evidence/09 |

**Discovery PASS.** All eight criteria are proven with saved evidence.
The discovery *passed*; the *data* did not clear the bar for implementation.

## Stop conditions evaluated

| Stop condition | Triggered | Detail |
|---|---|---|
| LEDSone MCP does not contain the required data | **PARTIAL — YES** | 8 requested fields have no source at all: Unit 18 location, Kronen location, LC received warehouse (UK), LC received date (UK), LC received warehouse (DE), LC received date (DE), History (UK), History (German) |
| CRSF or CRFF cannot be uniquely identified | NO | Uniquely identifiable via `configurator.components_sot_skus.source_tab='ceilingrose'` + `fitting_type` |
| **Multiple conflicting sources of truth** | **YES** | 3 stock sources disagree: `physical_product_stock` vs `local_inventory_current_stock_location_wise` (381/688 UK rows mismatch; 236,139 vs 128,066 units) vs SOT `total_stock` (161/332 SKUs mismatch) |
| Existing dashboard logic conflicts with LEDSone MCP | **UNRESOLVED** | The live dashboard's data-access code is not in this repository and could not be inspected — its stock source cannot be confirmed to be any of the three. Treated as an open risk, not a clean pass |
| **Warehouse / location meaning unclear** | **YES** | `warehouse=33` appears on 2,225 stock rows (162 CR) but is undefined in `inventory.warehouse` — no name, no country |
| **Stock calculation logic unclear** | **YES** | No rule for choosing between the 3 sources; no rule for negative quantities (28 CRSF rows negative in Unit 3 alone); `reserved_quantity` / `shelf_quantity` present but their role in "available stock" is undefined; no DB function encodes any of it |
| Required data requires production changes | NO | Discovery required none |
| Task would require creating a new source of truth | **YES if implemented now** | Delivering Unit 18 / Kronen locations, received warehouse & date, History, and a single Shopify price would each require inventing data or rules absent from the source |

## Assumptions explicitly NOT made

- Did not treat any one of the three stock sources as authoritative.
- Did not substitute 0, NULL, or a rollup value for a missing warehouse-level figure.
- Did not clamp, absolute, or discard negative stock quantities.
- Did not pick a Shopify channel to resolve conflicting prices.
- Did not treat `containers.updated_at` as a goods-received date.
- Did not treat `main_container` ('UK'/'DE') as a receiving warehouse.
- Did not treat an ordered/assigned container as a received container.
- Did not rename `fitting_type = 'Front Fitting'` to match the business description "Front Fit".
- Did not assign meaning to `warehouse = 33`.
