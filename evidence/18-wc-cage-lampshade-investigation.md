# Evidence 18 — WC / Cage Lampshade Authoritative Classification Investigation

> ## ⛔ BLOCKER
>
> ### `WC → Cage Lampshade` cannot safely be derived from the current database.
>
> No database field, flag, category or attribute reproduces the curated Cage Lampshade product
> set. Proven by benchmark, not asserted: the best available database-derived rule is only
> **71.7% precise** when tested against LS, where the correct answer is already known.
>
> **Authoritative resolution:** extend `configurator.components_sot_skus` with an authoritative
> Cage Lampshade classification/tab, following the same SOT approach already used for
> `lampshade` and `ceilingrose`.
>
> **That SOT change has NOT been made** — it requires separate approval and is outside this
> read-only investigation.
>
> | | |
> |---|---|
> | **WC Status** | **BLOCKED** |
> | **Dashboard Status** | **UNCHANGED** (332 Ceiling Rose rows, SHA-256 `3fb73cc4f4f6886209f561cdc8cbe9f3…`) |
> | **Database / SOT** | **UNCHANGED** (read-only `SELECT` throughout) |

## Evidence checklist

| # | Required item | Section |
|---|---|---|
| 1 | Raw WC count | §STEP 1, §Addendum |
| 2 | Rule-candidate count | §STEP 3, §STEP 9, §Addendum |
| 3 | LS benchmark | §Addendum |
| 4 | Precision / recall | §Addendum |
| 5 | False-positive examples | §Addendum, §STEP 9 |
| 6 | Why prefix matching is unsafe | §Why prefix matching is unsafe |
| 7 | Why database inference is unsafe | §Why database inference is unsafe |
| 8 | Why the SOT is required | §Why the SOT is required |
| 9 | The 56 corroborated WC SKUs | §The corroborated subset |
| 10 | Corroborated subset vs authoritative set | §Corroborated subset vs authoritative set |


Date: 2026-08-20 · Mode: **READ-ONLY** · Nothing modified · Verdict: **AMBER**

## Question

Does the database already contain a reliable, authoritative way to identify genuine
**WC → Cage Lampshade** products, without a manually maintained SKU list?

**Answer: No single authoritative classification exists.** Two independent database signals
disagree on 116 of 172 candidates, and each is demonstrably contaminated in a different way.

## STEP 1 — Database-wide WC search

All 61 SKU-bearing columns were enumerated from `information_schema.columns`; every relevant
object was counted.

| Database Object | SKU Field | WC rows | Distinct WC | Relevant product data? |
|---|---|---:|---:|---|
| `order_management.order_combo` | `sku` | 111,570 | 324 | No — combo component lines |
| `order_management.order_item_info` | `item_sku` | 75,709 | 922 | No — sales lines |
| `order_management.order_item_info` | `real_sku` | 67,863 | 1,782 | No — sales lines |
| `listings.ebay_listings` | `sku` | 8,065 | 1,215 | Partial — listing level |
| `listings.amazon_listings` | `sku` | 6,924 | 2,635 | Partial — listing level |
| `order_management.amazon_fba_order_items` | `item_sku` | 2,216 | 72 | No |
| `listings.shopify_listings` | `sku` | 1,584 | 746 | Partial — has `product_type` |
| `customer_service.amazon_returns` | `sku` | 1,373 | 417 | No |
| **`inventory.products`** | **`sku`** | **1,128** | **1,128** | **YES — product master** |
| `amazon_fba.excess_inventory_data` | `sku` | 479 | 25 | No |
| `suppliers.order_items` | `sku` | 305 | 95 | No — purchase orders |
| `listings.bandq_listings` | `sku` | 164 | 164 | Partial |
| `business_reports.amz_sales_and_traffic_by_sku` | `sku` | 133 | 67 | No |
| **`inventory.end_of_line_products`** | **`sku`** | **102** | **102** | **YES — EOL flag** |
| `suppliers.incidents` | `sku` | 25 | 21 | No |
| `suppliers.child_item_products` | `sku` | 12 | 10 | No |
| **`configurator.components_sot_skus`** | `sku` | **0** | **0** | **NONE — no WC in any SOT tab** |

The same WC SKUs appear across many objects; only `inventory.products` is the product master.

## STEP 4/6 — Search for an authoritative classification

### `configurator` (the SOT that made LS and Ceiling Rose safe)

