# Evidence 30 — Lamp Holder SOURCE-CORRECTION REPORT

**Date:** 2026-08-24
**Source:** `LampHolder_SOT ` (trailing space), sheetId 16, **gid 1423341591**
**Status: RED — source correction required before dashboard implementation.**

Read-only. The dashboard was not modified, the SOT was not modified, the database
was not modified. Nothing committed, nothing pushed.

---

# A. Current source problems

| # | Problem | Scale | Effect |
|---|---|---|---|
| 1 | **No `Product_Type` column** | all 247 rows | no Level-0 type; the other three tabs all have one |
| 2 | **No `Product_Subtype` column** | all 247 rows | no Level-0 subtype; the other three tabs all have one |
| 3 | **No business-category column of any kind** | all 247 rows | the dashboard category dropdown has nothing to drive it |
| 4 | **No Lamp Holder sync in `configurator.components_sot_skus`** | — | no database fallback; 0 LH SKUs under any synced tab |
| 5 | **`Product Name` column is 100% EMPTY** | 247/247 blank | the sheet carries no human-readable product name at all |
| 6 | Corrupt / unresolvable SKU_ID values | **15 rows (6.1%)** | 1:1 resolution is 93.9%, not 100% |
| 7 | Pack/combo rows mixed in with single products | **5 rows** | no stock, placeholder description, no `Item_Kind` column to separate them |
| 8 | A Pendant Lamp Holder SKU on the Lamp Holder tab | **1 row** | would duplicate a record already in a LOCKED section |
| 9 | Stale in both directions | **68 EOL kept / 157 live missing** | a section built now would show 68 dead SKUs and hide 157 live ones |
| 10 | An LED bulb accepted as a lamp holder | **1 row** | `LHXDE27WH` — see §A.1 |
| 11 | `IMG_LINK` points at the wrong product on the 15 corrupt rows | 15 rows | images belong to wall cages, ceiling-rose combos, pendant-light bundles |
| 12 | Tab name is not unique in the workbook | — | a hidden `LampHolder_SOT` (no trailing space) holds 998 rows in a different layout |

### A.1 — a new finding: the sheet already contains a bulb

`LHXDE27WH` is on the sheet and is inside the 226 "clean" population. Its database
description is:

> `XD-3027 (E27) LED Bulb/Light with Copper Granules, AC 220–250V, 4A, 50/60Hz`

Its sibling `LHXDE27BM` (identical description, not on the sheet) was classified
**unrelated** in §E. The same product cannot be a lamp holder on one row and a
bulb on another. **Owner decision required** — see §I-7.

### A.2 — freshness, in context

| Tab | SKUs | End of line | Share |
|---|---|---|---|
| `lampshade_SOT` | 451 | 11 | 2.4% |
| `Ceilingrose_SOT` | 332 | 39 | 11.7% |
| **`LampHolder_SOT `** | **231 resolving** | **68** | **29.4%** |

---

# B. The 15 corrupt SKUs and their exact source problems

Full detail with image evidence: `data-maps/lamp-holder-corrupt-15.csv`.

### B.1 — 13 rows with an unknown `-IDE` suffix

| Sheet row | SKU_ID as written | Base SKU exists? | `-IDE` SKU exists? |
|---|---|---|---|
| 40 | `LHC1E27WH-IDE` | yes | **no** |
| 42 | `LHC1E27WH3PK-IDE` | yes (a pack) | **no** |
| 44 | `LHC1E27WH5PK-IDE` | yes (a pack) | **no** |
| 46 | `LHC1E27WHAPK-IDE` | yes (a pack) | **no** |
| 100 | `LHNSE27BY-IDE` | yes | **no** |
| 102 | `LHNSE27CH-IDE` | yes | **no** |
| 104 | `LHNSE27CO-IDE` | yes | **no** |
| 107 | `LHNSE27GB-IDE` | yes | **no** |
| 109 | `LHNSE27RO-IDE` | yes | **no** |
| 111 | `LHNSE27SN-IDE` | yes | **no** |
| 113 | `LHNSE27WH-IDE` | yes | **no** |
| 115 | `LHNSE27YB-IDE` | yes | **no** |
| 169 | `LHSHE27BY-IDE` | yes | **no** |

