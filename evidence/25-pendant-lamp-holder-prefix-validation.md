# Evidence 25 — Pendant Lamp Holder: Prefix Validation (Phase 9)

Date: 2026-08-24 · READ-ONLY · **Dashboard NOT modified**

## Is `PH%` safe as the population rule? **NO**

| Prefix | Raw DB | Sheet | Valid | Bundle | Pack | Combo | Inactive | EOL | Unresolved |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `PH%` | **2,631** | **398** | **398** | 2,081 | 67 | 68 | 68 | 60 | **0** |

Notes on the columns:
* **Valid = 398** — the sheet's distinct SKU set, every one resolving 1:1 in `inventory.products`.
* **Unresolved = 0** — no sheet SKU is missing from the database.
* Bundle/Pack/Combo/Inactive/EOL overlap (a pack is normally also combo-titled), so they do
  not sum to the difference. The authoritative figures are the direct counts.

**398 of 2,631 raw prefix matches are the real product set — 84.9% contamination.**

## Funnel

| Stage | Count | Share of raw |
|---|---:|---:|
| Raw `PH%` in `inventory.products` | **2,631** | 100% |
| — bundle SKUs containing `+` | 2,081 | 79.1% |
| Single (non-`+`) SKUs | **550** | 20.9% |
| — pack + combo-titled | 67 | |
| — combo-titled only | 1 | |
| — end-of-line | 28 | |
| — active singles absent from the sheet | 56 | |
| **Sheet population** | **398** | **15.1%** |

## Why a cleaning rule does not rescue the prefix

Rule-clean active singles (active AND not bundle/pack/combo/EOL) = **422**, against a sheet
truth of **398**. The 24-SKU gap is not noise — inspection of titles shows the rule keeps
products that are a different category entirely:

| Kept by the rule, but not a Pendant Lamp Holder | Example title |
|---|---|
| `PHCT80BMCBM` and 7 siblings | "Ceiling Rose with Hanging Chain - Black" |
| `PHLSDG220BG`, `PHLSGP350WI`, `PHLSLG190WI`, `PHLSDG220WI` | "Gold Inner dome style Lampshade" / "Modern Ceiling Pendant Lampshades Metal" |
| `PHWPPBRBL`, `PHWPPBRGR`, `PHWPPBRRE`, `PHWPPBRYE` | "5 Glass Wine Bottle Pendant Ceiling Chandelier Hanging Light Cluster" |
| `PHWC1PBRWO`, `PHWR1PBRWO` | "wooden ceiling lamp" |
| `PHCD1120PBRBW`, `PHHT1F120RBM`, `PHSG2PBRCCO` | ceiling-rose combo kits |

That is **21 demonstrable false positives** surviving a rule that already removed 2,209 rows —
the same failure mode measured for Lampshade (71.7% precision, `evidence/18`) and for
WC/Cage (`evidence/18`), where the survivors were chandeliers and complete light sets rather
than components.

## Sub-prefix analysis — does a longer prefix help?

Sheet SKUs use **many** 3-char sub-prefixes: `PHS` 90, `PHR` 68, `PHH` 54, `PHC` 52, `PHT` 50,
`PHB` 17, `PHM` 13, `PHU` 12 … and the contaminating groups sit *inside* those same families:
`PHCT…` (ceiling rose + chain) shares `PHC` with `PHCH…`/`PHCN…` (genuine holders);
`PHLS…` (lampshades) and `PHWP…` (chandeliers) share `PHL`/`PHW` with genuine holders
`PHLH…`/`PHWL…`. **No prefix length separates them.**

## Conclusion

| Question | Answer |
|---|---|
| Can `PH%` define the population? | **No** — 84.9% contamination |
| Can `PH%` + a cleaning rule define it? | **No** — still admits 21 provable false positives |
| Can a longer prefix define it? | **No** — contaminating groups share sub-prefixes with genuine ones |
| What does define it? | Only the curated tab `Pendant Lamp Holder_SOT` — which is **not in the database** |
