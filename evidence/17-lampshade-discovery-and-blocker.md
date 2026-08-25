# Evidence 17 — Lampshade Extension: Discovery & Blocking Issues

Date: 2026-08-20 · Mode: READ-ONLY · **Dashboard NOT modified** · Status: **RED**

## Summary

LS (Lampshade) is ready to implement using the exact Ceiling Rose pattern.
**WC (Cage Lampshade) is not**, and no user-supplied tab list exists. Per the stated stop
conditions, implementation was halted before any change to the validated dashboard.

## Phase 1 — Ceiling Rose reference pattern (studied, unchanged)

Current file: `dashboard/inventory-dashboard.html` (150,783 bytes).
Note: renamed externally from `ceiling-rose-inventory-visibility.html`; content verified
**byte-identical** to the validated build (embedded data SHA-256 `3fb73cc4f4f6886209f561cdc8cbe9f3…`,
332 rows). A `hub/` directory (`publish.sh`, `push_to_hub.js`) was also added externally.
Neither was touched.

| Component | Existing approach | Reusable for Lampshade? |
|---|---|---|
| HTML | Single file; `<header>` `#15243d` + `.hdr-actions`; 3-row grouped `<thead>`, 23 leaf columns; sticky SKU column | YES |
| CSS | One inline `<style>`; 27 CSS custom properties; light on bare `:root`, dark on `:root[data-theme="dark"]` | YES |
| JS | One inline `<script>`; `const DATA` array; `matches()` predicate; `rowHTML()`; `render()` | YES |
| Embedded data | Compact-key JSON array (`s,f,t,d,i,a,al,b,bl,c,k,kl,m,ml,ca,us,uc,un,gc,gn,p,pn,p0,p1`) | YES — same keys work |
| MCP extraction | `json_agg(json_build_object(...))::text`, piped file→`jq`→shell into HTML, never retyped | YES |
| Source of truth | `inventory.physical_product_stock.quantity` (only warehouse-grain source) | **Must be re-validated for LS** |
| SKU identity | `configurator.components_sot_skus WHERE source_tab='ceilingrose'` + attr `fitting_type` | **Depends on an equivalent tab** |
| Warehouse mapping | `inventory.warehouse` ids 1/8/6/10/7/4/32 | YES |
| Location | `product_shelf_location`, `'-'` sentinel → NULL | YES |
| Image | `inventory.product_images` via `product_id` FK | YES |
| Container | `suppliers` gated on `orders.status_arrived`; shown only when exactly one | YES |
| Price | `listings.shopify_listings` site='UK'; shown only when all channels agree | YES |
| History | No source → `Unavailable` | YES |
| Search / Filters | Family chips, warehouse select, stock-condition select, text search | Needs category values |
| CSV export | `buildCSV()` pure fn + `downloadCSV()`; 23 columns; respects filters | YES |
| **PDF export** | **DOES NOT EXIST** in the current file (verified) | n/a — see note |
| Dark/Light | Two-state toggle, default Light, `localStorage` | YES |
| Validation | Inline script executed against a DOM stub; 43 automated tests | YES |

> **Correction to the brief:** the task lists "Export PDF" among existing functionality to
> preserve. The current dashboard has **no PDF export** — a string search for "pdf" returns
> nothing. There is no PDF feature to regress, and none was added.

## Phase 3 — MCP discovery

### The `lampshade` tab now exists in the SOT

`configurator.components_sot_skus` was re-synced **2026-08-20T06:41:56** (previously 2026-08-10)
and now carries a third tab:

| source_tab | SKUs | LS-prefixed | WC-prefixed |
|---|---:|---:|---:|
| lampshade | **451** | 451 | **0** |
| ceilingrose | 332 | 0 | 0 |
| bulb | 218 | 0 | 0 |

### LS — clean, and ready

| Check | Result |
|---|---:|
| SOT `lampshade` SKUs | **451** |
| Distinct SKUs | 451 |
| Duplicates | **0** |
| Bundle SKUs (`+`) | **0** |
| Unresolved in `inventory.products` | **0** |
| Non-`LS` prefix | **0** |
| `product_subtype` | `Lampshade` — **all 451** (matches the business mapping exactly) |
| `product_type` | `Lighting Accessory` — all 451 |
| `product_status` | Active 450, Draft 1 |