Exact problem: **`-IDE` is not a SKU suffix that exists anywhere in the
catalogue.** `SELECT sku FROM inventory.products WHERE upper(sku) LIKE '%-IDE'`
returns **0 rows across all products**, not just LH.

They are also **not** duplicates of their base rows — each differs from its base
in `IMG_LINK` and other columns — so they cannot be resolved by dropping the
suffix. What `-IDE` was meant to mean is a question only the source owner can
answer.

### B.2 — 2 rows where the SKU cell holds a SKU plus a name fragment

| Sheet row | SKU_ID as written | Leading token | Token exists in DB? |
|---|---|---|---|
| 61 | `LHCE27- Lamp Holder` | `LHCE27` | **no** — `LIKE 'LHCE27%'` returns 0 rows |
| 97 | `LHNSE27- Fully Earthed Pendant Holder` | `LHNSE27` | **no** — 0 rows |

Exact problem: the SKU_ID cell contains free text appended to a SKU, **and the
underlying SKU does not exist either**. Repairing the formatting alone would not
make these rows resolve.

### B.3 — why these were not repaired from the image

As instructed, corrupt SKUs were **not** inferred from images. The image check
below was run only to *prove* the rows are unrecoverable, and it does:

| Sheet SKU_ID | Image id | Product that image actually belongs to |
|---|---|---|
| LHC1E27WH-IDE | 10597 | `WCFRHE+RPR44WH` (wall cage combo) |
| LHC1E27WH3PK-IDE | 10598 | `WCRTBR+RPR44WH` |
| LHC1E27WH5PK-IDE | 10599 | `WCBKHE+RPR44WH` |
| LHC1E27WHAPK-IDE | 10600 | `CRSF100CO2PK+WSSS70CO2PK+LSTF40CO2PK` |
| LHCE27- Lamp Holder | 7710 | `CRSF2003BC+PHSH1PBRYB3PK+WCDCBC3PK` |
| LHNSE27- Fully Earthed… | 7813 | `PLBXBM+PCBI500TP+PCBITB+PCPTPH+LSDO210RR` |
| LHNSE27SN-IDE | 7814 | `PLBXBM+PCBI600TP+PCBITB+PCPTPH+LSDO210RR` |
| LHNSE27WH-IDE | 7815 | `PLBXBM+PCBI50TP+PCBITB+PCPTPH+LSLT360BT` |
| LHNSE27YB-IDE | 7816 | `PLBXBM+PCBI75TP+PCBITB+PCPTPH+LSLT360BT` |
| LHNSE27CH-IDE | 7817 | `PLBXBM+PCBI100TP+PCBITB+PCPTPH+LSLT360BT` |
| LHNSE27RO-IDE | 7818 | `PLBXBM+PCBI200TP+PCBITB+PCPTPH+LSLT360BT` |
| LHNSE27CO-IDE | 7819 | `PLBXBM+PCBI300TP+PCBITB+PCPTPH+LSLT360BT` |
| LHNSE27GB-IDE | 7820 | `PLBXBM+PCBI400TP+PCBITB+PCPTPH+LSLT360BT` |
| LHNSE27BY-IDE | 7821 | `PLBXBM+PCBI500TP+PCBITB+PCPTPH+LSLT360BT` |
| LHSHE27BY-IDE | 11202 | `CTBOP2L+CTBOP3L+CTBOP8L` |

**All 15 point at unrelated combo/bundle products.** No identity can be inferred
from them, and none was.

---

# C. The 5 pack/combo SKUs

| Sheet row SKU | Resolves? | `inventory.products.description` | Stock rows in `physical_product_stock` |
|---|---|---|---|
| `LHC1E27WH3PK` | yes | `Combo Default Title.` | **0** |
| `LHC1E27WH5PK` | yes | `Combo Default Title.` | **0** |
| `LHC1E27WHAPK` | yes | `Combo Default Title.` | **0** |
| `LHC6E27WH5PK` | yes | `Combo Default Title.` | **0** |
| `LHC6E27WHAPK` | yes | `Combo Default Title.` | **0** |

