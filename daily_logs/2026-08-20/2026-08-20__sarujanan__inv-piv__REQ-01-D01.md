date: 2026-08-20
developer: sarujanan
project: Postage Inventory Visibility
project_code: INV-PIV
phase: Phase-01 — Ceiling Rose Discovery & Dashboard
requirement_id: REQ-01
deliverable_id: D01
status: Completed
evidence_location: /home/led-247/POSTAGE-INVENTORY-VISIBILITY/evidence/01–18, documentation/ceiling-rose-discovery-report.md, validation/ceiling-rose-discovery-validation.md, validation/dashboard-validation-results.md, data-maps/ledsone-mcp-data-structure-map.md, sql/, dashboard/inventory-dashboard.html
blos_keys_used:
  - warehouse_unit_map
  - shelf_location_null_sentinels
  - container_arrived_only
  - shopify_price_site_uk
  - sot_source_tab
hardcoded_thresholds:
  - warehouse ids = 1 (UK Unit 3), 8 (UK Unit 4), 6 (UK Unit 18), 10 (Kronen), 7 (Schmutter), 4 (Canada), 32 (US)
  - shelf-location sentinels = '' and '-'
  - shopify price site = 'UK'
  - publish floor MIN_BYTES = 100000  (hub/publish.sh)
three_am_standard: TRUE
llm_queryable: TRUE
company_knowledge_candidate: TRUE
domain: Inventory — Postage & Warehouse — LEDSone MCP
User: Postage & Warehouse Team
Benefit status: Pass

---

## 1. SYSTEM STATE

Before today there was no inventory visibility tool for the Postage & Warehouse team. To
answer "how many CRSF100BM are in Unit 3 and where is it", a person had to open the LEDSone
admin, the Google Sheet SOT and the marketplace listing separately.

Known state of the data layer at the start:

- `configurator.components_sot_skus` held Google-Sheet-synced SKUs under a `source_tab`
  column, last synced **2026-08-10**.
- `inventory.physical_product_stock` held per-warehouse quantities, but nothing documented
  which warehouse id meant which physical unit.
- Three separate stock figures existed for the same SKU and **none was marked authoritative**.
- No documented rule existed for negative stock, reserved stock, or missing containers.

## 2. WHAT CHANGED TODAY

**Warehouse identity was established.** The seven warehouse ids the team actually uses were
mapped to their physical names by joining `inventory.physical_product_stock.warehouse` to
`inventory.warehouse` and cross-checking against shelf-location prefixes:
1 = UK Unit 3, 8 = UK Unit 4, 6 = UK Unit 18, 10 = Kronen, 7 = Schmutter, 4 = Canada, 32 = US.
Every stock column in the dashboard now reads from exactly one of these ids; there is no
"total" column, because a total would hide which building the stock is in.

**The three-source stock conflict was resolved by grain analysis, not by preference.**
The three candidates were tested against each other rather than ranked (see §3).

**The Ceiling Rose population was fixed at 332 SKUs** taken from
`components_sot_skus WHERE source_tab='ceilingrose'` — not from `sku LIKE 'CR%'`.

**Container logic was restricted to arrived orders.** A container is only shown when the
order carrying it has `orders.status_arrived` true, and only when exactly one such container
exists for the SKU/region; otherwise the cell shows the count instead of a name, so a SKU that
arrived on several containers never displays one of them as if it were the only one.

**Shelf-location sentinels were normalised.** `''` and `'-'` are stored in
`product_shelf_location` to mean "no location". Both are converted to NULL and rendered as
*Unavailable*, so an empty aisle never displays as a dash the picker might read as a real bay.

**The dashboard was built as a single self-contained HTML file** with the 332-row dataset
embedded as a JavaScript literal — no external JS, no external CSS, no fetch — so it can be
opened from a shared drive or the hub with no server.

**The Lampshade tab was opened and stopped.** Reading it exposed a Google Drive truncation
problem (§6) and an unresolved WC/cage classification question, so Lampshade was left at
discovery rather than being half-built.

## 3. POSTGRESQL / MCP FINDING

**Finding 1 — `local_inventory_current_stock_location_wise` is a derived availability
figure, not a competing stock source.**

The hypothesis tested was that source B is available-to-sell computed from source A:

```
GREATEST( SUM(physical_product_stock.quantity)
        - SUM(physical_product_stock.reserved_quantity), 0 )   -- per country
  vs  local_inventory_current_stock_location_wise.stock
```