Available classifying attributes inside the tab:

| Attribute | Values |
|---|---|
| `fitting_type` | Easy Fit 404 · Pendant Light 9 · Ceiling Mounted 4 · *(empty)* 31 · `[VERIFY]` 3 |
| `style_category` | Vintage Industrial 352 · Contemporary Art Deco Glass 81 · Contemporary 13 · Bohemian/Boho 5 |
| `material_primary` | Metal 352 · Glass 72 · Fabric 13 · Crystal Glass 9 · Natural Rope 5 |

### WC — no classification exists

| Check | Result |
|---|---:|
| `WC%` in `inventory.products` | 1,128 |
| — single (no `+`) | 428 |
| — bundle (`+`) | 700 |
| **`WC%` in ANY SOT tab** | **0** |
| WC singles with stock rows | 291 of 428 |

There is **no `cage`/`WC` tab and no SOT row for any WC SKU**. The identification method that made
Ceiling Rose trustworthy does not exist for WC.

### The Ceiling Rose bundle rule provably FAILS for WC

The `+`-in-SKU test that cleanly separated Ceiling Rose components does not work here:

| Test on `WC%` | Count |
|---|---:|
| SKUs passing the `+` bundle rule | 428 |
| — of those, titled `Combo…` | **155** |
| — of those, pack SKUs matching `[0-9]PK$` | **147** |
| — of those, `inventory_bool = false` | **154** |

Roughly **36% contamination slips through undetected** — e.g. `WCB1WH2PK`, `WCB1WH3PK`,
`WCB1WH5PK`, `WCB2BM2PK`, all titled "Combo Default Title." with `inventory_bool = false`, none
containing a `+`.

Control test on the LS SOT tab: **0 combo-titled, 0 pack SKUs, 0 `inventory_bool=false`** — the SOT
tab guarantees cleanliness, prefix matching does not.

## Blocking issues (stop conditions triggered)

| # | Stop condition | Evidence |
|---|---|---|
| 1 | **Provided Lampshade tab list cannot be found** | No tab list appears anywhere in this project or the conversation. Repo grep for `lampshade`, `cage`, `tab list`: **0 hits** |
| 2 | **Tab list and MCP classification disagree** | Business mapping states two categories (LS, WC); MCP has **one** lampshade tab containing **zero** WC SKUs |
| 3 | **LS/WC mapping is ambiguous** | WC has no SOT classification; nothing in MCP marks a SKU as "Cage Lampshade" |
| 4 | **Bundle contamination cannot be resolved (WC)** | The validated `+` rule misses 155 combo-titled and 147 pack SKUs |

LS alone triggers none of these.

## What is NOT blocked

The LS half is fully implementable today using the unmodified Ceiling Rose pattern: 451 SKUs,
0 duplicates, 0 bundles, 0 unresolved, `product_subtype='Lampshade'` on every row, and the same
warehouse / location / image / container / price / history handling.

## To unblock

1. **Supply the Lampshade tab list** — the category names to appear as filter tabs.
2. **Resolve WC** by one of:
   a. Add a `cage`/`WC` tab to `configurator.components_sot_skus` (matches the proven pattern); or
   b. Supply an explicit, authoritative WC SKU list; or
   c. Confirm in writing that WC is out of scope for now and ship LS only.
3. Confirm whether `[VERIFY]` (3) and empty (31) `fitting_type` values should display as
   `Unavailable` or be excluded.

## Scope compliance

| Restriction | Status |
|---|---|
| Dashboard not modified | **PASS** — SHA-256 unchanged, 332 CR rows intact |
| Ceiling Rose logic unchanged | **PASS** |
| Production data unchanged | **PASS** — `SELECT` only |
| No new source of truth created | **PASS** |
| No guessed category mapping | **PASS** — stopped instead |
| Not committed or pushed | **PASS** |