They resolve, so they are not corrupt — but each carries a placeholder
description and **no stock row in any of the seven warehouses**, so each would
render as a row that is *Unavailable* everywhere.

The sheet has no column that marks a row as a pack. Today the only way to tell is
the SKU suffix, which is exactly the kind of inference this project has ruled out.
Hence the proposed `Item_Kind` column in §H.

---

# D. `PHXSH1PBRWH` belongs to Pendant Lamp Holder — evidence

| Check | Result |
|---|---|
| Position on the Lamp Holder tab | **sheet row 249** — the last data row |
| Prefix | `PH`, the only non-`LH` SKU among all 247 |
| Resolves in `inventory.products` | yes — product id **40741** |
| Description | `E27 lamp Holder with LED Housing & 1 meter of 0.75 sq mm two…` |
| On the `Pendant Lamp Holder_SOT` tab (gid 2041874053) | **yes** |
| In the shipped Pendant Lamp Holder dataset | **yes** — present in `sql/pendant-lamp-holder_data.json`, one of the 398 |
| Section that owns it | **Pendant Lamp Holder — LOCKED** (`PH_DATA`, sha256 `7bbcec58…7022`) |

Carrying it in a Lamp Holders section would put the same product in two dashboard
sections. **Excluded here; it stays with Pendant Lamp Holder.** It should be
removed from the Lamp Holder tab at source.

---

# E. The 157 database-only live SKUs + classification

Full list with description, evidence and Shopify product_type:
`data-maps/lamp-holder-157-database-only.csv`.

Selection rule (database evidence only): `sku LIKE 'LH%'`, **not** on the sheet,
**not** a bundle (`+`), **not** a pack (`…PK`), **not** a combo (description
contains "combo"), **not** in `inventory.end_of_line_products`.

| Classification | Count | Basis |
|---|---|---|
| **genuine Lamp Holder** | **117** | `inventory.products.description` names a holder or socket |
| **unrelated product** | **22** | description names a different product class |
| **unresolved** | **18** | description does not settle the class |
| bundle | **0** | excluded by the selection rule |
| pack | **0** | excluded by the selection rule |
| combo | **0** | excluded by the selection rule |

### E.1 — 22 unrelated

| SKU | Description | Why unrelated |
|---|---|---|
| LHPVGBWH | GH-T06 Junction Box | a junction box |
| LHXDE27BM | XD-3027 (E27) LED Bulb/Light with Copper Granules | **a bulb** |
| LHXBTF40E27BM / WH · LHXBTH50E27BM / WH | E27 heightened ring, full teeth, H40/H50MM | shade rings |
| LHTHT15CF · LHTHT15GD · LHTHT30CF · LHTHT30GD · LHTHT50CF · LHTHT50GD | 16×150/300/500mm half thin rod | rods / stems |
| LHTT15E27CF · LHTT15E27GD · LHTT30E27CF · LHTT30E27GD · LHTT50E27CF · LHTT50E27GD | 16×150/300/500mm rod | rods / stems |
| LHTT10150BG · LHTT10200BG · LHTT10250BG | lamp cup + rod | cup-and-rod assemblies |
| LHTT20E27YB | Three-core PVC 20cm black arm yellow brass | an arm |

### E.2 — 18 unresolved (database evidence insufficient)

| SKU(s) | Description | Why not decidable |
|---|---|---|
| LH2HTE27YB, LHLHTE27YB, LHMHTE27YB | `lamp spare Part` | names no product class at all |
| LHPLBM, LHPLCH, LHPLSN | `Plain aluminum lamp head` | a "lamp head" may or may not be a holder |
| LHPLFTE14BM/WH, LHPLFTE27BM/WH, LHPLHTE14BM/WH, LHPLHTE27BM/WH, LHPLPLE14BM/WH, LHPLPLE27BM/WH | `… teeth / Plane … Lid` | a "Lid" could be a holder cap or a shade component; four of them carry the Shopify product_type `Lampshade`, which contradicts the LH prefix |

