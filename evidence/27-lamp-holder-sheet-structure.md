# Evidence 27 — Lamp Holder sheet structure (gid 1423341591)

**Date:** 2026-08-24 · Read-only. Dashboard not modified.

## 1. Identifying the tab — the tab name is NOT unique

The workbook contains **four** tabs whose name mentions a lamp holder:

| sheetId | Tab name | Visible | Rows | Shape |
|---|---|---|---|---|
| 2 | `Lamp_Holder_SOT_Types_1_to_6` | hidden | 6 | BaseTypeID / VariantSKU design codes (`T01-YB-NS`) — not real SKUs |
| 5 | `Lamp_Holder_Master_SOT_Types_1_` | hidden | 86 | same design-code shape; most cells `Requires Confirmation` |
| 9 | `LampHolder_SOT` | hidden | **998** | no header row; first cell is a SKU; a different, older layout |
| 16 | **`LampHolder_SOT `** (trailing space) | **visible** | **249** | banner row + header row + 247 data rows |

**gid 1423341591 = `LampHolder_SOT ` — sheetId 16, the visible one with the
TRAILING SPACE in its name.** Confirmed by exporting that gid to CSV and matching
its banner row and 61-column header against the workbook XML byte-for-byte.

This matters: the hidden `LampHolder_SOT` (no trailing space) holds 998 rows in a
completely different layout. Selecting by name rather than by gid would silently
pull a 4× larger, differently-shaped population.

## 2. Tab layout

- Row 1 — section banner: `IDENTITY` (col 0), `FUNCTION` (7), `STRUCTURE / DESIGN` (12),
  `MATERIAL` (17), `ELECTRICAL` (20), `INTALLATION` (28), `COMPATIBILITY` (36),
  `MESUREMENTS` (40), `PPC_Term` (54)
- Row 2 — column header, 61 columns
- Rows 3–249 — **247 data rows**, no in-body banner/category rows

**SKU column: `SKU_ID` (column 0).** Every one of the 247 data rows carries a value.

## 3. THERE IS NO PRODUCT TYPE OR SUBTYPE COLUMN

This is the decisive structural finding. The 61 columns are:

`SKU_ID, IMG_LINK, IMG, Stock, Product Name, Finish Name, Colour Family, Socket
Type, Switch Included, Switch Type, Mount Type, Shade Support, Body Pattern, Ring
Count, Shade Rings Qty, Lock Nut Qty, Cable Grip Included, Body Material
(Primary), Ring Material, Insert Material (Secondary), Voltage Range, Max Wattage,
Terminal Type, Dimmable, IP Rating, Frequency, Class, Earth Terminal, Parts List,
Wiring Type, Install Type, Req Electrician, Tools Required, Assembly Req, Cap Easy
DIY, Assembly Complex, Shade Hole Size, Compatible Shade Type, Compatible Shade
Size, Indoor/ Outdoor, Height mm, Width mm, Depth mm, Diameter mm, Shade Diameter
mm, Cable Length mm, Adjust Arm, Weight g, CE Cert ID, UKCA Cert ID, RoHS Cert ID,
WEEE Reg, Safety Warnings, Postage Cost, Exact Match Keyword, Phrase Match
Keyword, Broad Match Keyword, Negative Keywords, Max Bid, Min Bid, Suggested
Search Terms`

There is **no `Product_Type` and no `Product_Subtype`**. Every other tab used so
far carries both:

| Tab | Product_Type | Product_Subtype |
|---|---|---|
| `Ceilingrose_SOT` | present | present |
| `lampshade_SOT` | present | present |
| `Pendant Lamp Holder_SOT` | present (constant) | present (constant) |
| **`LampHolder_SOT `** | **absent** | **absent** |

## 4. Counts

| Measure | Value |
|---|---|
| Data rows | **247** |
| Rows with a non-empty SKU_ID | 247 |
| Distinct SKU_ID values | **247** |
| **Duplicate SKUs** | **0** |
| Banner/category rows inside the body | 0 |

## 5. SKU patterns

| Pattern | Count | Note |
|---|---|---|
| `LH…` | 246 | the expected prefix |
| `PH…` | **1** | `PHXSH1PBRWH` — the final row (sheet row 249) |
| ends `-IDE` | 13 | `LHC1E27WH-IDE`, `LHNSE27BY-IDE`, `LHSHE27BY-IDE`, … |
| ends `…PK` (pack) | 8 | 5 base + 3 `-IDE` duplicates of them |
| contains a space (malformed) | 2 | `LHCE27- Lamp Holder`, `LHNSE27- Fully Earthed Pendant Holder` |
| contains `+` (bundle) | 0 | |

Sub-prefixes after `LH` are dense and varied — `AH BB BG BH BL BP BR C1 C2 C3 C4
C5 C6 CB CC CH CN CTO DH ED HT LF LT LW MT NH NS PH PO PV RB RG RH RI RR RT RU S3
S5 S6 S9 SB SH SI SP SQ SS SU SW TB TE TH TK TO TR TT WM XCC XD XSH XWP` — 57
distinct 2–3 character groups over 246 SKUs. They encode body style, not a
business category, and the sheet nowhere declares what any of them means.

## 6. The classification columns, measured

`Mount Type` is the only column that reads like a category. After collapsing
whitespace and newlines it holds **13 distinct values plus 15 blanks**:

| Mount Type | Rows |
|---|---|
| Pendant | 141 |
| Ceiling | 33 |
| Pendant/Shade Mount | 15 |
| **(blank)** | **15** |
| Flange Mount | 14 |
| Surface Mount | 9 |
| Table Lamp/Pendant | 6 |
| Surface/Ceiling | 4 |
| Ceiling/Table Lamp | 3 |
| Ceiling/Wall | 3 |
| Shade Mount | 1 |
| Ceiling Mount/Pendant Base | 1 |
| Cable/Pendant Mount | 1 |
| Pendant/Table | 1 |

Six of the 13 values are **compound** (`Pendant/Shade Mount`, `Surface/Ceiling`,
`Ceiling/Table Lamp`, `Ceiling/Wall`, `Ceiling Mount/Pendant Base`,
`Cable/Pendant Mount`, `Pendant/Table`), five have **three members or fewer**, and
**6.1% are blank**. Splitting the compounds into single families would require
inventing a precedence rule the sheet does not state.

Other candidate columns are worse, not better:

| Column | Distribution | Verdict as a category |
|---|---|---|
| Socket Type | E27 243 · E14 2 · B22 2 | 98.4% one value — useless as a filter |
| Shade Support | TRUE 134 · FALSE 113 | a boolean capability, not a category |
| Install Type | Fixture Wiring 237 · blank 10 | 96% one value |
| Wiring Type | Hardwired 237 · blank 10 | 96% one value |
| Body Pattern | 40+ free-text values, 10 blank | uncontrolled free text |
| Compatible Shade Type | 8 values, several multi-line free text | uncontrolled free text |

**No column on this tab yields a usable Level-1 business category.**
