# Evidence 31 — Wall Arm + LED Bulbs implementation

**Date:** 2026-08-24 · File changed: `dashboard/inventory-dashboard.html` only.
**Not committed, not pushed.**

## Wall Arm — GREEN

| | |
|---|---|
| Tab | `Wall_Arm_SOT`, gid **1720361941** |
| Sheet rows | 181 |
| Distinct SKUs | **180** (1 duplicate: `WSFTWH`, same Product_Subtype on both rows — de-duplication lossless) |
| Resolve 1:1 in `inventory.products` | **180 / 180 (100%)** |
| Sheet→DB missing / DB→Sheet extra | 0 / 0 |
| Bundles / packs | 0 / 0 |
| Prefix `WS%` in the catalogue | 673 → **73.3% contamination**, so prefix was NOT used |
| Category source | the sheet's own **`Product_Subtype`** column, 100% filled, 11 values |
| Coverage | description 180/180, image 180/180 (all on the CDN) |

Family counts (distinct SKUs): Wall Arm / Lamp Holder Arm 118 · Adjustable 44 ·
Wooden Bracket 5 · Gooseneck 4 · With Ceiling Rose 2 · Plug-in 2 · Double Arm 1 ·
Double Spotlight 1 · Bulkhead Nautical 1 · Bulkhead Cage 1 · Adjustable Cage 1.

## LED Bulbs — GREEN (strongest source in the project)

| | |
|---|---|
| Tab | `LED BULBS_SOT`, gid **297008248** |
| Sheet rows | 231 (10 banner rows + 221 SKU rows) |
| Distinct SKUs | **218** |
| `configurator.components_sot_skus` where `source_tab='bulb'` | **218** — matches the sheet exactly |
| Resolve 1:1 in `inventory.products` | **218 / 218 (100%)** |
| In-DB-not-sheet / in-sheet-not-DB | **0 / 0** |
| Bundles / packs | 0 / 0 |
| Prefix `LD%` in the catalogue | 1,238 — prefix NOT used |
| Category source | the tab's own **banner rows** (`◀ A60 — A60 series ▸ 22 SKUs ▶`) |

**Every banner's declared SKU count matched the rows beneath it exactly** — 22, 19,
21, 20, 51, 12, 11, 28, 23, 14. Coverage: description 218/218, image 218/218.

Series (distinct SKUs): WW-CW Range 51 · Filament-Deco 27 · A60 22 ·
Deco-Colour 22 · ST64 21 · Small-Shapes 20 · Globe 19 · Exotic-Special 14 ·
Pin-Spot 12 · Spiral-Filament 10.

**Known issue, reported not hidden:** 3 SKUs appear under two banners each —
`LDEST64E273` (ST64 / Filament-Deco), `LDSST64E274` (ST64 / Spiral-Filament),
`LDDRC35E144` (Small-Shapes / Deco-Colour). The dashboard assigns each its
**first banner in sheet order**; the source owner should decide the correct series.
That is why the banner totals sum to 221 while the SKU count is 218.

## Regression

| Section | Rows | SHA-256 | |
|---|---|---|---|
| Ceiling Rose | 332 | `d24b8f03…6223` | **unchanged** |
| Lampshade | 451 | `7b8aeae0…c346a` | **unchanged** |
| Pendant Lamp Holder | 398 | `7bbcec58…7022` | **unchanged** |

`node validation/test_lampshade.js` — **202 passed, 0 failed**. `node --check`: PASS.
Still a single self-contained file: no external JS/CSS, no fetch.

## LampHolder — still RED, not implemented

Left as a GAP chip. It has no `Product_Type`, no `Product_Subtype`, no business
category, 15 corrupt SKUs and no SOT sync. See `evidence/30`.