**No guess was made for any of these 40 rows.** They are listed for the owner.

### E.3 — worth flagging inside the 117 genuine

- **Whole families the sheet omits entirely**: GU10 (`LHGU10*`, `LHTTGU10*`,
  `LHTTAGU10*`, `LHTMGU10*` — 21 SKUs), MR16 (`LHMR16SK`), B22 batten and
  push-bar switch holders (`LHETB22GD`, `LHELB22GD`, `LHSWPBB22*`), floor-lamp
  holders (`LHF3HT40*`), wood holders (`LHWHE27*`), turning holders
  (`LHTPE27J*`, `LHTPE27K*` — 15 SKUs).
- **Colour variants of families the sheet already lists**: e.g. the sheet has
  `LHCTOCO/FG/YB` but not `LHCTOBM/CH/RO/SN/WH`; it has `LHDHE27BN/CO/RO` but not
  `LHDHE27GB/SN/YB`.
- `LHPVCEE27WH` is the only one of the 157 with **no image row** in
  `inventory.product_images`.

---

# F. The 68 EOL records currently in the Sheet

Full list: `data-maps/lamp-holder-68-eol.csv`. Source of truth:
`inventory.end_of_line_products`.

```
LHAHE27AM  LHAHE27GD  LHBBE27FG  LHBLE27BN  LHBLE27CH  LHBLE27CO  LHBLE27GB
LHBLE27RO  LHBLE27SN  LHBLE27YB  LHCHE27BY  LHCHE27CH  LHCHE27CO  LHCHE27RO
LHCHE27SN  LHCHE27YB  LHDHE27BN  LHLTE27BL  LHLTE27BM  LHLTE27GG  LHLTE27GR
LHLTE27WH  LHLTE27YE  LHMTE27FG  LHPHE27YB  LHRGE27BN  LHRRE27WH  LHRUE27WH
LHS3E27CH  LHS3E27CO  LHS3E27RO  LHS3E27YB  LHS6E27BY  LHS6E27CH  LHS6E27CO
LHS6E27RO  LHS6E27YB  LHSHE27BC  LHSHE27BS  LHSHE27MB  LHSHE27RR  LHSIE27CO
LHSIE27FG  LHSIE27GB  LHSIE27RO  LHSQE27CO  LHSQE27GB  LHSQE27YB  LHSSE27BY
LHSSE27CH  LHSSE27RO  LHSWE27BA  LHSWE27CH  LHSWE27FG  LHSWE27GB  LHSWE27SN
LHSWE27YB  LHTBE27BN  LHTBE27GB  LHTBE27RO  LHTHE27CO  LHTHE27YB  LHTKE27WH
LHTRE27GB  LHTRE27SN  LHTTE27GG  LHTTE27GY  LHWME27BM
```

Whole families are dead: all 7 `LHBL*`, all 6 `LHCH*`, all 6 `LHLT*`, all 4
`LHS3*`, all 5 `LHS6*`, all 4 `LHSI*`, all 3 `LHSS*`, all 6 `LHSW*`, all 3
`LHTB*`.

**No recommendation is made on whether to delete or keep them** — that is
decision §I-5. The proposed structure adds a `Status` column so the choice can be
expressed in the sheet rather than implied.

---

# G. Candidate category fields — all 61 sheet columns assessed

Full table: `data-maps/lamp-holder-sheet-column-assessment.csv`.

Mechanical disqualification, applied to every column over all 247 rows:

| Outcome | Columns |
|---|---|
| incomplete (<100% filled — cannot classify every SKU) | 27 |
| constant or entirely empty | 24 |
| dominated (>90% a single value) | 4 |
| uncontrolled (>20 distinct values) | 3 |
| SKU key | 1 |
| **survive the mechanical filter** | **2** |

The two survivors, and why neither is the business category:

| Column | Filled | Distinct | Why it is still not the category |
|---|---|---|---|
| `Shade Support` | 100% | 2 (`TRUE` 134 / `FALSE` 113) | a boolean capability — whether a shade can be attached — not a product family |
| `Phrase Match Keyword` | 100% | 7 | a **PPC advertising** field (`E27 pendant lamp holder` ×160); an ad keyword, not a catalogue classification |

