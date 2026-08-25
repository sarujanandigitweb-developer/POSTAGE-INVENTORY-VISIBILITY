# Evidence 32 — Lamp Holder implemented (GAP closed)

**Date:** 2026-08-24 · `dashboard/inventory-dashboard.html` only. Not committed, not pushed.

## Why it was a GAP

The `LampHolder_SOT ` tab (gid 1423341591, trailing space in the name) has **no
`Product_Type`, no `Product_Subtype`**, and there is **no `lampholder` tab in
`configurator.components_sot_skus`** — so no business category can be read from
either the sheet or the database. All 61 sheet columns were assessed and every one
is disqualified (evidence/30 §G). The tab also carries 15 corrupt rows, 5
pack/combo rows and 1 SKU belonging to another section.

## How it is fixed — without inventing a category

**Population: 226 SKUs** = 247 sheet rows − 15 corrupt − 5 pack/combo − 1
(`PHXSH1PBRWH`, which stays in the locked Pendant Lamp Holder section).

Not `sku LIKE 'LH%'` — that is 1,060 rows, **78.2% contamination**.

| Check | Result |
|---|---|
| Resolve 1:1 in `inventory.products` | **226 / 226 (100%)** |
| Distinct SKUs | 226, 0 duplicates |
| Description / image | 226/226 / 226/226 (all on the CDN) |
| Stock rows, all 7 warehouses | 226/226 each |
| UK Unit 3 shelf location | 223/226 (98.7%) |
| UK Shopify price | 220/226 (97.3%) |
| Bundles / packs / `Combo Default Title.` rows | 0 / 0 / 0 |

**No category was invented.** `fams: []`, so the dropdown reads
"All Lamp Holder" — exactly the Pendant Lamp Holder pattern. **Mount Type is shown
verbatim from the sheet as an attribute filter**, never as the category:

| Mount Type (as written on the sheet) | SKUs |
|---|---|
| Pendant | 139 |
| Ceiling | 25 |
| Pendant/Shade Mount | 15 |
| Flange Mount | 14 |
| **(blank → rendered "Unavailable")** | **11** |
| Table Lamp/Pendant | 6 |
| Surface/Ceiling | 4 |
| Ceiling/Table Lamp · Ceiling/Wall | 3 each |
| Surface Mount | 2 |
| Shade Mount · Ceiling Mount/Pendant Base · Cable/Pendant Mount · Pendant/Table | 1 each |

The 11 blanks are shown as *Unavailable*, not guessed. Only whitespace/newlines
were normalised; no value was merged or renamed.

The section label was changed from `LampHolder` to **`Lamp Holder`** for
consistency with the other five.

## Still true, and still needing a source fix

- 68 of the 226 (30.1%) are **end of line**.
- **157 live lamp holders are missing from the sheet** (GU10, MR16, batten,
  floor-lamp, wood, turning holders, and colour variants of listed families).
- **`LHXDE27WH` is in the population but its database description says it is an
  LED bulb**, not a holder.
- 15 corrupt rows and 5 packs remain on the tab.

Those are source defects; the owner decisions are listed in evidence/30 §I. The
dashboard now reflects the sheet honestly rather than hiding the whole category.

## Regression — 248 assertions, 0 failures

| Section | Rows | |
|---|---|---|
| Ceiling Rose | 332 | `d24b8f03…` **unchanged** |
| Lampshade | 451 | `7b8aeae0…` **unchanged** |
| Pendant Lamp Holder | 398 | `7bbcec58…` **unchanged** |
| Wall Arm | 180 | `d954388f…` unchanged |
| LED Bulbs | 218 | `6b7ea547…` unchanged |
| Lamp Holder | 226 | `71a85c6f…` new |

`node --check`: PASS. **0 GAP chips remain.** Single self-contained file: no
external JS/CSS, no fetch.
