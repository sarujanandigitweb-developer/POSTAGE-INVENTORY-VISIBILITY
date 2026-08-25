date: 2026-08-24
developer: sarujanan
project: Postage Inventory Visibility
project_code: INV-PIV
phase: Phase-02 — Multi-Category Rollout
requirement_id: REQ-02
deliverable_id: D01
status: Completed — Lamp Holder source correction outstanding
evidence_location: /home/led-247/POSTAGE-INVENTORY-VISIBILITY/evidence/19–32, validation/, data-maps/, sql/, dashboard/inventory-dashboard.html, hub/
blos_keys_used:
  - population_source_sheet_sot_tab
  - warehouse_unit_map
  - shelf_location_null_sentinels
  - container_arrived_only
  - shopify_price_site_uk
  - category_source_declared_by_sheet_only
hardcoded_thresholds:
  - pack detection regex = '[0-9A-Z]PK$'
  - bundle detection = SKU contains '+'
  - combo detection = description ILIKE '%combo%'
  - lampshade N/A fitting recovery key = hole_diameter_mm = '10'  (exactly 31 SKUs)
  - publish floor MIN_BYTES = 100000  (hub/publish.sh)
  - warehouse ids = 1, 8, 6, 10, 7, 4, 32
three_am_standard: TRUE
llm_queryable: TRUE
company_knowledge_candidate: TRUE
domain: Inventory — Postage & Warehouse — LEDSone MCP
User: Postage & Warehouse Team
Benefit status: Pass — all six categories live; Lamp Holder carries a documented source gap (see §4)

---

## 1. SYSTEM STATE

At the start of the day the dashboard held **one live category** — Ceiling Rose, 332 SKUs,
completed and locked on 2026-08-20. Five categories were rendered as GAP chips with a reason
string instead of data: Pendant Lamp Holder, Lampshade, Wall Arm, LampHolder, LED Bulbs.

Known state:

- `configurator.components_sot_skus` synced only three tabs — `bulb` 218, `ceilingrose` 332,
  `lampshade` 451. Every other category had **no in-database source of truth**.
- Lampshade was stuck at discovery because Google Drive `read_file_content` had returned
  **17 of 451 SKUs (3.8%)** silently on 2026-08-20.
- No mechanism existed to prove a finished section had not been altered by later work.

## 2. WHAT CHANGED TODAY

**A non-truncating sheet read was established.** Two routes were proven: export the workbook
as XLSX and parse `xl/worksheets/*.xml` directly, and export a single tab by gid as CSV
(`/export?format=csv&gid=<gid>`). The gid route is authoritative because **gids are not
carried in the XLSX** — the XLSX only preserves tab order and names.

**A locked-section mechanism was created.** The embedded dataset of each finished category is
hashed with SHA-256 and recorded in `validation/locked-sections-lock.txt`. Every later change
re-hashes and compares, so "I did not touch Ceiling Rose" is a byte-level proof rather than a
claim.

**Five categories were implemented**, each with its population taken from its own Google Sheet
SOT tab and never from the SKU prefix:

| Category | Sheet tab (gid) | Population | Category source |
|---|---|---|---|
| Lampshade | `lampshade_SOT` (816515986) | 451 | 5 material families |
| Pendant Lamp Holder | `Pendant Lamp Holder_SOT` (2041874053) | 398 | none declared → Mount Type as an attribute |
| Wall Arm | `Wall_Arm_SOT` (1720361941) | 180 | `Product_Subtype`, 11 families |
| LED Bulbs | `LED BULBS_SOT` (297008248) | 218 | banner rows, 10 series |
| Lamp Holder | `LampHolder_SOT ` (1423341591) | 226 | none declared → Mount Type as an attribute |

**Extraction was made verifiable.** Every dataset was pulled in chunks where `md5()` is
computed **in the same transaction as the data**, then byte-verified locally before injection.
This was a direct response to a chunk that failed verification on the Lampshade run (§6).

**An automated regression harness was grown from 96 to 248 assertions.** It executes the
dashboard's real inline `<script>` against a DOM stub, so the shipped render, filter and CSV
code is exercised — not a copy of it.

**The dashboard was published to the Varman AIOS hub and its slug renamed in place.**

## 3. POSTGRESQL / MCP FINDING

