# Evidence 21 — Lampshade: Prefix Validation (Phase 8)

Date: 2026-08-24 · Mode: READ-ONLY · **Dashboard NOT modified**

The WC/Cage investigation (`evidence/18`) proved prefix-only logic produces false positives.
This repeats that test for Lampshade, in both directions.

## Test 1 — does the SKU prefix predict the category? **NO**

Tested chars 1–4 of the SKU (e.g. `LSGL`) against `Material_Primary`, over the 451 sheet SKUs.

| Measure | Result |
|---|---:|
| Distinct 4-char prefixes | **52** |
| SKUs under a prefix that maps to exactly one material | 393 |
| SKUs under a prefix that spans several materials | **58** |

Mixed prefixes:

| Prefix | Materials it spans |
|---|---|
| `LSCY` | **Metal 45 · Crystal Glass 9 · Glass 1** |
| `LSHM` | **Natural Rope 2 · Metal 1** |

`LSCY` alone splits three ways. A prefix rule would mis-file 58 SKUs.

## Test 2 — does the category map to one prefix? **NO**

| Category | Distinct prefixes used |
|---|---|
| Glass (72 SKUs) | **9** — `LSGL` 57, `LSMC` 8, `LSBG` 1, `LSCG` 1, `LSCY` 1, `LSFG` 1, `LSGD` 1, `LSGG` 1, `LSPG` 1 |

`LSGL*` is 57/57 Glass — pure, but it covers only 57 of 72 Glass SKUs. The remaining 15 sit
under 8 other prefixes. So neither direction is safe:

* prefix → category **fails** (`LSCY` splits 3 ways)
* category → prefix **fails** (Glass spans 9 prefixes)

Shape is no better: 7 of 52 prefixes cover more than one `Shade_Shape`.

**Conclusion: the SKU prefix must not be used to assign a Lampshade category.**
The only prefix fact that holds is that all 451 sheet SKUs begin `LS` — and that is far from
sufficient, as Test 3 shows.

## Test 3 — is `LS%` in the database a safe population? **NO**

| Prefix | Raw DB Count | Sheet Count | Valid DB Count | Excluded | Reason |
|---|---:|---:|---:|---:|---|
| `LS%` | **2,438** | 451 | **451** | **1,987** | see funnel |

### Contamination funnel on `inventory.products` WHERE `upper(sku) LIKE 'LS%'`

| Stage | Count | Share of raw |
|---|---:|---:|
| Raw `LS%` rows | **2,438** | 100% |
| — bundle SKUs containing `+` | 1,603 | 65.7% |
| — combo-titled singles (`title ILIKE 'Combo%'`, no `+`) | 151 | 6.2% |
| — pack SKUs matching `[0-9]PK$` (no `+`) | 147 | 6.0% |
| — inactive (`inventory_bool = false`, no `+`) | 148 | 6.1% |
| — end-of-line (`inventory.end_of_line_products`, no `+`) | 70 | 2.9% |
| **Authoritative population (SOT `lampshade` tab)** | **451** | **18.5%** |
| `LS%` rows NOT in the SOT tab | **1,987** | 81.5% |
| SOT SKUs NOT matching `LS%` | **0** | — |

**81.5% of the raw prefix set is contamination.** Categories overlap (a pack SKU is usually
also combo-titled), so the exclusion lines do not sum to 1,987 — the authoritative figure is
the direct SOT count of 451, and the direct anti-join count of 1,987.

## Cross-check against the LS benchmark in `evidence/18`

`evidence/18` measured the generic cleaning rule (active + not bundle/pack/combo/EOL) against
the LS SOT truth and found **614 predicted vs 451 actual — 71.7% precision, 174 false
positives**, the false positives being chandeliers and complete light sets rather than shades
(`LS2CA800SG` 80cm sweep gold chandelier, `LSCA1000BF` 100cm crystal chandelier, …).

That finding stands and is reconfirmed here: no prefix or heuristic rule reproduces the
curated 451. Only the SOT tab does, and it does so exactly.

## Verdict

| Question | Answer |
|---|---|
| Can a prefix assign the Lampshade **category**? | **No** — `LSCY` spans 3 materials; Glass spans 9 prefixes |
| Can a prefix define the Lampshade **population**? | **No** — `LS%` is 81.5% contamination |
| What defines the population? | `configurator.components_sot_skus WHERE source_tab='lampshade'` — 451, exact |
| What defines the category? | The `material_primary` / `shade_shape` attributes on that tab |