The fields most likely to be proposed, measured:

| Column | Filled | Distinct | Verdict |
|---|---|---|---|
| `Mount Type` | **93.9%** | 14 | **NO** — 15 blanks, and 6 values are compound (`Pendant/Shade Mount`, `Surface/Ceiling`, `Ceiling/Wall`, `Ceiling Mount/Pendant Base`, `Cable/Pendant Mount`, `Pendant/Table`) |
| `Socket Type` | 100% | 3 | **NO** — 98.4% is `E27` |
| `Body Pattern` | 96.0% | 36 | **NO** — uncontrolled free text |
| `Compatible Shade Type` | 95.5% | 6 | **NO** — incomplete, multi-line free text |
| `Install Type` / `Wiring Type` | 96.0% | 1 | **NO** — single value |
| `Colour Family` | 97.2% | 24 | **NO** — a finish, not a category |
| `Product Name` | **0.0%** | 0 | **NO** — the column is entirely empty |

Database side, re-confirmed:

| Source | Result |
|---|---|
| `configurator.components_sot_skus` | no `lampholder` tab; **0** LH SKUs under `bulb`/`ceilingrose`/`lampshade` |
| `configurator.components_sot_attributes` / `_attribute_values` | no rows for LH SKUs — there are no LH SOT records to attach to |
| `inventory.products` | no category / type / subtype / family / fitting column exists |
| `listings.shopify_listings.product_type` | **21 free-text values**, one SKU may carry several, and they include `LAMPSHADE`, `Light Bulbs`, `Wall Light`, `Pendant Lighting` — a marketplace field, not a source of truth |

**Per instruction 8, no field has been selected as the business category.**
`Mount Type`, `Socket Type` and every other column are reported as measured only.
The category must be **declared by the source owner**.

---

# H. Recommended corrected SOT structure

Machine-readable: `data-maps/lamp-holder-proposed-sot-structure.csv`.
**This is a proposal only — nothing has been changed.**

| Column | Requirement | Allowed values | Why |
|---|---|---|---|
| `SKU_ID` | MANDATORY | exact `inventory.products.sku`, uppercase, no suffixes, no name fragments | the join key; 15 rows fail this today |
| `Product_Type` | **MANDATORY — add** | one controlled value (e.g. `Lighting Accessory`) | Level-0; present on the other three tabs |
| `Product_Subtype` | **MANDATORY — add** | one controlled value (e.g. `Lamp Holder`) | Level-0; present on the other three tabs |
| `Lamp_Holder_Category` | **MANDATORY — add** | a closed list the owner defines; exactly one per SKU, no blanks, no compounds | the Level-1 family that drives the dashboard dropdown; **no existing sheet column or database field can supply it** |
| `Status` | **MANDATORY — add** | `Active` \| `EOL` \| `Discontinued` | lets the 68 EOL rows be shown or hidden deliberately |
| `Item_Kind` | **MANDATORY — add** | `Single` \| `Pack` \| `Combo` \| `Bundle` | separates the 5 pack rows without inferring from the SKU suffix |
| `Mount_Type` | optional attribute | closed, single-valued, no blanks | usable as an **attribute** filter once the 6 compounds and 15 blanks are resolved — not as the category unless the owner declares it |
| `Socket_Type` | optional attribute | `E27` \| `E14` \| `B22` \| `GU10` \| `MR16` | already clean; becomes useful once GU10/MR16 products are added |
| `Product_Name` | should fix | free text | the column exists but is **100% empty** |
| `IMG_LINK` | should fix | a URL for *this* SKU | 15 rows point at unrelated combo products |

Row-level corrections to apply to the tab:

| Action | Rows |
|---|---|
| Fix or delete the corrupt SKU_IDs | 15 (§B) |
| Mark as `Item_Kind = Pack` (or remove) | 5 (§C) |
| Remove — belongs to Pendant Lamp Holder | 1 (`PHXSH1PBRWH`) |
| Set `Status = EOL` (or remove) | 68 (§F) |
| Add the genuine live products the sheet omits | up to 117 (§E) |
| Decide and label | 22 unrelated + 18 unresolved (§E) |
| Resolve the bulb-vs-holder conflict | 1 (`LHXDE27WH`, §A.1) |

Once the tab carries `Product_Type`, `Product_Subtype` and `Lamp_Holder_Category`
and is synced into `configurator.components_sot_skus`, the category becomes
readable from the database exactly as Ceiling Rose and Lampshade are, and
discovery can be re-run for a GREEN verdict.

---

# I. Exact owner decisions required

| # | Decision | Options | Blocks implementation? |
|---|---|---|---|
| 1 | **Define the Lamp Holder business category** — the closed list of families and which family each SKU belongs to | owner-defined | **YES — this is the primary blocker** |
| 2 | What does the `-IDE` suffix mean, and what are the 13 rows meant to be? | correct SKU / delete the rows | YES |
| 3 | What are `LHCE27` and `LHNSE27` (rows 61, 97) meant to be? Neither exists in the catalogue | correct SKU / delete the rows | YES |
| 4 | Should packs appear in the dashboard at all? | include with `Item_Kind=Pack` / exclude | YES |
| 5 | Should the 68 EOL SKUs be shown? | show with `Status=EOL` / hide / remove from the sheet | YES |
| 6 | Which of the 117 genuine database-only holders belong on the sheet? | all / a named subset | YES |
| 7 | **Is `LHXDE27WH` a lamp holder or an LED bulb?** Its description says bulb, and its sibling `LHXDE27BM` was classified unrelated | keep as holder / move to Bulbs / remove | YES |
| 8 | Classify the 22 unrelated (rods, rings, cups, arms, junction box, bulb) | own category / different section / exclude | no — informational |
| 9 | Classify the 18 unresolved (`lamp spare Part`, `lamp head`, `Lid`) | owner-defined | no — informational |
| 10 | Confirm `PHXSH1PBRWH` is removed from the Lamp Holder tab | confirm | no — already excluded |
| 11 | Will the corrected tab be synced into `configurator.components_sot_skus`? | yes / no | affects GREEN vs AMBER |
| 12 | May I apply any of these corrections to the sheet? | **explicit approval required — nothing has been changed** | — |

---

# J. Evidence paths

| Path | Contents |
|---|---|
| `evidence/27-lamp-holder-sheet-structure.md` | tab identification, layout, counts, SKU patterns |
| `evidence/28-lamp-holder-db-comparison.md` | Sheet↔DB both directions, the 15 corrupt rows, freshness |
| `evidence/29-lamp-holder-prefix-and-contamination.md` | prefix contamination, in-sheet contamination, the 226 |
| `evidence/30-lamp-holder-source-correction-report.md` | **this report** |
| `data-maps/lamp-holder-corrupt-15.csv` | the 15 corrupt rows, exact problem, image evidence |
| `data-maps/lamp-holder-157-database-only.csv` | the 157 with classification and evidence |
| `data-maps/lamp-holder-68-eol.csv` | the 68 EOL SKUs |
| `data-maps/lamp-holder-sheet-column-assessment.csv` | all 61 columns, fill rate, distinct count, verdict |
| `data-maps/lamp-holder-proposed-sot-structure.csv` | the proposed corrected column set |
| `data-maps/lamp-holder-sheet-skus.csv` | all 247 rows with the include/exclude decision |
| `data-maps/lamp-holder-population-226.txt` | the currently usable 226 SKUs |
| `data-maps/lampholder_SOT-raw-export.csv` | raw export of gid 1423341591 |
| `data-maps/lamp-holder-mapping.md` | field-by-field mapping |
| `sql/lamp-holder-discovery-queries.sql` | discovery queries |
| `sql/lamp-holder-source-correction-queries.sql` | the queries behind this report |
| `validation/lamp-holder-discovery.md` | discovery verdict |
| `validation/lamp-holder-source-correction-status.md` | RED status and locked-section proof |