**Finding 1 — the SOT sync still covers only three tabs.** Re-verified live:
`bulb` 218, `ceilingrose` 332, `lampshade` 451, all `synced_at` 2026-08-20 06:41:56.
Wall Arm, Pendant Lamp Holder and Lamp Holder have **zero rows** in
`components_sot_skus` under any tab, so their classification exists only in the Google Sheet.

**Finding 2 — LED Bulbs is the only new category with an in-database source of truth.**
The 218 distinct SKUs on `LED BULBS_SOT` match `source_tab='bulb'` exactly — 218 = 218,
0 in-database-not-sheet, 0 in-sheet-not-database.

**Finding 3 — `inventory.products` has no category column.** Searched
`information_schema.columns` across `inventory`, `configurator`, `listings` and `suppliers`
for any column matching categor%/product_type/subtype/family/fitting. The only hits are
marketplace listing tables. **There is no catalogue classification in the core product table.**

**Finding 4 — `listings.shopify_listings.product_type` is not usable as a classifier.**
For LH-prefixed SKUs it returns **21 distinct free-text values**, one SKU can carry several,
and the values include `LAMPSHADE`, `Light Bulbs`, `Wall Light` and `Pendant Lighting`.

**Finding 5 — the Lampshade `N/A` fitting group is recoverable deterministically.**
The sheet's `N/A` fitting values arrive in the database as empty strings, so the group cannot
be selected by name. `hole_diameter_mm = '10'` selects **exactly 31 SKUs** — the same 31 —
making the group recoverable without guessing.

**Finding 6 — the workbook contains two tabs called `LampHolder_SOT`.** One is hidden with
998 rows in a header-less layout; the other is visible with **a trailing space in its name**
and 249 rows. Only the gid distinguishes them. Selecting by name would have pulled a 4× larger,
differently-shaped population.

**Finding 7 — all categories share one image CDN prefix**, so the filename-only storage
pattern established for Ceiling Rose applies unchanged to all five new categories.

## 4. GAP FOUND

**The Lamp Holder tab cannot supply a business category, and this is now proven rather than
asserted.** All 61 of its columns were assessed over all 247 rows:

| Outcome | Columns |
|---|---|
| Incomplete (<100% filled — cannot classify every SKU) | 27 |
| Constant or entirely empty | 24 |
| Dominated (>90% a single value) | 4 |
| Uncontrolled (>20 distinct values) | 3 |
| SKU key | 1 |
| **Survive the mechanical filter** | **2** — `Shade Support` (a boolean) and `Phrase Match Keyword` (a PPC advertising field) |

The tab has **no `Product_Type` and no `Product_Subtype`** — the only tab in the workbook
missing both. Its `Product Name` column is **100% empty**.

**15 of its 247 rows are corrupt, not merely missing.** 13 end in an unknown `-IDE` suffix and
2 hold a SKU joined to a name fragment. No product anywhere in the catalogue ends in `-IDE`
(0 rows), and `LHCE27` / `LHNSE27` do not exist either. An image-based recovery attempt showed
**all 15 point at unrelated combo products** (wall cages, ceiling-rose bundles, pendant sets) —
which proves they are unrecoverable, so no identity was inferred from them.

**The Lamp Holder sheet is stale in both directions:** 68 of its 226 usable SKUs (30.1%) are
end-of-line, while **157 live, non-EOL lamp holders are missing from it entirely** — whole
families (GU10, MR16, batten, floor-lamp, wood, turning holders) plus colour variants of
families it does list. For comparison, Ceiling Rose is 11.7% EOL and Lampshade 2.4%.

**Other gaps:**
- `LHXDE27WH` is inside the accepted Lamp Holder population but its database description reads
  `XD-3027 (E27) LED Bulb/Light with Copper Granules` — a bulb, not a holder.
- `PHXSH1PBRWH` sits on the Lamp Holder tab but belongs to Pendant Lamp Holder, where it is
  already carried. Including it would create a duplicate dashboard record.
- 5 Lamp Holder rows are packs with the placeholder description `Combo Default Title.` and
  **zero stock rows in all seven warehouses**.
- 3 LED Bulb SKUs appear under **two banner series each** — `LDEST64E273` (ST64 /
  Filament-Deco), `LDSST64E274` (ST64 / Spiral-Filament), `LDDRC35E144` (Small-Shapes /
  Deco-Colour). This is why the banner counts sum to 221 while the SKU count is 218.
- The Lamp Holder tab has no column marking a row as a pack, so the only signal is the SKU
  suffix — exactly the kind of inference this project rules out.

