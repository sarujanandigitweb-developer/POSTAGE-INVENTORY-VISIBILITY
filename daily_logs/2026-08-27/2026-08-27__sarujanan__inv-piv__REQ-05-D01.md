---
date: 2026-08-27
developer: sarujanan
project: Postage Inventory Visibility
project_code: INV-PIV
phase: Phase-05 — Population Correctness: Lamp Holder reconciled and repopulated
requirement_id: REQ-05
deliverable_id: D01
status: Completed — 43,550 units made visible; one parser defect reproduced deliberately and logged
evidence_location: /home/led-247/POSTAGE-INVENTORY-VISIBILITY/evidence/48–49, validation/, sql/, dashboard/inventory-dashboard.html
blos_keys_used:
  - population_source_sheet_sot_tab           (superseded for Lamp Holder)
  - population_source_sku_prefix_declared     (now governs Lamp Holder)
  - single_component_only_no_bundle_no_pack
  - stock_history_free_text_product_history
  - shopify_price_listing_data_channel_3
  - container_latest_by_order_date
  - warehouse_unit_map
hardcoded_thresholds:
  - Lamp Holder population rule = SKU prefix LH, excluding `%+%` and `[0-9A-Z]PK$`
  - stock history carried per SKU per region = 12 most recent
  - Shopify store preference = ledsone first, then any UK store
three_am_standard: TRUE
llm_queryable: TRUE
company_knowledge_candidate: TRUE
domain: Inventory — Postage & Warehouse — LEDSone MCP
User: Postage & Warehouse Team
Benefit status: Pass — 191 missing SKUs and 43,550 units restored to the dashboard

---

## 1. SYSTEM STATE

At the start of the day the dashboard held **twelve sections, 5,661 SKUs**, regression at
**1,165 assertions**, all fourteen embedded datasets locked and byte-identical.

Lamp Holder showed **226 SKUs**. The user reported that `public.inv_products` returns
**413** for the same prefix and asked which figure was wrong.

## 2. WHAT CHANGED TODAY

**The 226 was reconciled and found to come from a different source entirely.** It is not a
filter on `inv_products` at all — it is the `LampHolder_SOT ` Google Sheet tab. No
combination of `inventory_bool` / `isdeleted` / channel filters could ever have reproduced
it. Written up in evidence/48.

**Lamp Holder was repopulated from the `LH` prefix: 226 → 417.** 191 SKUs that exist in
`inventory.products` appeared on no section of the dashboard. **158 are live, 133 carry
stock, and 43,550 units were sitting on shelves the team could not see.**

**The `product_history` parser was rebuilt.** It had never been saved, and the 168 new SKUs
with history needed it. It was proved against the rows already published rather than
inspected: **2,626 / 2,626 embedded Lamp Holder movements re-derived exactly**, all 590
region sequences, all 590 `HIST_TOTAL` entries, and **all 226 SKUs re-encode byte-identical
to `HIST_RAW`**. It is committed to `sql/product-history-parser.js`.

**Two new read-only validators were added** — `validation/verify-locks.js` re-hashes every
dataset, `validation/check-lamp-holder.js` loads the data layer and reports the section.

**Dashboard total 5,661 → 5,852. Page 4.71 MB → 4.81 MB.**

## 3. POSTGRESQL / MCP FINDING

**Finding 1 — a dashboard section can be populated from a source the database cannot see.**
`configurator.components_sot_skus` has **zero** rows under any `lampholder` tab, so Lamp
Holder was built from the Google Sheet. Two numbers describing "the same" thing came from
two unconnected systems, and no query against either could reconcile them.

**Finding 2 — the sheet was stale in one direction only.** All 226 dashboard rows exist in
the database; there are **no phantom rows**. The entire gap is 191 SKUs missing from the
sheet. 226 + 191 = 417 exactly.

**Finding 3 — the `LH` prefix is clean, unlike the other prefix-defined sections.** 380 of
417 (**91.1%**) say "holder" in their own description. The remaining 37 are holder *parts* —
lids, teeth rings, rods, lamp heads. Elsewhere in this dashboard prefix membership ran
73–95% contaminated; here the prefix is right and the sheet is the artefact.

**Finding 4 — 417 is the single-component count, not the listing count.** Excluding `%+%`
bundles and `…PK` packs takes 511 LH listings down to 417 products. The distinction has to
be stated whenever an LH count is quoted, or two correct numbers will look like a
disagreement.

