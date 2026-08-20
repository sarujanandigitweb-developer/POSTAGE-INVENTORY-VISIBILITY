# Dashboard Validation Results

File under test: `dashboard/ceiling-rose-inventory-visibility.html` (151,495 bytes)
Date: 2026-08-20 · Runtime: Node v22.22.2

## How it was tested

The inline `<script>` was extracted from the built HTML and executed **unmodified** against a
minimal DOM stub, so the real render/filter/search code was exercised rather than a copy.
Header column arithmetic and CSS structure were verified by parsing the built file.

## Structure

| Check | Result |
|---|---|
| Single file (HTML + CSS + JS + data) | PASS |
| External stylesheets (`<link>`) | 0 — PASS |
| External scripts (`<script src>`) | 0 — PASS |
| `fetch` / `XMLHttpRequest` / dynamic `import` | 0 — PASS |
| Reference to `dashboard_data.js` or external JSON | 0 — PASS |
| Flask / Python / server dependency | none — PASS |
| JS syntax (`node --check`) | PASS |
| Embedded `DATA` parses as JSON | PASS — 332 rows |
| Header leaf columns = rowspan3(1) + rowspan2(7) + row3(15) | **23** — PASS |
| `overflow-x:auto` on scroll container | PASS |
| `width:max-content` on table (forces horizontal scroll) | PASS |
| SKU column `position:sticky;left:0` | PASS |

## Behaviour

| # | Test | Result |
|---|---|---|
| 1 | Initial render | PASS — 332 rows |
| 2 | Counters CRSF 219 / CRFF 113 | PASS |
| 3 | First row cell count = 23 | PASS |
| 4 | **All 332** rows have 23 cells | PASS |
| 5 | CRSF filter → 219 rows, no "Front Fit" present | PASS |
| 6 | CRFF filter → 113 rows, no "Side Fitting" present | PASS |
| 7 | Family filter reset → 332 | PASS |
| 8 | Search by SKU, case-insensitive (`crsf100bm`) | PASS — 1 row |
| 9 | Search by type ("side fitting") | PASS — 219 rows |
| 10 | Search by description ("multi-outlet") | PASS — 99 rows |
| 11 | No-match search → 0 rows + empty state visible | PASS |
| 12 | Search cleared → 332 | PASS |
| 13 | Warehouse filter Unit 18 + in-stock | PASS — 47 rows |
| 14 | Warehouse filter Schmutter + in-stock | PASS — 128 rows |
| 15 | Stock condition = negative | PASS — 84 rows |
| 16 | Stock condition = zero | PASS — 23 rows |
| 17 | Reset button restores 332 | PASS |
| 18 | `Unavailable` chips render | PASS |
| 19 | No `undefined`, `null` or `£NaN` leaking into cells | PASS |

**19/19 behaviour tests passed.** No runtime exceptions were raised during any test — the
script executed to completion on every filter permutation, which is the console-error check
available without a browser.

## Data integrity (Step 11)

| # | Check | Result |
|---|---|---|
| 1 | No unrelated SKUs — all match `^CR(SF\|FF)` | PASS |
| 2 | No bundle SKUs — no `+` in any SKU | PASS |
| 3 | No duplicate SKU rows — 332 distinct of 332 | PASS |
| 4 | CRSF rows map to `Side Fitting` (219/219) | PASS |
| 5 | CRFF rows map to `Front Fit` (113/113) | PASS |
| 6 | Family always matches SKU prefix | PASS |
| 7 | Stock values are integers or null (no strings, no floats) | PASS |
| 8 | Every warehouse value from `inventory.physical_product_stock` | PASS |
| 9 | No existing-dashboard value copied — independent re-query matched 6/6 SKUs | PASS |
| 10 | No invented values — no received-date/warehouse keys exist in the dataset | PASS |
| 11 | Image-to-SKU mapping via FK; 332 unique URLs | PASS |
| 12 | Container shown only where exactly one `status_arrived` container | PASS |
| 13 | Price shown only where UK channels agree | PASS |
| 14 | Missing values explicitly represented as `Unavailable` | PASS |
| 15 | Embedded row count 332 = validated MCP result 332 | PASS |