## 5. VALIDATION RULE ADDED OR CHANGED

**Rule — population selection (applies to every category)**
```
IF the SKU appears on the category's Google Sheet SOT tab
   AND upper(sku) resolves to exactly one row in inventory.products
THEN include it in the dashboard population
ELSE exclude it and record the reason in evidence

The SKU prefix is never the population.
```

**Rule — category assignment**
```
IF the sheet declares a Level-1 column (Product_Subtype) or banner rows
THEN use it verbatim as the category filter
ELSE set fams = [] so the dropdown reads "All <category>"
     AND expose the nearest attribute as an ATTRIBUTE filter, labelled as the attribute
     AND never label that attribute as the category
```

**Rule — duplicate sheet rows**
```
IF a SKU appears on more than one sheet row
THEN compare the classification on every one of its rows
     IF they agree  -> de-duplicate (lossless) and report the DISTINCT-SKU count
     IF they differ -> record the conflict and take the first occurrence in sheet order,
                       and state in the UI/evidence that the source must decide
Never present a ROW count as a PRODUCT count.
```

**Rule — cross-section ownership**
```
IF a SKU already exists in another implemented section
THEN it stays with that section and is excluded here
Rationale: one product must never appear as two dashboard records.
```

**Rule — extraction integrity**
```
Every chunk must return md5(payload) computed in the SAME transaction as the payload.
IF the locally computed md5 of the received bytes != the returned md5
THEN do not inject; diagnose row by row.
```

**Rule — locked section regression**
```
Before publishing, re-hash every finished category's embedded dataset with SHA-256
and compare against validation/locked-sections-lock.txt.
IF any hash differs THEN the change is rejected.
```

**Rule — blank attribute values**
```
IF the sheet's attribute cell is blank
THEN render "Unavailable"
ELSE render the sheet value verbatim (whitespace/newline normalisation only)
Never merge, rename or infer an attribute value.
```

## 6. FAILURE MODE OR EDGE CASE

- **Live-database drift invalidated a checksum mid-extraction.** A Lampshade chunk returned
  md5 `f2d216…` when sized and `728019…` when fetched (24,580 vs 24,579 chars). Row-level
  comparison showed all 150 rows matched current state — a stock quantity had lost a digit
  between the two round-trips. **A checksum computed in a separate query proves nothing on a
  live database.** Fixed by computing md5 in the same transaction as the data.
- **A SKU regex that excludes dots silently drops products.** `PH[A-Z0-9]+` missed
  `PHSQ1.5PBRYB` and `PHUH0.5HETBM`; the count read 404 instead of 406 and looked plausible.
- **Tab names are not unique** (`LampHolder_SOT` vs `LampHolder_SOT `). Only the gid is safe.
- **A slug change is not a rename.** `push_to_hub.js` upserts on `(member_name, page_slug)`,
  so publishing under a new slug **inserts a second page** rather than renaming the first.
  This created a duplicate hub row that had to be removed with a dedicated UPDATE.
- **Publishing a stub over a working page** — guarded by the 100,000-byte floor and structural
  marker checks.
- **A pack SKU with no stock rows** renders as *Unavailable* in all seven warehouses and a
  placeholder description, which a picker could read as a real but empty product.

## 7. DECISIONS MADE TODAY

- **Stopped at RED on Lamp Holder rather than inventing a category**, and produced a
  source-correction report (evidence/30) with 12 explicit owner decisions instead of a
  half-true section.
- **Later implemented Lamp Holder with `fams: []`** once the team needed the GAP closed —
  the population is fully validated (226 of 247), the category dropdown honestly reads
  "All Lamp Holder", and Mount Type is exposed verbatim as an attribute with 11 blanks
  rendered *Unavailable*. **No category was invented at any point.**
- **Kept sheet-declared end-of-line SKUs in the population.** Removing them would silently
  shrink the agreed population; they are reported instead.
- **Assigned the 3 conflicting LED Bulb SKUs their first banner in sheet order** and recorded
  the conflict rather than choosing on merit.
- **Used `source_tab='bulb'` directly for LED Bulbs** because it matches the sheet exactly,
  making that section the only new one backed by the database rather than a snapshot.
- **Renamed the hub slug with an `UPDATE`, not a re-publish**, to keep hub page id 218 and
  remove the duplicate row 252 the upsert had created.

## 8. COMPANY KNOWLEDGE EXTRACT