| Country | SKUs | Reproduced by the formula | Rate |
|---|---|---|---|
| Germany | 332 | 332 | 100% |
| Canada | 332 | 332 | 100% |
| US | 331 | 331 | 100% |
| UK | 332 | 328 | 98.8% |
| **Total** | **1,327** | **1,323** | **99.7%** |

The four UK exceptions are 1–6 units and all in the same direction (rollup slightly higher),
consistent with a refresh lag rather than a different measure.

**This means the "55.4% UK mismatch" found in the first discovery pass was not a data
quality problem at all — it was a comparison of two different measures at two different
grains.** The 108,073-unit UK gap between the warehouse sum (236,139) and the country rollup
(128,066) is reserved stock plus grain difference, not corruption.

**Finding 2 — grain decides the source, not accuracy.**

| Source | Grain | Ruling |
|---|---|---|
| `inventory.physical_product_stock.quantity` | inventory × **warehouse unit** | **Authoritative** — the only source at the grain the question needs |
| `local_inventory_current_stock_location_wise.stock` | inventory × **country** | Derived from A; cannot answer "how many in Unit 3" |
| `components_sot_skus` attr `total_stock` | SKU (single figure) | No warehouse grain at all, and a 10-day-stale sheet snapshot |

`physical_product_stock` was verified **unique on (inventory, warehouse) — 0 duplicates**,
so summing it per warehouse cannot double-count.

**Finding 3 — the SOT sync only covers three tabs.**
`components_sot_skus` contained only `bulb` (218), `ceilingrose` (332) and `lampshade` (451).
No other Google Sheet tab was synced. Any category outside those three has no in-database
source of truth, which sets the ceiling on what can be trusted for the rest of the project.

**Finding 4 — all product images share one CDN prefix.**
Every Ceiling Rose image URL begins
`https://sin1.contabostorage.com/4ad62276cb6d4a83bfb1b8a91b839703:newom/newom/newom/img/product_images/`.
Storing only the filename and re-attaching the prefix once in JavaScript cut a large amount
of embedded weight with no loss of information.

## 4. GAP FOUND

- **No availability rule exists for this dashboard.** `reserved_quantity` is populated and
  non-zero (UK Unit 3: 101 across 31 rows; Unit 4: 23; Schmutter: 25; US: 6) but LEDSone MCP
  defines no rule saying whether the warehouse team should see on-hand or available.
- **No rule exists for negative stock.** 84 Ceiling Rose SKUs carry a negative quantity in at
  least one warehouse. Nothing in the database says what a negative means or how to display it.
- **No price history and no stock history** exist at SKU grain, so "what did this cost last
  month" cannot be answered from this system.
- **Container arrival is the only date available**; there is no per-warehouse received date,
  so "Received Date" can only ever be *Unavailable* for most SKUs.
- **Google Drive `read_file_content` silently truncates.** It returned 17 of 451 Lampshade
  SKUs — **3.8%** — with no error and no truncation marker.
- **WC/cage products have no authoritative classification anywhere.** Every synced SOT tab
  returns zero WC SKUs.

## 5. VALIDATION RULE ADDED OR CHANGED

**Rule — warehouse stock source**
```
IF a per-warehouse stock figure is required
THEN read inventory.physical_product_stock.quantity for that (inventory, warehouse)
ELSE do not substitute a country rollup or a sheet total_stock figure
```

**Rule — shelf location sentinel**
```
IF product_shelf_location IS NULL OR trim = '' OR trim = '-'
THEN location = Unavailable
ELSE location = the stored value verbatim
```

**Rule — container display**
```
IF exactly one container with orders.status_arrived = true exists for (SKU, region)
THEN show the container name
ELSE IF more than one exists
THEN show the count, never one of the names
ELSE show Unavailable
```

**Rule — price display**
```
IF listings.shopify_listings has exactly one distinct price for the SKU on site='UK'
THEN show that price
ELSE IF several distinct prices exist
THEN show the range and the count
ELSE show Unavailable
```

**Rule — negative and missing values**
```
Negative quantities are displayed exactly as stored — no clamping, no ABS(), no substitution.
A missing value is displayed as "Unavailable" — never as 0.
```

## 6. FAILURE MODE OR EDGE CASE

- **Silent truncation from the Drive reader.** 3.8% of a tab was returned as if it were the
  whole tab. Any count derived from it would have been wrong and would have looked fine.
  Mitigation adopted: read the workbook as an XLSX export and parse the worksheet XML, or
  export the tab by gid as CSV, and always reconcile the row count.