## Defect found and fixed during validation

The first build rendered **22 columns instead of 23** — the **UK History** column was missing
from both the header and the row template, while the UK group header declared `colspan="10"`.
Caught by test 3. Header and row template were corrected and the file rebuilt; tests 3 and 4
now pass for all 332 rows.

## Revision — 2026-08-20, UI pass

Requested changes, applied and re-validated (23/23 tests pass):

1. **Removed the report-style footer** (the "Data provenance" / missing-field prose block) so the
   page reads as a dashboard rather than a report. No data or behaviour changed. The reason for
   every `Unavailable` value is still carried in that cell's hover tooltip, and the full
   provenance and missing-field register remain in `evidence/11-dashboard-dataset-and-validation.md`.
2. **Removed the header tags** `Source: LEDSone MCP (PostgreSQL)` and
   `Stock: inventory.physical_product_stock`. The `Extracted 2026-08-20` and
   `Unavailable = not present in LEDSone MCP` tags are kept as an in-table legend.
3. **Added a theme control** in the header cycling **System → Light → Dark**, persisted to
   `localStorage` (wrapped in try/catch so it degrades cleanly on `file://` origins where
   storage is blocked).

Theme implementation: the full light palette is defined on bare `:root`; the dark palette is
redefined twice — under `@media (prefers-color-scheme: dark)` guarded as
`:root:not([data-theme="light"])`, and under `:root[data-theme="dark"]` — so an explicit choice
wins in both directions and the system default still works untouched. Group-header and badge
colours were moved into tokens so no colour is defined only inside a media query.

| Theme audit | Result |
|---|---|
| Tokens referenced by rules | 27 |
| Defined in light (bare `:root`) | 27 — PASS, none undefined |
| Defined in system-dark block | 27 — PASS |
| Defined in explicit-dark block | 27 — PASS, identical to system-dark |
| Any colour defined only in a media query | none — PASS |
| `body` has explicit token background | PASS |
| `color-scheme` set per theme (native controls/scrollbars) | PASS |

| Theme behaviour test | Result |
|---|---|
| Starts on System, no `data-theme` attribute set | PASS |
| Click 1 → Light, `data-theme="light"` | PASS |
| Click 2 → Dark, `data-theme="dark"` | PASS |
| Choice persisted to `localStorage` | PASS |
| Click 3 → back to System, attribute removed | PASS |

All 4 table checks, 5 theme checks and 14 search/filter checks re-ran green after the change:
332 rows, 23 columns on every row, CRSF 219 / CRFF 113, and identical filter counts
(Unit 18 in-stock 47, Schmutter in-stock 128, negative 84, zero 23).

## Revision — 2026-08-20, UI enhancement pass 2

Header background set to `#15243d`; two-state Dark/Light toggle with inline-SVG icon added to the
header; `Export CSV` added to the filter bar exporting the currently filtered rows across all 23
columns. **42/42 automated tests passed**, covering the three new features and full regression of
search, family/warehouse/stock filters, reset, the 23-column table and the 332-SKU dataset.

Embedded inventory data verified byte-identical to the original MCP extraction by SHA-256, so no
stock value, SKU, source-of-truth decision, extraction query or column structure changed.

Full detail, including the required feature/result/validation table and measured header contrast
ratios (all ≥ 8:1, AA), is in `evidence/13-ui-enhancements-validation.md`.

## Known limitation (not a defect)

Product thumbnails load from the image URL stored in `inventory.product_images.image_url`
(host `sin1.contabostorage.com`). The HTML, CSS, JS, all stock data, search and filters work
entirely offline; only the thumbnail pictures need network access. Embedding 332 images as
base64 would inflate the file by roughly two orders of magnitude. Where an image cannot load,
an `onerror` handler substitutes the same `Unavailable` chip used elsewhere.
