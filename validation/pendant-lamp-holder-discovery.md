# Pendant Lamp Holder — Exact Counts, Data Availability & Pass/Fail (Phases 12–14)

Date: 2026-08-24 · READ-ONLY · **Dashboard NOT modified**

## Phase 12 — Exact counts

| Metric | Google Sheet | Database | Difference | Status |
|---|---:|---:|---:|---|
| Total distinct SKUs | **398** | **398** resolve 1:1 | 0 | ✅ |
| Total rows | 406 | — | 8 | ⚠️ 8 duplicate sheet rows |
| Raw `PH%` in `inventory.products` | n/a | **2,631** | — | 84.9% contamination |
| Single (non-`+`) `PH` SKUs | n/a | **550** | — | |
| Singles not in the sheet | n/a | **152** | — | classified below |
| — pack + combo-titled | 0 | 67 | 67 | ✅ correctly excluded |
| — combo-titled only | 0 | 1 | 1 | ✅ correctly excluded |
| — end-of-line | 32 *(kept by sheet)* | 28 *(not in sheet)* | — | ⚠️ owner decision |
| — **active singles absent from sheet** | 0 | **56** | 56 | ⚠️ **needs review** |
| Bundle SKUs | 0 | 2,081 | 2,081 | ✅ excluded |
| Pack SKUs | 0 | 67 | 67 | ✅ excluded |
| Combo SKUs | 0 | 68 | 68 | ✅ excluded |
| Inactive | 0 | 68 | 68 | ✅ excluded |
| Unresolved | 0 | 0 | 0 | ✅ |
| **Category 1** | — | — | — | ❌ **no category declared by the sheet** |

Category rows cannot be filled: the sheet declares no Level-1 grouping
(`Product_Type` and `Product_Subtype` are constant across all 406 rows, and there are no
banner rows). See `data-maps/pendant-lamp-holder-mapping.md`.

## Phase 13 — Data availability for the 398 validated SKUs

Population reconciled exactly: `PH%` singles minus the 152 excluded = **398**.

| Field | Available | Note |
|---|---|---|
| SKU / product id | **398 / 398** | 1:1 |
| Type | **0 / 398** | no product-type field exists for PH in the DB |
| Description (`products.title`) | **398 / 398** | |
| Image | **398 / 398** | |
| Unit 3 stock | **398 / 398** | |
| Unit 4 stock | **398 / 398** | |
| Unit 18 stock | **398 / 398** | |
| Kronen stock | **398 / 398** | |
| Schmutter stock | **398 / 398** | |
| CA stock | **398 / 398** | |
| US stock | **398 / 398** | |
| Unit 3 location | 378 / 398 | 20 NULL |
| Unit 4 location | 188 / 398 | 210 NULL |
| **Unit 18 location** | **0 / 398** | absent for every SKU |
| **Kronen location** | **2 / 398** | effectively absent |
| Schmutter location | 328 / 398 | 70 NULL |
| Container (arrived) | 122 / 398 | gated on `orders.status_arrived` |
| **Received warehouse** | **0 / 398** | no such column exists anywhere |
| **Received date** | **0 / 398** | `status_arrived` is boolean, no date |
| Shopify price — any UK listing | 149 / 398 | |
| Shopify price — single unambiguous | **75 / 398** | 74 have conflicting channel prices |
| **History** | **0 / 398** | no stock-history table exists |

Inventory data is **complete** (all 7 warehouses on all 398). The gaps are the same
product-agnostic ones already documented for the two completed sections
(`evidence/05`, `evidence/06`) — plus one new gap unique to this section: **Type**.

## Phase 14 — Locked-sections regression

| Section | Before | After | Result |
|---|---|---|---|
| Ceiling Rose `const DATA` | `d24b8f0329b1623edc74e3fcca158c70f4637927004ff625f1712981b2596223` | *(unchanged)* | **PASS** |
| Lampshade `const LS_DATA` | `7b8aeae0e9deceda2044a86a3e34d6a71af1b43b055d2449f055bcddfbcc346a` | *(unchanged)* | **PASS** |
| Whole dashboard file | `99ea824658232f8a29f09e5aae94374b4b2f3941f2710488bb7db164136ad311` | *(unchanged)* | **PASS** |

Reference: `validation/locked-sections-lock.txt`. No file under `dashboard/` was written
during this discovery.

## Pass / Fail

| Criterion | Result | Evidence |
|---|---|---|
| Correct sheet tab identified | **PASS** (on content; the gid itself is unverifiable from an XLSX export — stated, not assumed) | evidence/23 |
| All SKU prefixes/patterns documented | **PASS** — one prefix `PH`, proven unsafe as a rule | evidence/25, data-maps |
| Complete sheet SKU set extracted | **PASS** — 406 rows / 398 distinct, duplicates retained | data-maps/…-sheet-skus.csv |
| Database population identified | **PASS** — 2,631 raw → 550 singles → 398 | evidence/24, 25 |
| Both-direction comparison complete | **PASS** — 0 sheet→DB missing; 152 DB→sheet classified | evidence/24 |
| Category mismatches documented | **FAIL — not possible.** The DB holds no category field for PH SKUs, so no comparison exists | evidence/24 |
| Prefix contamination tested | **PASS** — 84.9%, with 21 named false positives | evidence/25 |
| Authoritative mapping proven | **FAIL — no authoritative source in the DB.** The only curated list is the unsynced sheet tab | evidence/24 |
| Exact counts reconciled | **PASS** | this file |
| Evidence saved | **PASS** — 6 files | below |
| Ceiling Rose & Lampshade unchanged | **PASS** — all three hashes identical | this file |

**Overall: FAIL on two criteria** — the authoritative mapping is not proven and the category
comparison is impossible. Population is solid; classification is not.
