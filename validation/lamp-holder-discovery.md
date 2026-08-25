# Lamp Holder discovery — validation and verdict

**Date:** 2026-08-24
**Verdict: AMBER — STOPPED before implementation.**
The dashboard was **not** modified. Nothing committed, nothing pushed.

## Gate check against the brief's own validation list

| Required validation | Result | |
|---|---|---|
| Exact Sheet row count | 247 | PASS |
| Exact distinct SKU count | 247 | PASS |
| Duplicate count | 0 | PASS |
| **1:1 SKU resolution** | **232 / 247 = 93.9%** | **FAIL** |
| Sheet → DB missing | 15 | recorded |
| DB → Sheet extra | 829 (539 packs, 157 active singles, 100 bundles, 33 EOL) | recorded |
| Contamination count | 21 inside the sheet's own rows | recorded |
| **Category counts** | **cannot be produced — no category exists** | **FAIL** |
| Authoritative source | **none in the database** | **FAIL** |
| Warehouse coverage (on the clean 226) | 100% in all 7 warehouses | PASS |
| Image coverage (on the clean 226) | 100% | PASS |

Three required validations cannot pass. Per the brief — *"STOP if the mapping
cannot be established safely"* — discovery stops here.

## Why the category logic cannot be established

1. **The tab has no `Product_Type` and no `Product_Subtype` column.** Every other
   tab used in this project has both. There is nothing on the sheet that declares
   a Level-1 business category.
2. **There is no Lamp Holder SOT in the database.** `components_sot_skus` syncs
   only `bulb`, `ceilingrose` and `lampshade`; not one LH SKU appears in it, so
   no configurator attribute carries a classification for these products.
3. **`Mount Type` is not usable as a category.** 13 distinct values after
   whitespace normalisation, **15 blank (6.1%)**, six of them compound
   (`Pendant/Shade Mount`, `Surface/Ceiling`, `Ceiling/Wall`,
   `Ceiling Mount/Pendant Base`, `Cable/Pendant Mount`, `Pendant/Table`), five
   with three members or fewer. Reducing the compounds to one family each needs a
   precedence rule the sheet never states — that would be inventing the
   classification, which the brief forbids.
4. **Every other candidate column fails too**: Socket Type is 98.4% `E27`;
   Install Type and Wiring Type are 96% one value; Shade Support is a boolean;
   Body Pattern and Compatible Shade Type are uncontrolled free text.
5. **The SKU sub-prefix is not the category.** 57 distinct 2–3 character groups
   over 246 SKUs, none of them defined anywhere in the sheet or the database — and
   the brief explicitly says not to assume the prefix is the category.

## The two data-quality findings that need a decision

**(a) 15 corrupt rows.** 13 `-IDE` SKUs and 2 malformed `SKU- Product Name` rows.
No such product exists anywhere in the catalogue, and each row's image belongs to
an unrelated combo (wall cages, ceiling-rose bundles, pendant-light sets). They
must be fixed on the sheet; they cannot be repaired from the database.

**(b) The sheet is stale in both directions.** 68 of its 231 resolving SKUs
(29.4%) are end of line, while 157 live, non-EOL lamp holders are missing from it
entirely — whole families (GU10, batten, floor-lamp, external-thread) plus colour
variants of families it does list. Ceiling Rose is 11.7% EOL and Lampshade 2.4%;
this tab is far outside that range.

## What IS established, and is ready to build on

The **population** is clean and fully verified — it is only the category that is
missing:

**226 SKUs** = 247 sheet rows − 15 corrupt − 5 pack/combo − 1 already locked in
Pendant Lamp Holder (`PHXSH1PBRWH`).

Coverage on those 226: description 100%, image 100%, stock rows 100% in all seven
warehouses, UK Unit 3 shelf location 98.7%, UK Shopify price 97.3%.
Full list: `data-maps/lamp-holder-population-226.txt`.
Per-row decisions: `data-maps/lamp-holder-sheet-skus.csv`.

## Options

**Option A — fix the sheet, then re-run discovery (recommended).**
Add `Product_Type` / `Product_Subtype` to the `LampHolder_SOT ` tab, repair the 15
corrupt rows, drop the 5 pack SKUs and the stray `PHXSH1PBRWH`, and add the 157
missing live products. Then sync the tab into `configurator.components_sot_skus`,
which is what makes Ceiling Rose and Lampshade GREEN. Re-running discovery after
that would give a GREEN verdict and a section built the same way as those two.

**Option B — build the 226 now with no category filter.**
Same shape as Pendant Lamp Holder: `fams: []`, one dropdown reading
"All Lamp Holders", and Mount Type exposed verbatim as an **attribute** filter
(13 values, blanks shown as *Unavailable*). Honest and useful for stock lookup,
but the section would still carry 68 dead SKUs and omit 157 live ones — a real
limitation for a Postage & Warehouse team, and one that only Option A fixes.

Option B requires explicit approval, exactly as Pendant Lamp Holder did.

## Locked sections — confirmed untouched

`dashboard/inventory-dashboard.html` was not opened for writing during this
discovery. Re-hashed and matched against `validation/locked-sections-lock.txt`:

| Section | SHA-256 | |
|---|---|---|
| Ceiling Rose | `d24b8f03…6223` | unchanged |
| Lampshade | `7b8aeae0…c346a` | unchanged |
| Pendant Lamp Holder | `7bbcec58…7022` | unchanged |

`node validation/test_lampshade.js` — 160 passed, 0 failed.