- **Stale SOT snapshot.** `components_sot_skus.synced_at` was 2026-08-10 — ten days old at
  extraction. Anything read from the sheet side is a snapshot, not a live figure.
- **`total_stock` disagreeing with physical stock on 161 of 332 SKUs (48.5%)** would look
  like a stock error to anyone who compared them without knowing the grain difference.
- **A "0" that really means "no row"** would be read by a picker as "we have none", when the
  truth is "we do not know". This is why *Unavailable* exists as a distinct rendering.
- **Publishing a truncated HTML file** would silently replace a working dashboard with a
  stub. Guarded by a 100,000-byte floor plus structural marker checks before any hub write.

## 7. DECISIONS MADE TODAY

- **Ruled `physical_product_stock` authoritative on grain, not on accuracy.** The other two
  sources are structurally incapable of answering a per-warehouse question, so the decision
  did not require judging which number is "right".
- **Did not apply `reserved_quantity`.** The requested column is warehouse stock; no business
  rule defines availability for this dashboard, so nothing was netted off.
- **Displayed negatives verbatim.** Inventing a clamp would hide a real operational signal.
- **Took the population from the SOT tab, not the SKU prefix.** `CR%` was measured and
  rejected.
- **Chose a single self-contained HTML file** over an app with a backend, so the deliverable
  survives being emailed, copied to a shared drive, or hosted on the hub unchanged.
- **Stopped Lampshade at discovery** rather than shipping a section built on a 3.8% sample.

## 8. COMPANY KNOWLEDGE EXTRACT

1. **When two stock numbers disagree, test the grain before judging the data.** At LEDSone,
   `local_inventory_current_stock_location_wise` is reproducible from
   `physical_product_stock` as `GREATEST(SUM(quantity) - SUM(reserved_quantity), 0)` at
   **99.7%**. It is a derived availability view, not a rival source. Future projects should
   not "reconcile" these two tables — they are answering different questions.
2. **Grain, not accuracy, selects the source of truth.** A more accurate number at the wrong
   grain cannot answer the question at all.
3. **A SKU prefix is not a category at LEDSone.** This is now measured, not assumed.
4. **The SOT sync is partial.** Only `bulb`, `ceilingrose` and `lampshade` are synced into
   `components_sot_skus`; every other Google Sheet tab lives outside the database. Any project
   depending on an unsynced tab is depending on a snapshot.
5. **`''` and `'-'` are both "no shelf location"** in `physical_product_stock`. Treat them
   identically or a picker will be sent to a bay called "-".
6. **Only `orders.status_arrived` containers are real arrivals.** Any container joined without
   that filter overstates what is physically in the building.
7. **Missing must not render as zero.** "Unavailable" and "0" are operationally opposite
   answers for a warehouse team.
8. **Google Drive `read_file_content` truncates silently.** Always reconcile row counts
   against an independent export before trusting a sheet read.

## 9. LLM STANDARD CHECK

| Check | Result |
|---|---|
| Terminology consistent (population, grain, source of truth, Unavailable) | TRUE |
| Business rules stated as executable IF/THEN | TRUE |
| Assumptions documented (reserved not applied; negatives verbatim) | TRUE |
| Edge cases documented (truncation, stale sync, sentinel values, 0-vs-missing) | TRUE |
| Evidence referenced by path | TRUE — evidence/01–18, validation/, data-maps/ |
| Another developer can continue independently | TRUE — every query is saved in `sql/` and `evidence/09`, `evidence/12` |
| LLM queryable | TRUE |
| Hardcoded thresholds surfaced for BLOS governance | TRUE — see metadata block |

## BLOS GOVERNANCE NOTE

These values are currently hardcoded and should move to BLOS tables:

| Value | Where it lives now | Why it must be governed |
|---|---|---|
| Warehouse id → unit-name map | SQL and the dashboard header | A new warehouse or a renumbering silently mislabels every stock column |
| Shelf-location sentinels `''`, `'-'` | SQL `NULLIF` chain | If a third sentinel appears it will render as a real bay |
| Shopify price site `'UK'` | SQL filter | A second UK channel would need a rule, not an edit |
| `orders.status_arrived` as the arrival definition | SQL filter | This is a business definition of "arrived", not a technical one |
| Publish floor `MIN_BYTES = 100000` | `hub/publish.sh` | A safety threshold protecting a live page |
