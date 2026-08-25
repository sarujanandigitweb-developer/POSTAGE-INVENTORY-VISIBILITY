# Evidence 19 — Lampshade: Google Sheet Structure Inspection (Phase 2)

Date: 2026-08-24 · Mode: READ-ONLY · **Dashboard NOT modified**

## Source

| | |
|---|---|
| Document | **Components SOT** |
| File ID | `1jS5ZrhEXdMcBtnpB6aYJvjcmZCUjNdd16WRhz0xnkYM` |
| Owner | varmensk.digitweb@gmail.com |
| Sheet modified | 2026-08-19 10:36 UTC |
| Target tab (from the supplied `gid=816515986`) | **`lampshade_SOT`** |
| SOT sync into `configurator.components_sot_skus` | 2026-08-20 06:41 UTC, `sheet_gid = 816515986` |

The supplied gid **matches the gid the database actually synced**, so `lampshade_SOT` is
confirmed as the authoritative tab — not assumed.

## How the sheet was read

`read_file_content` returned a natural-language rendering that was **heavily truncated —
only 17 of 451 LS SKUs (3.8%)**, all from one family. It was discarded as unusable.

The tab was instead obtained in full by exporting the whole workbook as XLSX
(`download_file_content`, `exportMimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
2,454,219 bytes) and parsing `xl/worksheets/sheet13.xml` directly. Raw export saved to
`data-maps/lampshade_SOT-raw-export.csv` (1,000 rows × 208 columns).

## All 30 tabs in the workbook

```
SOT                              Lamp_Holder_SOT_Types_1_to_6     MANDATORY
Sheet2                           Lamp_Holder_Master_SOT_Types_1_  Sheet27
PRODUCT IMAGE 2026-03-04 (2)     uk stocks 2026-03-04             LampHolder_SOT
Ceilingrose_SOT v1               Ceilingrose_SOT                  Pendant Lamp Holder_SOT
lampshade_SOT   ← TARGET         Wall_Arm_SOT                     lampshade_SOT-old
LampHolder_SOT (2nd)             LED BULBS_SOT                    LED BULBS_SOT2
Pendant_Combo_SOT                Sheet4                           PRODUCT IMAGE 2026-03-09
Field_Map                        Component_Links                  Combo_Content_SOT
Next                             WallLight_Combo_SOT              WallLight_Content_SOT
Field_Map (1)                    Compatibility_Rules              Component_Links (1)
```

Note there is also a **`lampshade_SOT-old`** tab (989 rows × 139 columns). It is *not* the
synced tab and was not used. `lampshade_SOT` has 208 columns, matching the 208 attribute
keys present in `configurator.components_sot_attributes` — further confirmation.

## Row layout of `lampshade_SOT`

| Row | Content |
|---|---|
| 1 | 24 merged group bands — `IDENTITY`, `PHYSICAL`, `PRODUCT`, `MATERIALS`, `FITTING`, `INSTALLATION`, `OPTICAL`, `COMPATIBILITY`, `CAPABILITIES`, `COMPLIANCE`, `RELATIONSHIPS`, `IMAGES`, `VOC`, `PACKAGE`, `POSTAGE`, `AMAZON`, `EBAY`, `WEBSITE`, `CONTENT`, `PPC`, `GOOGLE ADS`, `META ADS`, `DIGITAL MKT`, `LISTINGS` |
| 2 | **Column headers** — 208 of them |
| 3 | Column descriptions / instructions (157 filled) |
| 4 onward | **Banner rows interleaved with data rows** |

### Columns that matter

| Col | Header | Sheet's own description (row 3) |
|---:|---|---|
| 0 | `SKU_ID` | "Unique product identifier code" |
| 1 | `IMG_LINK` | "Full URL of product image on image server" |
| 3 | `Stock_Count` | "Total units across all warehouses - amber fill = zero stock, red fill = negative stock" |
| 4 | `Product_Type` | "Top-level category" |
| 5 | `Product_Subtype` | "Sub-category within Lampshade range" |
| 8 | `Product_Status` | "Active / Draft / Discontinued" |
| 9 | `Shade_Shape` | "Normalised shape family — see SKU Decoder" |
| 12 | `Hole_Diameter_mm` | "Top opening / ring hole diameter" |
| 21 | `Material_Primary` | "Main shade material" |
| 28 | `Fitting_Type` | "Easy Fit / Pendant Light / Ceiling Mounted" |
| 29 | `Shade_ring_Compact` | "Y = 42mm hole (fits standard Easy Fit ring) / **N/A = 10mm hole (no ring, needs extended-thread lampholder)** / [VERIFY] = other hole size not yet ruled" |
| 66 | `Style_Category` | — |

**`Product_Type` and `Product_Subtype` are NOT the category axis.** They are constant across
every row: `Product_Type = 'Lighting Accessory'` (452/452) and
`Product_Subtype = 'Lampshade'` (452/452). They identify the tab, not a division within it.

## How the sheet actually represents Lampshade categories

The tab is divided by **banner rows** — single-cell rows between the data — forming a
strict two-level hierarchy:

* **Level 1 — material family**, written `◀  <name>  ▸  <n> SKUs  ▶`
* **Level 2 — shade shape**, written `•  <name>  (<n> SKUs)`

### Level 1 — the five families, exactly as written in the sheet

| Banner text | Banner's claimed count | Actual data rows | `Material_Primary` value |
|---|---:|---:|---|
| `◀  Metal Lampshades  ▸  364 SKUs  ▶` | 364 | **352** | `Metal` |
| `◀  Glass Lampshades  ▸  78 SKUs  ▶` | 78 | **73** (72 distinct) | `Glass` |
| `◀  Crystal Glass Lampshades  ▸  9 SKUs  ▶` | 9 | **9** | `Crystal Glass` |
| `◀  Fabric Lampshades  ▸  13 SKUs  ▶` | 13 | **13** | `Fabric` |
| `◀  Natural Rope-Rattan Lampshades  ▸  5 SKUs  ▶` | 5 | **5** | `Natural Rope` |
| **Total** | **469** | **452** | |

**The banner headline counts are stale** — they overstate by 17 (Metal by 12, Glass by 5).
The row contents, not the banner text, are authoritative.

**Banner family agrees with the `Material_Primary` column on 452/452 rows — zero
disagreement.** The banners are a visual restatement of that column.

### Level 2 — 46 shade-shape sub-sections

Metal (26 shapes): Cone, Shallow Dome, Wide Cone, Flat, Dome, Saucer Dome, Bell, Big Curvey,
Small Curvey, Curvey, Bowel, Barn Slot, Mosque, Half Round, Mug / Bell Shade, Teardrop,
Temple Dome, Wide / Truncated Cone, Mug, Pluto, Fluted / Hammered Dome, Umbrella,
Wagon Wheel, Deep Dome, Necked Cone, Necked Dome

Glass (22 shapes): Curvy / Dome, Bell, Bell / Floral, Bell Jar, Cylinder, Stripped,
Bell shape, Bowl, Cone, Cylinder Dome, Decorative Bell, Decorative Glass Lampshade, Dome,
Faceted Bell, Flat, Globe, Globe Shape, Tapered Cone, Temple- Dome, Lantern, Striped,
Flower Shape, Shape Pending Confirmation

Crystal Glass: Drum · Fabric: Tapered Drum · Natural Rope-Rattan: Dome

Shape banner agrees with the `Shade_Shape` column on **449/451**. The 2 exceptions sit under
the `Shape Pending Confirmation` banner but carry a real column value (`Striped`, `Globe`).

Note the shape vocabulary is not normalised: `Bell` / `Bell shape`, `Striped` / `Stripped`,
`Temple Dome` / `Temple- Dome`, `Bowl` / `Bowel`, `Globe` / `Globe Shape` all coexist.

## Duplicate, blank and status rows

| Check | Result |
|---|---|
| Data rows (first cell matches `^LS[A-Z0-9]+$`) | **452** |
| Distinct SKUs | **451** |
| **Duplicate** | **`LSGLWA140AR` — appears twice, at sheet rows 401 and 403** |
| Blank / banner rows | excluded by the `^LS…` match; 1,000 total sheet rows |
| `Product_Status` | Active **451**, Draft **1** |
| Formulas | none in the extracted columns; `IMG_PREVIEW` (col 2) is a Sheets-only inline image, empty on export |

### The duplicate in detail

The two `LSGLWA140AR` rows agree on SKU, `Material_Primary` (Glass), `Shade_Shape` and
`Fitting_Type`, and differ on three cosmetic fields:

| Field | Row 401 | Row 403 |
|---|---|---|
| `IMG_LINK` | `…/product_images/42508.jpg` | `…/product_images/43714.jpg` |
| `Product_Name` | `Glass Bell Jar Lampshade` | `Glass Bell Jar Lampshade – Amber` |
| `Outer_Colour` | `Amber (Light Honey Brown)` | `Amber` |

Because the classification fields are identical, the duplicate **does not affect category
assignment**. It does need an owner decision on which name/image is correct.

## Required Phase 2 table

| Sheet Tab | Category/Type | SKU Prefix/Pattern | SKU Column | Row Count | Notes |
|---|---|---|---|---:|---|
| `lampshade_SOT` | `Metal` (banner `Metal Lampshades`) | no single prefix — 30 distinct 4-char prefixes | `SKU_ID` (col 0) | 352 | banner claims 364 (stale) |
| `lampshade_SOT` | `Glass` (banner `Glass Lampshades`) | 9 prefixes; `LSGL` covers 57 of 72 | `SKU_ID` | 73 rows / 72 distinct | contains the duplicate |
| `lampshade_SOT` | `Crystal Glass` | all under `LSCY` | `SKU_ID` | 9 | shape = Drum |
| `lampshade_SOT` | `Fabric` | `LSDO`, `LSDT`, `LSWB`… | `SKU_ID` | 13 | shape = Tapered Drum |
| `lampshade_SOT` | `Natural Rope` (banner `Natural Rope-Rattan Lampshades`) | `LSHM`, `LSHL`… | `SKU_ID` | 5 | shape = Dome |
| `lampshade_SOT-old` | — | — | — | 989 × 139 | superseded tab, **not** synced, not used |
