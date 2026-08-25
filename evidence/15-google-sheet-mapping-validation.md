# Evidence 15 — Google Sheet Mapping Validation (Ceiling Rose)

Date: 2026-08-20 · Mode: READ-ONLY · Sheet not modified · Dashboard not modified

Spreadsheet: `1KbyvKhLr0fGc6N0IV-OhSaVl9YLAXdbw4zA4cUdhI-k` · GID `208319972`
Title: **`ledsone_postgresql_data_structure`** · Owner sarujanandigitweb@gmail.com
Created 2026-08-20 05:28:29Z · Modified 2026-08-20 05:29:10Z (≈41s after creation)

## Premise under test

> "The database-maintained data is available through this Google Sheet."

**Disproven as a data claim. Confirmed as a mapping claim.** The Sheet contains a catalogue of
*where data lives*; it contains no inventory data of any kind.

## 1. Access and tab enumeration

Read three independent ways to guarantee full coverage:

| Method | Result |
|---|---|
| Drive `get_file_metadata` | mimeType `application/vnd.google-apps.spreadsheet`, 18,117 bytes |
| Drive `download_file_content` → XLSX | Workbook contains **3 worksheets** (`sheet1`, `sheet2`, `sheet3`) |
| Drive `read_file_content` | 48,962 chars, **3 markdown blocks** — matches the 3 worksheets |
| `gviz/tq?tqx=out:csv&gid=208319972` | **Binds GID 208319972 to Tab 1** — returned header `Subject, Description, Business Entities, Table Location, Rows` |

All three tabs were parsed in full (not just visible rows) and written to CSV for inspection.

### Tab structure

| Tab | Purpose | Grain | Key field | Rows | Relevant to Ceiling Rose? |
|---|---|---|---|---:|---|
| **Tab 1** (GID 208319972) | Table catalogue — one row per database table | one database **table** | `Table Location` (`schema.table`) | 127 data rows | **Indirectly** — points at objects, holds no CR data |
| Tab 2 | Subject summary rollup | one **business subject** | `Subject` | 17 (16 subjects + TOTAL) | No |
| Tab 3 | Header / README — connection details and caveats | key–value notes | label | 17 | No |