- `source_tab` values: `lampshade` (451), `ceilingrose` (332), `bulb` (218). **No cage/WC tab.**
- 413 attribute keys scanned for any value containing "cage": only hits are
  `product_name = 'LEDsone Cage Bulb Black E27'` / `'… Rose Gold E27'`, `sub_type = 'Cage Bulb …'`
  and `filament_style = 'Cage/Mesh'` — **all in the `bulb` tab**, plus one free-text
  `rel_1_reason` note in `lampshade`. **Nothing classifies a WC SKU.**

### `listings.shopify_listings.product_type` — rejected

Free-text marketing taxonomy, per store, inconsistent. 25+ variants for WC SKUs including
`Wire Cage` (123), `Cages` (113), `wire cage` (27), `cage` (17), `Käfig Lampenschirme` (12),
alongside `Lampshade`, `LAMPSHADE`, `Lamp Shade`, `Lamp shade`, `Lampenschirme`,
`Easy_Fit_Lamp_Shades`, and unrelated values like `Top moving` and `Pendant Lighting`.
One SKU carries several listings with different types. Not authoritative.

### `staff.ph_categories` — the strongest candidate, still not authoritative

A curated category list containing **`Wire Cage`** (WC = Wire Cage, which explains the prefix),
plus `Lampshade`, `Cage Spider Light`, `Cage + Shade Spider Light`, `Other Shade` and others.

Structure: `ph_category_products.ref_id` is a **marketplace listing identifier**, not a SKU —
ASIN for `source_id=1` (Amazon), item_id for `2` (eBay), barcode for `16` (B&Q).
`Wire Cage` holds 1,056 assignments / 978 distinct refs across those three sources.

Resolved to SKUs via `amazon_listings.asin` and `ebay_listings.item_id`:

| Via | SKUs | WC-prefixed | Non-WC | **Bundles (`+`)** |
|---|---:|---:|---:|---:|
| Amazon | 1,043 | 997 | 46 | 786 |
| eBay | 637 | 491 | 146 | 383 |
| **Distinct total** | **1,546** | 1,354 | 192 | **1,050 (68%)** |

It is a **staff-portfolio / KPI category applied to marketplace listings**, not a product-master
classification. It over-covers (1,050 bundle listings) and under-covers (see below).

## STEP 3 — Classification of the 1,128 WC SKUs in `inventory.products`

| Classification | Count | % | Evidence |
|---|---:|---:|---|
| `+` bundles | 700 | 62.1% | `sku LIKE '%+%'` |
| Combo-titled singles | 155 | 13.7% | `title ILIKE 'Combo%'`, e.g. `WCB1WH2PK`, `WCB2BM2PK` — **no `+`**, `inventory_bool=false` |
| Pack-only (not already combo-titled) | 0 | 0% | every `*PK` SKU is already combo-titled |
| Inactive-only | 0 | 0% | every remaining inactive already caught above |
| End-of-line | 101 | 9.0% | `inventory.end_of_line_products` — Permanent 84, Temporary 18 |
| **Candidates remaining** | **172** | **15.2%** | active, not bundle/pack/combo, not EOL — all 172 have stock rows |

## STEP 9 — Test A / B / C

| Test | Definition | Count |
|---|---|---:|
| **A** | `sku LIKE 'WC%'` | **1,128** |
| **B** | A + in `Wire Cage` portfolio category | **459** |
| **C** | A + active + not bundle/pack/combo/EOL | **172** |
| **B ∩ C** | agreed by both signals | **56** |
| **C \ B** | rule-clean but *not* categorised | **116** |

**The two methods agree on only 56 of 172 — 33%.** That disagreement is the core finding.

### Why the raw prefix count is so much larger than the genuine count

1,128 → −700 `+` bundles → −155 combo/pack singles → −101 end-of-line → **172**, and of those only
56 are corroborated by the one category signal the database has.

### Both candidate sets are contaminated

- **Category signal (B)** includes 1,050 bundle listings.
- **Rule signal (C)** includes products that are demonstrably **not** cage lampshades. Of the 116
  rule-clean-but-uncategorised SKUs, 12 have titles mentioning neither cage nor lampshade:

| SKU | Title |
|---|---|
| `WCCY1ROBM` | Industrial Modern Chandelier Lamp Clear Crystal Glass luxury 1m Round Pendant |
| `WCCYLC230BM` | 230MM Crystal black flush mount set |
| `WCCYLC290BM` | 290MM Crystal black flush mount set |
| `WCDC10FBM` | 1m black diamond with pendant |
| `WCFSDCBM` | Diamond 3 head black full set |
| `WCLSBM` | New Style Geometric Design Modern Ceiling Chandelier Square Black Ring |
| `WCLTBM` | New Style Geometric Design Modern Ceiling Chandelier Triangle Black Ring |
| `WCPC210GR` / `WCPC210GY` / `WCPC210YE` | 210mm conduit lantern green / grey / yellow |
| `WCRN3CBM` / `WCRNBM` | Vintage Retro Hemp Rope Metal Pendant Shade |

Chandeliers, flush-mount sets, conduit lanterns and rope shades — not cage lampshades.
Title-text matching to remove them would be classification by guess, which is out of scope.

## STEP 5 — LS vs WC

| Metric | LS | WC |
|---|---|---|
| Source object | `configurator.components_sot_skus` | **none** |
| Authoritative classification | `source_tab='lampshade'` + `product_subtype='Lampshade'` | **none** |
| SKU count | **451** | 1,128 raw → 172 rule-based → 56 corroborated |
| Product subtype | `Lampshade` (451/451) | not present |
| Fitting type | Easy Fit 404 · Pendant Light 9 · Ceiling Mounted 4 · empty 31 · `[VERIFY]` 3 | not present |
| Style category | Vintage Industrial 352 · Contemporary Art Deco Glass 81 · Contemporary 13 · Boho 5 | not present |
| Material | Metal 352 · Glass 72 · Fabric 13 · Crystal 9 · Rope 5 | not present |
| Bundle identification | Guaranteed by the tab — **0 bundles, 0 packs, 0 inactive** | Requires an invented rule; still leaks non-cage products |
| Duplicates | 0 | 0 (within any candidate set) |

## STEP 7 — Product identity (172 candidates)

| Metric | Result |
|---|---:|
| Raw WC prefix records | 1,128 |
| Distinct WC SKUs | 1,128 |
| Valid product IDs | 1,128 (1:1) |
| Duplicate SKUs | 0 |
| Active (`inventory_bool`) | 973 |
| Inactive | 155 |
| End-of-line | 101 |
| Genuine candidates (rule-based) | 172 |
| **Corroborated by two signals** | **56** |
| **Unresolved** | **116** |

## STEP 8 — Warehouse & field coverage for the 172 candidates

| Warehouse | ID | Stock rows | Coverage | With location |
|---|---:|---:|---:|---:|
| UK Unit 3 | 1 | 172 | 100% | 163 |
| UK Unit 4 | 8 | 172 | 100% | 126 |
| UK Unit 18 | 6 | 172 | 100% | 0 |
| Kronen | 10 | 172 | 100% | 3 |
| Schmutter | 7 | 172 | 100% | 126 |
| CA | 4 | 172 | 100% | 49 |
| US | 32 | 172 | 100% | 0 |

Other fields: images **172/172 (100%)**, UK Shopify price 82/172, arrived container 89/172,
history — none (same as Ceiling Rose and LS).

**Inventory data is complete.** The blocker is *which SKUs belong in the set*, not the data
behind them.

## Verdict — AMBER

WC/Cage Lampshade products unquestionably exist and their inventory data is complete, but the
database has **no authoritative product-master classification** for them:

- `configurator` (the mechanism that makes LS and Ceiling Rose safe) has **no WC entry at all**.
- `staff.ph_categories.'Wire Cage'` is a **staff-KPI category on marketplace listings**, 68%
  bundles, and misses 116 rule-clean products.
- Rule-based cleaning is an invented rule and still admits chandeliers, lanterns and flush-mount sets.

**Safe subset:** the **56** SKUs corroborated by both signals.
**Unresolved:** the **116** in C \ B, of which 12 are demonstrably not cage lampshades.

## Recommended resolution (no guessing required)

Add a `cage` (or `wirecage`) tab to `configurator.components_sot_skus` with
`product_subtype = 'Cage Lampshade'`, exactly as `lampshade` and `ceilingrose` were done. That
reuses the proven pattern, needs no new table or new source of truth, and would make WC
implementable immediately with the same validated extraction.

## Scope compliance