**Finding 5 — `end_of_line_products` splits the 191 as 33 EOL / 158 live.** The team is
missing live stock, not discontinued lines.

## 4. GAP FOUND

**A leading minus is dropped on CSV-upload history lines.** `from -2 to 0` is stored as
`2 → 0`, flipping the sign of the movement. It affects **41 of the 2,626** Lamp Holder
movements (1.6%). Other branches are unaffected — `UK stock changes` keeps `-4`, manual
corrections keep `-21`.

**This is a different defect from the one evidence/45 fixed.** That one stripped `-` from
both ends of every value everywhere; this one survives in a single branch.

**It was reproduced deliberately, not fixed.** Fixing it for the 191 alone would leave them
disagreeing with the 5,480 SKUs already published, inside the same dialog, with nothing on
screen to say which is which. The fix belongs to all 5,480 at once and means re-extracting
the whole 30 MB table. **Carried as its own task.**

**`Mount Type` is blank on all 191** and reads *Unavailable*. Nothing in
`inventory.products` declares one, and none was guessed from the SKU.

**Lamp Holder still has no type dropdown.** At 417 SKUs a breakdown would earn its place,
but it would have to be derived from the SKU and the source declares none.

## 5. VALIDATION RULE ADDED OR CHANGED

**Rule — reconcile two disagreeing counts by identifying the SOURCE, not by tuning filters**
```
226 vs 413 was not a filter difference. One number came from a Google Sheet, the other
from the database, and no WHERE clause connects them.
IF a count cannot be reproduced after several filter combinations
THEN stop tuning filters and ask which SYSTEM produced it.
```

**Rule — a rebuilt extractor must be proved against the data it will sit beside**
```
The parser that produced HIST_RAW was never saved. A rebuild that merely looks right
puts two subtly different histories in one dialog.
THEREFORE: re-derive the rows ALREADY PUBLISHED and require an EXACT match —
movements, region sequences, truncation totals, and the encoded bytes.
2,626/2,626 · 590/590 · 590/590 · 226/226 re-encoded byte-identical.
Nine corrections were forced by that diff. Every one would have shipped without it.
```

**Rule — reproduce a defect rather than diverge from published data, and log it**
```
IF new rows are added beside existing rows produced by buggy logic
   AND the bug cannot be fixed for the existing rows in the same change
THEN reproduce the bug, so the dataset stays internally consistent,
     AND record it with its measured size and the cost of the real fix.
NEVER leave two behaviours in one view with nothing to distinguish them.
```

**Rule — state whether a SKU count includes bundles and packs**
```
LH resolves to 511 listings, 417 single components, 413 active, 226 on the old sheet.
All four are correct answers to different questions.
ALWAYS name the population rule beside the number.
```

**Rule — a population change must prove the classifier still owns every row**
```
AFTER changing a section's population:
  UNCLASSIFIED for that section MUST be 0
  every row MUST classify back to its own section
  no added SKU may appear in any other section
Asserted for all 417.
```

## 6. FAILURE MODE OR EDGE CASE

- **The parser reconstruction was wrong nine times, and every error was silent.** A
  `(\S*)` capture swallowed `120,Unit4(unit3` and destroyed the second movement on a
  two-movement line. `informed` without a leading space invented an informed person on 10
  movements. `Mark(unit2) from 1 to yes` would have rendered "yes" as a stock figure.
  None of these throw; all were caught only by diffing against published rows.
- **Some source lines hold several records with no newline between them.** The split
  between before and after must be anchored on a **digit** first, and a `by <who> On
  <date>` trailer only wins when the value does not contain its own ` to `.
- **`German inventory changed to null from 0`** writes the pair **backwards**.
- **Re-serialising a JSON blob rewrites entries that did not change.** The Shopify source
  writes `17.0` where `JSON.stringify` writes `17`, so the 115 new prices were appended
  **textually** rather than through the object.
- **The verifier missed a dataset because of a line break.** `const DATA =` puts its array
  on the next line while every other const opens on the same line; the first run reported
  Ceiling Rose as MISSING rather than as changed. **A verifier that cannot find a thing
  must not look like a verifier that found it unchanged.**
- **Twenty regression assertions failed on the first run, every one a count that moved by
  exactly the expected delta** — +191 rows, +168 history SKUs, +115 prices, +21 Unit 5,
  +29 containers. Checking the deltas matched the generator's own output was the proof the
  change did only what it claimed.

