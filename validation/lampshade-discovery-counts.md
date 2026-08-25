# Lampshade Discovery — Exact Counts & Pass/Fail (Phases 10–11)

Date: 2026-08-24 · Discovery phase: READ-ONLY, dashboard not modified.
The implementation that followed (after GREEN sign-off) is recorded in the
**IMPLEMENTATION VALIDATION** section at the foot of this file.

## Phase 11 — Exact counts

| Metric | Google Sheet | Database | Difference | Status |
|---|---:|---:|---:|---|
| Total Lampshade SKUs (distinct) | **451** | **451** | 0 | ✅ md5-identical SKU sets |
| Total Lampshade rows | 452 | 451 | 1 | ⚠️ one duplicate sheet row |
| Metal | 352 | 352 | 0 | ✅ |
| Glass | 72 | 72 | 0 | ✅ (73 sheet rows − 1 duplicate) |
| Fabric | 13 | 13 | 0 | ✅ |
| Crystal Glass | 9 | 9 | 0 | ✅ |
| Natural Rope | 5 | 5 | 0 | ✅ |
| Duplicate SKUs | **1** (`LSGLWA140AR`) | 0 | 1 | ⚠️ DB kept one row |
| Bundle SKUs | 0 | 0 | 0 | ✅ within the SOT population |
| Unresolved SKUs | 0 | 0 | 0 | ✅ all 451 resolve 1:1 |
| Fitting: Easy Fit | 404 | 404 | 0 | ✅ |
| Fitting: `N/A` | 31 | 31 (as blank + `hole=10`) | 0 | ⚠️ label flattened, recoverable |
| Fitting: Pendant Light | 9 | 9 | 0 | ✅ |
| Fitting: Ceiling Mounted | 4 | 4 | 0 | ✅ |
| Fitting: `[VERIFY]` | 3 | 3 | 0 | ✅ |
| Shade shapes (distinct) | 46 | 46 | 0 | ✅ |
| `Product_Status = Active` | 451 | 451 | 0 | ✅ |
| `Product_Status = Draft` | 1 | 1 | 0 | ⚠️ include/exclude decision |
| Raw `LS%` in `inventory.products` | n/a | **2,438** | — | 81.5% contamination |
| `LS%` rows not in the sheet | n/a | **1,987** | — | bundles/packs/combos/EOL |

## Phase 10 — Data completeness for the 451 validated SKUs

Measured directly against LEDSone MCP, using the Ceiling Rose field logic unchanged.

| Field | Available | Note |
|---|---|---|
| SKU / product id | **451 / 451** | 1:1 |
| Title (description) | **451 / 451** | `inventory.products.title` |
| Active (`inventory_bool`) | **451 / 451** | |
| Image | **451 / 451** | all share one CDN prefix |
| Unit 3 stock row | **451 / 451** | |
| Unit 3 location | 361 / 451 | 90 NULL |
| Unit 4 stock row | **451 / 451** | |
| Unit 4 location | 350 / 451 | 101 NULL |
| Unit 18 stock row | **451 / 451** | |
| **Unit 18 location** | **0 / 451** | absent for every SKU |
| Kronen stock row | **451 / 451** | |
| **Kronen location** | **0 / 451** | absent for every SKU |
| Schmutter stock row | **451 / 451** | |
| Schmutter location | 235 / 451 | 216 NULL |
| CA stock row | **451 / 451** | |
| US stock row | **451 / 451** | |
| Last container (arrived, UK) | 229 / 451 | gated on `orders.status_arrived` |
| Received warehouse | **0 / 451** | no such column exists anywhere |
| Received date | **0 / 451** | `status_arrived` is boolean, no date |
| Shopify price — any UK listing | 138 / 451 | |
| Shopify price — single unambiguous | **110 / 451** | 28 have conflicting channel prices |
| History | **0 / 451** | no stock-history table exists |

Missing-field reasons are identical to Ceiling Rose and already documented in
`evidence/05` and `evidence/06`. No new gap type was introduced by Lampshade.

## Phase 1 — Ceiling Rose lock

| | |
|---|---|
| `const DATA` block | 130,874 chars · 332 rows |
| SHA-256 | `d24b8f0329b1623edc74e3fcca158c70f4637927004ff625f1712981b2596223` |
| MD5 | `4f74474c212b4af9d7cd547f4a8bc5f4` |
| Reference file | `validation/ceiling-rose-lock.txt` |

No file under `dashboard/` was written during this discovery. Re-hash to confirm.

## Pass / Fail

| Criterion | Result | Evidence |
|---|---|---|
| Every sheet category understood | **PASS** — 5 material families + 46 shapes, named exactly as the sheet writes them | evidence/19 |
| Every category's SKU mapping documented | **PASS** | data-maps/lampshade-sheet-skus.csv |
| Database SKU data fetched | **PASS** — 451 SKUs, 11 attributes | evidence/20 |
| Sheet → database comparison complete | **PASS** — 0 missing | evidence/20 |
| Database → sheet comparison complete | **PASS** — 0 missing in population; 1,987 prefix-only rows explained | evidence/20, 21 |
| Category mismatches identified | **PASS** — 0 material, 0 shape, 1 systematic fitting transform | evidence/20 |
| Prefix contamination tested | **PASS** — 81.5% contamination; prefix rejected as category key | evidence/21 |
| Exact counts established | **PASS** | this file |
| Final category logic deterministic | **PASS** | data-maps/lampshade-category-mapping.md |
| Ceiling Rose untouched | **PASS** — hash recorded, no dashboard write | validation/ceiling-rose-lock.txt |
| Evidence saved | **PASS** — 6 files | below |

**Discovery PASS.** Category logic was proven against both sources, not inferred.

---

# IMPLEMENTATION VALIDATION (2026-08-24)

## Lampshade counts — dashboard vs expected

| Category | Expected | Actual | Status |
|---|---:|---:|---|
| Metal | 352 | 352 | PASS |
| Glass | 72 | 72 | PASS |
| Fabric | 13 | 13 | PASS |
| Crystal Glass | 9 | 9 | PASS |
| Natural Rope | 5 | 5 | PASS |
| **Total** | **451** | **451** | **PASS** |

## Integrity

| Check | Result |
|---|---|
| 451 distinct SKUs | PASS |
| 0 dashboard duplicate SKUs | PASS (`LSGLWA140AR` once) |
| 0 bundles | PASS |
| 0 unresolved product mappings | PASS |
| 100% SKU → database resolution | PASS (451/451) |
| 100% image mapping | PASS (451/451) |
| Stock coverage | PASS — all 7 warehouses present on all 451 |
| Category coverage | PASS — 451/451 Level-1 |
| shade_shape coverage | PASS — 451/451, 46 values preserved |
| N/A recovery | **PASS — 31/31** |

## Ceiling Rose regression

| Check | Result |
|---|---|
| Count unchanged (332) | PASS |
| Embedded data unchanged | PASS — sha256 `d24b8f03…` identical |
| Category logic unchanged | PASS — CRSF 219 / CRFF 113, badge markup identical |
| UI unchanged | PASS — extra dropdowns hidden, breakdown text identical |
| Search / filter unchanged | PASS |
| CSV unchanged | PASS — 23 columns |

**Harness: `validation/test_lampshade.js` — 96 assertions, 96 passed, 0 failed.**