| Restriction | Status |
|---|---|
| Database not modified | PASS — `SELECT` only |
| SOT not modified | PASS |
| Dashboard not modified | PASS — SHA-256 `3fb73cc4f4f6886209f561cdc8cbe9f3…`, 332 rows |
| No new table / source of truth | PASS |
| No manual SKU list created | PASS |
| No classification by guess | PASS — reported the disagreement instead |
| Not committed or pushed | PASS |

---

## ADDENDUM — Rule benchmarked against LS (where the truth is known)

Requested check: read `inventory.products` directly for WC and LS, and test the cleaning rule
against LS, whose correct answer (451, from the SOT) is already established.

### Raw `inventory.products` funnel, both prefixes

| Stage | LS | WC |
|---|---:|---:|
| Total prefix rows | **2,438** | **1,128** |
| `+` bundles | 1,603 | 700 |
| Combo-titled singles | 151 | 155 |
| Pack-only | 0 | 0 |
| Inactive-only | 0 | 0 |
| End-of-line | 70 | 101 |
| **Rule candidates** | **614** | **172** |

### The benchmark — rule vs SOT truth for LS

| Measure | Result |
|---|---:|
| SOT truth (`source_tab='lampshade'`) | **451** |
| Rule predicts | **614** |
| Agree (true positives) | **440** |
| SOT SKUs the rule misses | **11** |
| **Rule false positives** | **174** |
| **Precision** | **440/614 = 71.7%** |
| Recall | 440/451 = 97.6% |

**The rule is only ~72% precise.** Applied to WC's 172 candidates, roughly **28% (~48 SKUs)
would be wrong**.

### Why the rule fails — the same failure mode in both families

The 174 LS false positives are **chandeliers, complete light sets and full fittings**, not shades:

| SKU | Title |
|---|---|
| `LS2CA800SG` | 80 x 30 cm Sweep gold chandelier light |
| `LS2CL800GH` | 80CM Crystal full set double layer glass light |
| `LS2CO300CL` | 30cm Crystal Chrome Rectangular Droplet Chandelier |
| `LS2CU700SG` | Cube shape crystal cut 700mm clear light chandelier |
| `LSBF3BWG` | 3 head beat style black white grey lamps full set |
| `LSCA1000BF` | 100cm Large Modern Crystal Glass Chandelier |

Identical to the WC false positives already found (`WCCYLC230BM` flush mount set,
`WCPC210GR` conduit lantern, `WCLSBM` chandelier).

**Conclusion:** the SOT deliberately separates *shades* from *complete light fittings*. That is a
product-meaning distinction encoded nowhere in the database — no flag, no category, no attribute.
It required human curation, which is exactly what the SOT tab provides.

This closes the question: **no database-derivable rule can reproduce the curated set.** The rule
cannot be trusted for WC because it demonstrably fails by 28% on LS, where the answer is known.


---

## Why prefix matching is unsafe

`sku LIKE 'WC%'` returns **1,128** records. Of those:

| Contamination | Count | Share |
|---|---:|---:|
| `+` bundles | 700 | 62.1% |
| Combo-titled singles (no `+`, `inventory_bool=false`) | 155 | 13.7% |
| End-of-line products | 101 | 9.0% |
| **Remaining after cleaning** | **172** | **15.2%** |

**84.8% of the raw prefix set is contamination.** Critically, the `+` test that worked for Ceiling
Rose does **not** catch the 155 combo-titled singles — SKUs such as `WCB1WH2PK`, `WCB1WH3PK`,
`WCB1WH5PK`, `WCB2BM2PK` are titled "Combo Default Title." and contain no `+`. Prefix matching
alone would inject pack-combos into a validated dashboard.

## Why database inference is unsafe

Every available database-derived signal was tested and each fails:

| Signal | Why it fails |
|---|---|
| `sku LIKE 'WC%'` | 84.8% contamination (above) |
| `configurator.components_sot_skus` | **0 WC rows in any tab** — no `cage`/`WC` tab exists |
| Attribute sweep for "cage" across all 413 SOT attribute keys | Only `bulb`-tab hits (`Cage Bulb`, `filament_style='Cage/Mesh'`) — nothing classifies a WC SKU |
| `listings.shopify_listings.product_type` | Free-text per-store marketing taxonomy: 25+ variants (`Wire Cage`, `Cages`, `wire cage`, `cage`, `Käfig Lampenschirme`, `Lampshade`, `LAMPSHADE`, `Top moving`…). One SKU carries several listings with different values |
| `staff.ph_categories` → `'Wire Cage'` | A **staff-KPI category applied to marketplace listings**, keyed by ASIN / eBay item_id — not by SKU, not a product-master field. Resolves to 1,546 SKUs of which **1,050 (68%) are bundles**, while missing 116 rule-clean products |
| Combined cleaning rule (active + not bundle/pack/combo/EOL) | **71.7% precision** when benchmarked against LS — see Addendum |
| Title text matching | Would be classification by guess; explicitly out of scope |

