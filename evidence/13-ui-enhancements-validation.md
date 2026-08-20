# Evidence 13 — UI Enhancements Validation

Date: 2026-08-20 · File: `dashboard/ceiling-rose-inventory-visibility.html` (151,495 bytes)
Runtime: Node v22.22.2 · Method: the inline `<script>` was extracted from the built file and
executed **unmodified** against a DOM stub, so the shipped code was exercised, not a copy.

## Required validation table

| Feature | Required Result | Validation |
|---|---|---|
| Header background | Exactly `#15243d` | **PASS** — `header{background:#15243d` present once; no other header background rule |
| Dark/Light toggle | Works in both modes | **PASS** — 7/7 toggle tests; light→dark→light verified via `data-theme` |
| CSV export | Exports current filtered dataset | **PASS** — 332 unfiltered; 113 under CRFF; 1 under search; 47 under warehouse+stock filter |
| CSV columns | All 23 leaf columns included | **PASS** — header row length 23; every data row 23 fields |
| CSV data | Matches embedded dashboard data | **PASS** — all 332 rows compared field-by-field against `DATA` |
| Search | Existing behaviour preserved | **PASS** — SKU 1, type 219, description 99, no-match empty state |
| Filters | Existing behaviour preserved | **PASS** — CRSF 219, CRFF 113, Unit 18 47, Schmutter 128, negative 84, zero 23, reset 332 |
| Dataset | 332 SKUs unchanged | **PASS** — 332 rows, 219 CRSF / 113 CRFF |
| MCP data | No values changed | **PASS** — SHA-256 of embedded JSON identical to the original extraction |

**42 of 42 automated tests passed. 0 failed.**

## 1. Header background

```css
header{background:#15243d;border-bottom:1px solid #0c1729;padding:16px 20px}
```

The header keeps this exact colour in **both** colour modes (it is a fixed brand surface, not a
themed one), so header text is given its own fixed light-on-navy tokens rather than the themed
`--ink`. Measured WCAG contrast against `#15243d`:

| Element | Colour | Contrast | Result |
|---|---|---|---|
| Title (`h1`) | `#f4f7fc` | 14.47:1 | PASS AA |
| Subtitle | `#a7bcdd` | 8.05:1 | PASS AA |
| Tag text | `#d6e5ff` | 12.22:1 | PASS AA |
| "Unavailable" legend tag | `#f6d488` | 10.87:1 | PASS AA |
| Theme toggle label + icon | `#eaf1fb` | 13.67:1 | PASS AA |

All five exceed the 4.5:1 AA threshold for normal text.

## 2. Dark / Light toggle

Two-state control in the header (`#theme`), labelled with the mode it will switch **to**, with an
inline SVG sun/moon icon. No external library — the icons are hand-written SVG paths in the file.

| Test | Result |
|---|---|
| Explicit mode set on load | PASS — resolves from `prefers-color-scheme`, then from saved choice |
| Button labels the mode you switch to | PASS |
| Icon is inline SVG, no external library | PASS |
| Click switches mode (light → dark) | PASS — `data-theme` flips |
| Choice persisted to `localStorage` | PASS |
| Click switches back (dark → light) | PASS |
| Table intact after toggling | PASS — 332 rows, 23 cells |

Implementation detail: `localStorage` access is wrapped in `try/catch` because some browsers block
storage on `file://` origins; if blocked, the toggle still works for the session and simply falls
back to the system preference on reload. The full light palette remains defined on bare `:root`,
with dark redefined under both `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`
and `:root[data-theme="dark"]`, so table, filters, search, buttons and text stay readable in both.

## 3. CSV export

Control: `Export CSV` button in the filter bar (placed there because it acts on the filtered set).
Generation is a pure function `buildCSV(rows)`; `downloadCSV()` only wraps it in a `Blob` and an
object-URL anchor click. No data is fetched during export — the script contains zero `fetch` /
`XMLHttpRequest` calls.

The 23 exported columns, in table order:

```
SKU, Type, Image,
UK Unit 3 Stock, UK Unit 3 Location, UK Unit 4 Stock, UK Unit 4 Location, UK Unit 18 Stock,
UK Last Container Received Warehouse, UK Last Container Received Date, UK Last Container Number,
Shopify Price GBP, UK History,
German Kronen Stock, German Kronen Location, German Schmutter Stock, German Schmutter Location,
German Last Container Received Warehouse, German Last Container Received Date,
German Last Container Number, German History,
CA Stock, US Stock
```

| Test | Result |
|---|---|
| Export produces a download | PASS |
| Header row = 23 columns | PASS |
| Unfiltered export = 332 data rows | PASS |
| Every data row = 23 fields | PASS |
| All 332 rows match embedded `DATA` (stock, type, locations) | PASS |
| Missing fields exported as `Unavailable` (same convention as the table) | PASS |
| CRFF filter → 113 rows, all `Front Fit` | PASS |
| Search `crsf100bm` → 1 row, correct SKU | PASS |
| Warehouse Unit 18 + in-stock → 47 rows | PASS |
| Filename records the filtered count | PASS — e.g. `ceiling-rose-inventory-113-of-332-2026-08-20.csv` |
| No network call during export | PASS |

CSV is RFC-4180 quoted (fields containing `"`, `,`, CR or LF are quoted with doubled quotes),
CRLF-terminated, and prefixed with a UTF-8 BOM so Excel opens it correctly. `Shopify Price GBP`
carries the bare number (no `£`) so it is usable as a numeric column; the table still renders `£`.

The CSV is a **download artefact only** — it is not written to the repository and is not a source
of truth. The single source of truth remains LEDSone MCP.

## 4. Proof no inventory data changed

The embedded `DATA` array was extracted from the rebuilt HTML and hashed against the original
MCP extraction held at `scratchpad/dataset.json`:

```
embedded rows : 332          original rows : 332
embedded sha256: 3fb73cc4f4f6886209f561cdc8cbe9f3…
original sha256: 3fb73cc4f4f6886209f561cdc8cbe9f3…
IDENTICAL      : True
```

Byte-identical. No stock value, SKU, location, container, price, image URL, MCP extraction query,
source-of-truth decision, column structure or validation rule was modified — this change is
presentation only.

## 5. Single-file integrity retained

| Check | Result |
|---|---|
| `<link>` external stylesheets | 0 |
| `<script src>` external scripts | 0 |
| `fetch` / `XMLHttpRequest` | 0 |
| `<style>` blocks | 1 (inline) |
| `<script>` blocks | 1 (inline) |
| Opens directly from disk, no server | YES |