Tab 1 columns, as the Sheet itself defines them: `Subject` (business area) · `Description` (what
the table holds + caveats) · `Business Entities` (**"the columns you would most likely filter or
join on. Not the full column list"**) · `Table Location` (`schema.table`) · `Rows` (exact at export).

No formulas, no hidden mapping columns, no database IDs, no product IDs were found in any tab.

## 2. Content test — does any tab hold Ceiling Rose data?

Regex sweep across all 45,381 characters of all three tabs:

| Probe | Result |
|---|---|
| `CRSF` token | **not present** |
| `CRFF` token | **not present** |
| "ceiling" (any case) | **not present** |
| "side fitting" | **not present** |
| "front fit" | **not present** |
| "rose" | **not present** |
| "Unit 3 / 4 / 18" | **not present** |
| "Kronen" | **not present** |
| "Schmutter" / "Trossingen" | **not present** |
| Shelf-location pattern (`1-F-01`, `L-B-17`…) | **not present** |
| Container pattern (`Container 08 2026`) | **not present** |
| `£` price values | **not present** |
| Image URLs | **not present** |
| SKU-shaped values in any first column | **0 of 161 rows** |

**Conclusion: the Sheet contains zero SKU rows, zero stock values, zero locations, zero container
records, zero prices and zero images.** It is structurally incapable of being a data source for
this dashboard — there is nothing in it to compare field-by-field.

## 3. Sheet → MCP mapping (what the Sheet *does* assert)

The Sheet's only mapping assertion is `Table Location` → a database object. Validated by set
comparison against `information_schema.tables` (157 base tables + 2 views).

| Sheet field | MCP object | MCP field | Mapping method | Match rate | Status |
|---|---|---|---|---:|---|
| `Table Location` | `information_schema.tables` | `table_schema`+`table_name` | Exact string | **126/127 = 99.2%** | **VALIDATED** |
| `Rows` | `count(*)` per table | — | Numeric, point-in-time | Drift 0–4.3% on `inventory` | **VALIDATED (stale by design)** |
| `Business Entities` | `information_schema.columns` | `column_name` | Partial list, `(+N more)` | **Not a schema definition** | **REFERENCE ONLY** |
| `Subject` | — | — | Human business grouping | no DB equivalent | **REFERENCE ONLY** |
| `Description` | — | — | Free-text prose | no DB equivalent | **REFERENCE ONLY** |

Catalogued but absent from MCP — 1: `business_reports.amz_traffic_by_asin` (live object is
`amz_sales_and_traffic_by_asin`, listed separately — stale/renamed entry).

Present in MCP but undocumented — 33 tables across 2 schemas. **Two are load-bearing for this task:**

| Undocumented object | Live rows | Dashboard depends on it for |
|---|---:|---|
| `configurator.components_sot_skus` (+2 siblings) | 550 / 306 / 99,130 | **CRSF/CRFF identity and Type** |
| `inventory.product_images` | 36,346 | **Product images** |

## 4. SKU identity — the Sheet cannot establish it

The Sheet documents neither the `configurator` schema nor any Ceiling Rose grouping. Following the
Sheet alone, the only available route to "Ceiling Rose" would be prefix matching on
`inventory.products.sku`, which the Sheet does list. That route is **wrong**:

| Method | Result |
|---|---:|
| `sku LIKE 'CRSF%'` on `inventory.products` | 10,982 |
| `sku LIKE 'CRFF%'` on `inventory.products` | 2,675 |
| — of which are bundle SKUs (contain `+`) | **12,924** |
| `configurator.components_sot_skus` where `source_tab='ceilingrose'` | **332** |

Prefix matching returns **13,657 rows, 94.6% of them bundles** — a 41× overstatement. The Sheet
offers no signal that would prevent this error, because the object that resolves it is undocumented.

## 5. Ceiling Rose SKU counts — validated against MCP

Re-queried live on 2026-08-20, independent of the dashboard:

| Metric | Google Sheet | LEDSone MCP | Difference | Status |
|---|---:|---:|---:|---|
| CRSF (Side Fitting) | not present | **219** | n/a | MCP matches target |
| CRFF (Front Fit) | not present | **113** | n/a | MCP matches target |
| Total | not present | **332** | n/a | MCP matches target |
| Duplicate SKUs | not present | **0** | n/a | PASS |
| Bundle SKUs | not present | **0** | n/a | PASS |
| Unresolved in `inventory.products` | not present | **0** | n/a | PASS |
| CRSF rows not prefixed `CRSF` | not present | **0** | n/a | PASS |
| CRFF rows not prefixed `CRFF` | not present | **0** | n/a | PASS |
| Rows missing `fitting_type` | not present | **0** | n/a | PASS |

The Sheet supplies no counts, so "difference" is undefined rather than zero. Every MCP figure hits
the stated validation target exactly.

## 6. Warehouse mapping — proven from MCP, not from the Sheet

The Sheet names no warehouses. Mapping proven directly against `inventory.warehouse` and
`inventory.physical_product_stock` for the 332 SOT Ceiling Rose SKUs:

| Sheet warehouse | MCP ID | MCP name | Stock field | Location field | CRSF rows | CRFF rows | Status |
|---|---:|---|---|---|---:|---:|---|
| *(absent)* Unit 3 | 1 | UK Unit3 | `physical_product_stock.quantity` | `product_shelf_location` | 219 | 113 | **PROVEN from MCP** |
| *(absent)* Unit 4 | 8 | UK Unit4 | same | same | 219 | 113 | **PROVEN from MCP** |
| *(absent)* Unit 18 | 6 | UK Unit18 | same | same (0 populated) | 219 | 113 | **PROVEN from MCP** |
| *(absent)* Kronen | 10 | Trossingen kronen str | same | same (0 populated) | 219 | 113 | **PROVEN from MCP** |
| *(absent)* Schmutter | 7 | Trossingen schmutter str | same | same | 219 | 113 | **PROVEN from MCP** |
| *(absent)* CA | 4 | Canada1 | same | same | 219 | 113 | **PROVEN from MCP** |
| *(absent)* US | 32 | US1 | same | same (0 populated) | 218 | 113 | **PROVEN from MCP** (1 CRSF SKU has no US row) |

Location coverage (excluding the `'-'` non-location sentinel): Unit 3 176/105, Unit 4 95/74,
Schmutter 143/38, Canada 19/3, Unit 18 0/0, Kronen 0/0, US 0/0 (CRSF/CRFF). These reconcile exactly
with the dashboard's null counts (e.g. Unit 3: 176+105 = 281 = 332−51).

**No warehouse label in this mapping came from the Sheet.** Every one was proven from
`inventory.warehouse`. Nothing was renamed or reinterpreted.

## 7. Stock source validation

The Sheet's Tab 1 describes both stock tables, and its descriptions **support** the source-of-truth
ruling already recorded in `evidence/10` rather than contradicting it:

| Table | Sheet description | Role |
|---|---|---|
| `inventory.physical_product_stock` | *"Each row is one product at one warehouse… actual quantity, and reserved quantity. Combo/derived product stock is not in this table"* | **Physical on-hand, warehouse grain — AUTHORITATIVE** |
| `inventory.local_inventory_current_stock_location_wise` | *"…broken down by warehouse location. Usage: this location-wise stock data is pushed/updated to each platform's product listings"* | Sellable figure published to channels — **derived, country grain** |

The Sheet holds no stock values, so it uses no stock source. What it does is *document* the two
tables, and its wording independently corroborates the ruling that warehouse-level stock must come
from `physical_product_stock.quantity`.

Recorded caution: the phrase "broken down by warehouse location" invites the rollup to be mistaken
for warehouse-level data. It is not — 175,583 rows ÷ 43,936 products = 4, values `UK`/`Germany`/
`Canada`/`US`. Country grain. It cannot express Unit 3 vs Unit 4 vs Unit 18.

## 8. Field-by-field Sheet vs MCP comparison

| Measure | Value |
|---|---:|
| Ceiling Rose rows available in the Sheet | **0** |
| Ceiling Rose rows available in MCP | **332** |
| Rows comparable | **0** |
| Exact matches | 0 (of 0) |
| Mismatches | 0 (of 0) |
| Stale values | 0 |
| Transformed values | 0 |
| Match percentage | **undefined — no comparable values exist** |

This is not a failed comparison; it is a comparison with no left-hand side. The Sheet is a
catalogue. Reporting a "0% match" would misrepresent it as a failed data snapshot.

Per required field, Sheet availability vs MCP availability:

| Field group | Field | In Sheet? | In MCP? | Direct or derived |
|---|---|:-:|:-:|---|
| Product | SKU | NO | YES `inventory.products.sku` | direct |
| Product | Type | NO | YES `configurator` `fitting_type` *(undocumented in Sheet)* | direct |
| Product | Description | NO | YES `products.title` / SOT `product_subtype` | direct |
| Product | Image | NO | YES `inventory.product_images` *(undocumented in Sheet)* | direct |
| UK | Unit 3 / 4 / 18 stock | NO | YES `physical_product_stock.quantity` | direct |
| UK | Unit 3 / 4 location | NO | YES `product_shelf_location` | direct (partial coverage) |
| UK | Received Warehouse | NO | **NO** | — |
| UK | Received Date | NO | **NO** | — |
| UK | Container Number | NO | Partial `suppliers` (`status_arrived`, 54 unambiguous) | direct |
| UK | Shopify Price | NO | Partial `listings.shopify_listings` (58 unambiguous) | direct |
| UK | History | NO | **NO** | — |
| German | Kronen / Schmutter stock | NO | YES `physical_product_stock.quantity` | direct |
| German | Kronen location | NO | **NO** (0/332 populated) | — |
| German | Schmutter location | NO | YES (181/332) | direct |
| German | Received Warehouse / Date / History | NO | **NO** | — |
| German | Container Number | NO | Partial (16 unambiguous) | direct |
| Other | CA / US stock | NO | YES `physical_product_stock.quantity` | direct |

## 9. Source-of-truth decision

**A — `Mapping/reference only`**

Evidence:

1. **Structure** — three tabs, all metadata: a table catalogue, a subject rollup, and a README. No
   data grain below "one database table".
2. **Content** — zero hits for CRSF, CRFF, ceiling, rose, any warehouse name, any shelf location,
   any container, any price, any image across 45,381 characters.
3. **Self-description** — Tab 3 states the connection details and the read-only role; Tab 1 defines
   `Table Location` as *"use this in SQL"*. The document describes itself as a pointer, not a store.
4. **Timestamps** — created and modified 41 seconds apart, consistent with a one-shot generated
   export, not a maintained dataset.
5. **Row counts** — `Rows` is explicitly "exact at time of export, not estimates… they move
   constantly, syncs run every minute", i.e. a snapshot of *counts*, never of records.
6. **MCP comparison** — 126/127 pointers resolve; the objects hold the data, the Sheet does not.

It is **not** B (database-maintained snapshot): a snapshot would contain records. It is **not** C
(authoritative source): it omits `configurator` and `inventory.product_images`, and its one stale
entry proves it is not self-correcting. It is **not** D (mixed): all three tabs play the same role.

## 10. Complete validated MCP dataset

| Metric | Value | Target | Status |
|---|---:|---:|---|
| CRSF (Side Fitting) | 219 | 219 | **MATCH** |
| CRFF (Front Fit) | 113 | 113 | **MATCH** |
| Total | 332 | 332 | **MATCH** |
| Duplicates | 0 | 0 | **MATCH** |
| Invalid / bundle | 0 | 0 | **MATCH** |
| Unresolved | 0 | 0 | **MATCH** |

Dashboard embedded data re-hashed and unchanged: `3fb73cc4f4f6886209f561cdc8cbe9f3…`, 332 rows.

## 11. Scope compliance

| Restriction | Status |
|---|---|
| Sheet not modified | **PASS** — read-only Drive calls only |
| Production data unchanged | **PASS** — `SELECT` only |
| Schema unchanged | **PASS** |
| Dashboard unmodified | **PASS** — SHA-256 identical |
| No new source of truth created | **PASS** — evidence documents only |
| Not committed or pushed | **PASS** |