## 7. DECISIONS MADE TODAY

- **Reported the reconciliation before proposing the fix**, and did not apply the
  population change until the user asked for it. It replaces a locked section's entire
  population.
- **Kept the 37 holder parts in Lamp Holder.** Lids, rods and teeth rings could go to Lamp
  Spares, but the SKU prefix is the only thing the source actually states.
- **Invented no type.** The section still shows no type dropdown, as Pendant Lamp Holder
  does, rather than deriving categories from SKU substrings.
- **Reproduced the sign-stripping defect** instead of fixing it locally, and wrote down
  what the real fix costs.
- **Used the separate-lookup pattern again** — `LH_EXTRA` merged at load, so `LH_DATA` and
  all fourteen dataset locks stayed byte-identical.
- **Saved the parser to the repository.** Its absence is what made a one-day task out of
  adding 191 rows.

## 8. COMPANY KNOWLEDGE EXTRACT

1. **When two counts disagree, find the two systems before tuning the query.** 226 and 413
   were never reconcilable by filters — one was a spreadsheet.
2. **A section fed by a spreadsheet goes stale silently and in one direction.** No error,
   no gap indicator: 191 live products simply were not there.
3. **Save the extractor with the extract.** Rebuilding an unsaved parser cost a day and
   nine silent errors, all of which would have shipped.
4. **Prove a rebuilt extractor by re-deriving published rows and demanding an exact match.**
   Reading the code back is not proof; a byte-for-byte re-encode is.
5. **Reproduce a defect rather than let new and old rows disagree in the same view** — and
   record its size and the cost of the real fix, or it will be rediscovered from scratch.
6. **A SKU count is meaningless without its population rule.** Bundles and packs make the
   same prefix answer 511, 417, 413 or 226.
7. **A verifier must distinguish "not found" from "unchanged".**
8. **Free text carries records with no delimiter.** Anchor the split on the shape of the
   value, not on the first separator you find.
9. **Re-serialising untouched data is a change.** Append rather than rewrite when the
   source's number formatting differs from the language's.
10. **A count that moves by exactly the generator's own delta is evidence.** Twenty failing
    assertions confirmed the change rather than questioning it.

## 9. LLM STANDARD CHECK

| Check | Result |
|---|---|
| Terminology consistent with 2026-08-20/24/25/26 | TRUE |
| Business rules stated as executable IF/THEN | TRUE |
| Assumptions documented (parts stay in Lamp Holder; no type derived; defect reproduced) | TRUE |
| Edge cases documented (concatenated records, reversed pairs, `yes` as a quantity, number formatting) | TRUE |
| Evidence referenced by path | TRUE — evidence/48–49, sql/, validation/ |
| Another developer can continue independently | TRUE — parser, applier and every data file are in `sql/`; the lock file proves what was untouched |
| LLM queryable | TRUE |
| Hardcoded thresholds surfaced for BLOS governance | TRUE — see metadata block |

## RESULT

| | Before today | After today |
|---|---|---|
| Lamp Holder SKUs | 226 | **417** |
| Lamp Holder units visible | 82,354 | **125,904** |
| SKUs in the database but nowhere on the dashboard | 191 | **0** |
| Dashboard total | 5,661 | **5,852** |
| SKUs with stock history | 5,480 | **5,648** |
| SKUs with a Shopify price | 3,320 | **3,435** |
| Regression assertions | 1,165 | **1,203** |
| Page size | 4.71 MB | **4.81 MB** |

All fourteen pre-existing embedded datasets verified **byte-identical**.
Not committed, not pushed.

## BLOS GOVERNANCE NOTE

| Value | Where it lives now | Why it must be governed |
|---|---|---|
| Lamp Holder population = `LH` prefix, singles only | `sql/apply-lamp-holder-extra.js` + evidence/49 | It replaced a spreadsheet as the source of truth for a whole section |
| `%+%` and `…PK` exclusion | every prefix extract | It is the difference between 511 and 417 for the same prefix |
| The 37 holder parts staying in Lamp Holder | evidence/49 | An owner decision, currently defaulted |
| The `product_history` line-shape rules | `sql/product-history-parser.js` | They decide what counts as a stock movement; a new log format becomes noise silently |
| The CSV-upload sign-stripping defect | evidence/49 | Live in published data, 1.6% of movements, fix deferred |
