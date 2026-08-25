# Evidence 23 — Pendant Lamp Holder: Google Sheet Structure (Phases 1–4)

Date: 2026-08-24 · Mode: READ-ONLY · **Dashboard NOT modified**

## Tab identification

| Item | Result |
|---|---|
| Workbook | **Components SOT** (`1jS5ZrhEXdMcBtnpB6aYJvjcmZCUjNdd16WRhz0xnkYM`) |
| GID supplied | `2041874053` |
| Actual tab name | **`Pendant Lamp Holder_SOT`** (spaces, not underscores, before `_SOT`) |
| Header row | **row 2** |
| Data start row | **row 3** |
| Total sheet rows | **409** |
| SKU data rows | **406** |
| Distinct SKUs | **398** |
| Columns | **128** |

### How the tab was identified — and the one thing I could not verify

The workbook was exported as XLSX and `xl/worksheets/sheet12.xml` parsed directly.
**An XLSX export does not carry Google Sheets gids**, so the supplied `gid=2041874053`
could not be mechanically bound to a tab. Two tabs were candidates:

| Candidate tab | Size | Content | Verdict |
|---|---|---|---|
| **`Pendant Lamp Holder_SOT`** | 409 × 128 | every row `Product_Subtype = 'Pendant Lamp Holder'`, all SKUs `PH…` | **This is the tab** |
| `Pendant_Combo_SOT` | 1000 × 136 | `Product_Type = 'Pendant Light Combo'`, SKU format `CMBO-[CR]-[PLH]-[SHADE]`, row 3 is a template/`#ERROR!` row, only 4 distinct SKU-like cells | Not this — it is the combo/bundle tab |

Identification therefore rests on **content**, not on the gid. The binding is unambiguous
on content, but the gid itself is unverified — flagged rather than assumed.

Corroboration from the database: the `lampshade` SOT tab's own relationship fields name this
tab literally —
`rel_1_target = 'All M40-thread Pendant Lampholders (Pendant_Lamp_Holder_SOT)'` (336 rows)
— confirming the tab exists and is the pendant-lampholder component list.

## Column layout

Row 1 holds 15 merged group bands: `IDENTITY`, `LAMPHOLDER`, `CABLE`, `CEILING ROSE`, `DROP`,
`TOTAL`, `MATERIALS`, `INSTALLATION`, `CAPABILITIES`, `COMPLIANCE`, `PPC Team`, `VOC`,
`IMAGES`, `PERFORMANCE`.

| Col | Header | Note |
|---:|---|---|
| 0 | `SKU_ID` | the SKU |
| 1 | `Parent_ID` | **MISLABELLED — actually holds the image URL** (a URL on 406/406 rows) |
| 2 | `IMG` | **empty on 406/406 rows** |
| 3 | `Product_Type` | constant `Lighting Accessory` (406/406) |
| 4 | `Product_Subtype` | constant `Pendant Lamp Holder` (406/406) |
| 6 | `Product_Name` | descriptive title |
| 21 | `Body Material (Primary)` | 9 values incl. blanks |
| 24 | `Finish Name` | 32 values |
| 25 | `Colour Family` | 30 values |
| 55 | `Mount_Type` | `Pendant` 294 / `Ceiling Pendant` 112 |
| 62 | `Parts_List` | 3 values, mirrors Mount_Type |

**There is no `Product_Status` column** on this tab (Lampshade has one).

## Banner rows — NONE

A scan for single-cell rows returned **0**. Unlike `lampshade_SOT` (which carries
`◀ Metal Lampshades ▸ 364 SKUs ▶` family banners and `• Cone (54 SKUs)` shape banners),
this tab has **no visual category grouping whatsoever**.

## Row anomalies

| Issue | Count | Detail |
|---|---:|---|
| SKU data rows | 406 | |
| Distinct SKUs | 398 | |
| **Duplicate SKU rows** | **8** | see below |
| Blank-SKU row carrying data | **1** | sheet row 297 — holds only PPC fields (`Broad Match`, `Max_Bid_GBP`, `Postage Cost`) and no SKU; an orphan fragment |
| Malformed SKUs | 0 | all 406 match `PH[A-Z0-9.]+` |
| Non-`PH` prefixed | 0 | |

Two SKUs legitimately contain a decimal point: `PHSQ1.5PBRYB`, `PHUH0.5HETBM`.

### The 8 duplicate SKUs

| SKU | Sheet rows | Differing fields | Nature |
|---|---|---:|---|
| `PHBAF1BMRBM` | 399, 402 | **0** | exact duplicate |
| `PHCD1PBRBM` | 400, 403 | **0** | exact duplicate |
| `PHCD1PBRBW` | 401, 404 | **0** | exact duplicate |
| `PHFSH1PBRBM` | 299, 300 | 1 | `Suggested_Search_Terms` only |
| `PHTT1PWR5WH` | 247, 265 | 1 | `Body Pattern` whitespace (`Cylinder` vs `\nCylinder`) |
| `PHSF1PBR20WH` | 408, 409 | 3 | PPC copy says **white** on one, **black** on the other |
| `PHTT1PBR5BM` | 246, 264 | 4 | PPC copy says **black** on one, **silver/chrome** on the other |
| **`PHCGF1BMRBM`** | **173, 296** | **18** | **genuine conflict** — different image host (`contabostorage` vs `dashboard.digitweblk.com`), `Bulb_Base_Type` **E27 vs E28**, `Product_Name` blank vs filled |

`PHCGF1BMRBM` is the sole source of the `E28` outlier in `Bulb_Base_Type` (1 of 406).

## Sheet vocabulary quality

`Body Material (Primary)` — 9 values, and not clean:

| Value | Count |
|---|---:|
| Metal | 324 |
| Silicone | 34 |
| PVC | 21 |
| Hemp / Natural Fiber Rope | 14 |
| Thermoplastic | 6 |
| *(blank)* | 3 |
| **Hemp** | **2** |
| Metal  + Glass | 1 |
| Wood | 1 |

`Hemp` and `Hemp / Natural Fiber Rope` are the same material written two ways; 3 rows are
blank (`PHSH1PBRBM`, `PHGP1PBRBM`, `PHPO1PBRBM`). Compare Lampshade, whose 5 material values
were clean with zero blanks.

## Evidence files written

* `data-maps/pendant-lamp-holder_SOT-raw-export.csv` — full 409 × 128 raw tab export
* `data-maps/pendant-lamp-holder-sheet-skus.csv` — 406 rows, duplicates **retained**, with the
  classification-relevant columns