The two strongest signals — the cleaning rule (172) and the `Wire Cage` category (459) — **agree on
only 56 SKUs (33% of the rule set)**. Two signals that disagree on two-thirds of records cannot
jointly establish truth.

## Why the SOT is required

The benchmark isolates the exact reason inference fails. The 174 LS false positives are **complete
light fittings and chandeliers**, not shades — and the same pattern appears in WC
(`WCCYLC230BM` flush mount set, `WCPC210GR` conduit lantern, `WCLSBM` chandelier).

The distinction between *a shade* and *a complete light fitting* is a **product-meaning decision**.
It is encoded in no database column: not in `inventory.products`, not in stock, not in listings,
not in any of the 413 SOT attribute keys. It exists only where a person has recorded it — which is
precisely what `configurator.components_sot_skus` is for.

`lampshade` (451) and `ceilingrose` (332) are both clean at source — **0 bundles, 0 packs,
0 inactive, 0 duplicates, 0 unresolved** — because a human curated them into the tab. A `cage` tab
would deliver the same guarantee, reuse the proven extraction pattern, and require no new table and
no new source of truth.

## The corroborated subset

The following **56** SKUs are the only WC records supported by two independent database signals
(cleaning rule **AND** `Wire Cage` category membership):

```
WCB1BC, WCB1WH, WCB2BC, WCB2BM, WCB2BS, WCB2WH, WCB3RR, WCB3WH, WCB5BM,
WCB6BB, WCB6WH, WCB7BB, WCB7BS, WCB7WH, WCBCBB, WCBCBC, WCBCFBM, WCBCFRO,
WCBNBC, WCBNBM, WCBNBS, WCBNCH, WCBNGD, WCBNRO, WCBNRR, WCBNWH, WCCEBM,
WCCYROBM, WCCYROCH, WCCYROGD, WCCYSQBM, WCCYSQCH, WCCYSQGD, WCDCBM, WCDCCH,
WCDEBM, WCDFBM, WCDFCO, WCDRBM, WCDSBM, WCDTWH, WCDTYE, WCFL180BM, WCFL180RO,
WCIR300BM, WCRPHE, WCTBBC, WCTBBS, WCTCBM, WCVCBC, WCVCBM, WCVCBS, WCVCRE,
WCVCWH, WCWDCH, WCWYBM
```

> **This list is investigation evidence, not a product set.** It is recorded here to document what
> the two signals agree on. It is **not** a truth file, is **not** to be used as the WC product set,
> and must **not** be embedded in the dashboard. No separate SKU truth file was created.

## Corroborated subset vs complete authoritative set

| | Corroborated subset | Complete authoritative set |
|---|---|---|
| Count | **56** | **Unknown** |
| Basis | Two database signals happen to agree | Curated product-meaning decision |
| Status | Documented evidence only | **Does not exist yet** |
| Completeness | **Unproven** — the `Wire Cage` category only covers SKUs with an Amazon/eBay listing assigned to a staff portfolio, so genuine cage lampshades without such a listing are structurally excluded | Would cover every genuine product by definition |
| Correctness | Plausible but unverified — no field confirms these are cage *lampshades* rather than cage *fittings* | Verified at source |
| Safe to build on? | **NO** | YES |

The 56 must not be mistaken for "the WC product set". They are a lower bound of unknown accuracy
produced by two flawed signals overlapping. For reference, applying the rule's measured 71.7%
precision to the 172 candidates implies roughly **48 wrong SKUs** would enter the dashboard — and
that error rate is itself only an estimate carried over from LS.

## Required resolution

1. Add a `cage` (or `wirecage`) tab to `configurator.components_sot_skus` with
   `product_subtype = 'Cage Lampshade'`, curated the same way as `lampshade` and `ceilingrose`.
2. Once present, WC becomes implementable immediately using the unchanged validated extraction —
   warehouse data is already proven complete (172/172 across all 7 warehouses, 100% images).
3. **No dashboard, database or SOT change has been made.** Step 1 requires separate approval.