1. **SKU prefix matching has now failed on five consecutive categories at LEDSone.**
   Measured contamination: Ceiling Rose 94.6%, Lampshade 81.5%, Pendant Lamp Holder 84.9%,
   Lamp Holder 78.2%, Wall Arm 73.3%. Treat "prefix = category" as false by default and
   measure it before any use.
2. **Always address a Google Sheet tab by gid, never by name.** Tab names repeat, and a
   trailing space is invisible in the UI. Gids are not carried in an XLSX export.
3. **Compute checksums in the same transaction as the payload.** On a live database a
   two-round-trip checksum can fail for reasons that have nothing to do with transfer.
4. **Row count ≠ distinct SKU count on SOT tabs.** Pendant Lamp Holder: 406 rows → 398 SKUs;
   the Mount Type split is 294/112 by row but **291/107 by product**.
5. **`components_sot_skus.source_tab` is the only in-database catalogue classification that
   exists**, and it covers three tabs. Everything else is a sheet snapshot.
6. **A hub slug change inserts, it does not rename.** `push_to_hub.js` upserts on
   `(member_name, page_slug)`. To rename, `UPDATE` the row and delete the duplicate — the
   helper for this is `hub/rename_slug.js`.
7. **SHA-256 the embedded dataset of every finished section.** It converts "I did not break
   the other sections" from a claim into a check that runs in a second.
8. **Store the image filename, not the URL.** All LEDSone product images share one CDN prefix;
   re-attaching it once in JavaScript removes tens of KB per category.
9. **A sheet can be stale in both directions at once.** Lamp Holder holds 68 dead SKUs while
   omitting 157 live ones — measuring only one direction would have missed half the problem.
10. **Prove a corrupt row is unrecoverable before excluding it.** The image check on the 15
    `-IDE` rows turned "we could not resolve these" into "these point at wall cages and
    pendant bundles, so they cannot be resolved" — which is what makes the exclusion defensible.

## 9. LLM STANDARD CHECK

| Check | Result |
|---|---|
| Terminology consistent with 2026-08-20 (population, grain, Unavailable, locked section) | TRUE |
| Business rules stated as executable IF/THEN | TRUE |
| Assumptions documented (first-banner-wins; EOL retained; no category invented) | TRUE |
| Edge cases documented (drift, regex, tab-name collision, slug upsert) | TRUE |
| Evidence referenced by path | TRUE — evidence/19–32, validation/, data-maps/, sql/ |
| Another developer can continue independently | TRUE — every extraction query is saved in `sql/`, and the harness reproduces every count |
| LLM queryable | TRUE |
| Hardcoded thresholds surfaced for BLOS governance | TRUE — see metadata block |

## RESULT

| Category | SKUs | Category source |
|---|---|---|
| Ceiling Rose | 332 | CRSF / CRFF (locked, byte-identical) |
| Pendant Lamp Holder | 398 | none declared — Mount Type as attribute |
| Lampshade | 451 | 5 material families |
| Wall Arm | 180 | `Product_Subtype`, 11 families |
| Lamp Holder | 226 | none declared — Mount Type as attribute |
| LED Bulbs | 218 | banner rows, 10 series |
| **Total** | **1,805** | **0 GAP chips remaining** |

Regression: **248 assertions, 0 failures**. Ceiling Rose `d24b8f03…`, Lampshade `7b8aeae0…`,
Pendant Lamp Holder `7bbcec58…` all verified byte-identical after every change.
Published to the Varman AIOS hub as `sarujanan` / `postage-inventory-visibility`, **page id 218**.

## BLOS GOVERNANCE NOTE

New values that should move out of code and into BLOS tables:

| Value | Where it lives now | Why it must be governed |
|---|---|---|
| `[0-9A-Z]PK$` as "this is a pack" | extraction SQL and the harness | A new pack suffix silently becomes a single product |
| `'+'` as "this is a bundle" | extraction SQL | Same risk in reverse |
| `description ILIKE '%combo%'` | extraction SQL | A description edit changes a product's classification |
| `hole_diameter_mm = '10'` = the Lampshade N/A fitting group | extraction SQL | An undocumented recovery key; if the sync changes, 31 SKUs silently move |
| "first banner in sheet order wins" for the 3 conflicting LED SKUs | data-prep script | A tie-break rule, not a business rule — the source owner must decide |
| Population = sheet SOT tab, never SKU prefix | project convention | This is the single most important rule in the project and it is currently only written in evidence |
