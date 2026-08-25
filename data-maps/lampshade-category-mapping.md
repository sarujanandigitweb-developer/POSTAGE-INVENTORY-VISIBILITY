# Lampshade — Authoritative Category Logic (Phases 3 & 9)

Date: 2026-08-24 · Source: `lampshade_SOT` (gid 816515986) ↔ LEDSone MCP · READ-ONLY

## Phase 3 — SKU prefix → type mapping found in the sheet

| SKU Prefix / Pattern | Lampshade Type | Sheet Evidence | Sheet SKU Count |
|---|---|---|---:|
| `LS` (all 451) | *the tab itself* — `Product_Subtype = 'Lampshade'` on 452/452 rows | `lampshade_SOT`, col 5 | 451 |
| `LSGL` | `Glass` — pure but **incomplete** | 57/57 rows are `Material_Primary = Glass` | 57 of 72 Glass |
| `LSCY` | **AMBIGUOUS — do not use** | splits `Metal` 45 · `Crystal Glass` 9 · `Glass` 1 | 55 |
| `LSHM` | **AMBIGUOUS — do not use** | splits `Natural Rope` 2 · `Metal` 1 | 3 |
| 49 other 4-char prefixes | single-material each, but none covers a whole category | — | 336 |

**The sheet does not define categories by SKU prefix.** It defines them by *column value*,
restated visually as banner rows. Prefix is therefore rejected as the category key — see
`evidence/21-lampshade-prefix-validation.md` for the full test.

`LS = Lampshade` holds only as a *population* hint, and even then only inside the SOT tab:
`inventory.products` has 2,438 `LS%` rows, of which 1,987 (81.5%) are not lampshades.

## Phase 9 — Final category logic

### Population (which SKUs are Lampshades)

```sql
SELECT s.sku
FROM configurator.components_sot_skus s
WHERE s.source_tab = 'lampshade'      -- 451 rows, 451 distinct
```

Guarantees, all measured: 451 distinct · 0 bundles (`+`) · 0 packs · 0 combo-titled ·
0 inactive · 0 end-of-line · 451/451 resolve 1:1 to `inventory.products` ·
0 SKUs present in the sheet but absent from the DB · 0 in the DB but absent from the sheet.

### Primary category (Level 1) — deterministic

```sql
attribute 'material_primary'   -- exactly 5 values, no blanks, no [VERIFY]
```

| `material_primary` | Sheet banner | Count |
|---|---|---:|
| `Metal` | `Metal Lampshades` | 352 |
| `Glass` | `Glass Lampshades` | 72 |
| `Fabric` | `Fabric Lampshades` | 13 |
| `Crystal Glass` | `Crystal Glass Lampshades` | 9 |
| `Natural Rope` | `Natural Rope-Rattan Lampshades` | 5 |

Banner family agrees with this column on **452/452 rows — zero disagreement**. Use the column;
ignore the banner headline counts, which are stale (they claim 469 against an actual 452).

### Secondary category (Level 2) — deterministic, 46 values

```sql
attribute 'shade_shape'        -- 451/451 populated
```

Agrees with the `•` shape banners on 449/451. Vocabulary is **not** normalised at source —
`Bell`/`Bell shape`, `Striped`/`Stripped`, `Bowl`/`Bowel`, `Globe`/`Globe Shape`,
`Temple Dome`/`Temple- Dome` all coexist. Display as-is; do not silently merge them.

### Fitting attribute (NOT the category) — 5 classes, deterministic

```sql
CASE
  WHEN fitting_type <> ''            THEN fitting_type          -- Easy Fit / Pendant Light /
                                                                -- Ceiling Mounted / [VERIFY]
  WHEN hole_diameter_mm = '10'       THEN 'N/A — 10mm, no ring'  -- the sheet's literal N/A
  ELSE                                    NULL                  -- must not occur; assert = 0
END
```

| Class | Count | Meaning |
|---|---:|---|
| `Easy Fit` | 404 | 42 mm hole, fits standard Easy Fit ring |
| `N/A` → **"10 mm — no ring"** | 31 | 10 mm hole, needs an extended-thread lampholder |
| `Pendant Light` | 9 | — |
| `Ceiling Mounted` | 4 | — |
| `[VERIFY]` | 3 | hole size not yet ruled — genuinely unconfirmed |

**Why the `hole_diameter_mm` branch is needed:** the sheet writes `N/A`, but the SOT sync
stores it as an empty string, so `fitting_type` alone cannot distinguish "no ring" from
"unknown". `hole_diameter_mm = '10'` selects exactly those 31 SKUs and no others — proven in
`evidence/20`. Mapping the sheet's `N/A` to `''` reproduces the database md5 byte-for-byte,
confirming this is the only transform between the two sources.

## What the currently-shipped dashboard gets wrong

`dashboard/inventory-dashboard.html` currently splits Lampshade by `fitting_type` into
`EF 404 / PL 9 / CM 4 / UN 34`.

| Problem | Correction |
|---|---|
| Uses `Fitting_Type` as the category. 404 of 451 share one value, so the filter barely divides anything | Primary category is `material_primary` (352/72/13/9/5); `shade_shape` beneath it |
| `UN 34` merges 31 `N/A` (a real class) with 3 `[VERIFY]` (unknown) | Separate them — 31 "10 mm — no ring" and 3 "[VERIFY]" |
| Kronen NA tooltip cites "all 451 Lampshade SKUs" | Still correct (0/451 have a Kronen location) |

**No dashboard change has been made** — Phase 12 requires review first.

## Items needing an owner decision (non-blocking for the mapping)

| # | Item | Detail |
|---|---|---|
| 1 | Duplicate sheet row | `LSGLWA140AR` at rows 401 & 403 — same classification, conflicting `Product_Name`, `Outer_Colour`, `IMG_LINK`. Which is correct? |
| 2 | Stale banner counts | Metal banner says 364, actual 352. Glass says 78, actual 73. |
| 3 | `[VERIFY]` fitting | 3 SKUs: `LSOL220CH`, `LSHG240BG`, `LSTF290BB` |
| 4 | Draft status | 1 of 451 is `Product_Status = Draft` — include or exclude? |
| 5 | Shape banner vs column | 2 rows under `Shape Pending Confirmation` carry real values (`Striped`, `Globe`) |
| 6 | Casing | `shade_ring_compact` has both `Y` (182) and `y` (11) |
| 7 | Sync fidelity | Ask the sheet→SOT owner to preserve the literal `N/A` instead of storing `''` |
