# Evidence 26 — Pendant Lamp Holder implementation

**Date:** 2026-08-24
**File changed:** `dashboard/inventory-dashboard.html` (the only file changed)
**Status:** **AMBER** — implemented and fully validated, but the category still has
no authoritative source of truth inside the database. See §7.
**Not committed, not pushed.**

---

## 1. Population — exactly the 398 validated Sheet SKUs

| Measure | Value |
|---|---|
| Sheet tab | `Pendant Lamp Holder_SOT`, gid `2041874053` |
| SKU rows on the tab | **406** |
| Distinct SKUs | **398** |
| Duplicated SKUs | 8 (each appearing exactly twice → 8 extra rows) |
| Embedded in the dashboard | **398** |
| Resolved 1:1 in `inventory.products` | 398 / 398 |
| In DB-but-not-Sheet | 0 |
| In Sheet-but-not-DB | 0 |

The population is **not** `sku LIKE 'PH%'`. That predicate returns **2,631**
products — **84.9% contamination** (ceiling-rose-and-chain sets, lampshades,
chandeliers, wooden ceiling lamps). See evidence/25.

**Excluded, deliberately:**

- the **152 database-only singles** (PH-prefixed products the Sheet does not name)
- database-only end-of-line PH products
- multi-packs and combos (`…2PK`, `…EPK`, `+` bundles) — 0 of either is embedded

Sheet SKUs that happen to be end-of-line **are kept** — the Sheet names them, so
removing them would silently shrink the agreed population. Verified in the harness.

## 2. The 406 → 398 duplicate investigation (as instructed — counts not forced)

The brief required that the duplicate rows be investigated rather than 294 + 112
being asserted as 398. They were, and **294 + 112 is a row-level split, not a
distinct-SKU split**:

| Mount Type | Sheet **rows** | Distinct **SKUs** | Duplicates removed |
|---|---|---|---|
| Pendant | 294 | **291** | 3 |
| Ceiling Pendant | 112 | **107** | 5 |
| **Total** | **406** | **398** | **8** |

The 8 duplicated SKUs, and their Mount_Type on each of their two rows:

| SKU | Rows | Mount_Type | Agreement |
|---|---|---|---|
| PHBAF1BMRBM | 2 | Ceiling Pendant | consistent |
| PHCD1PBRBM | 2 | Ceiling Pendant | consistent |
| PHCD1PBRBW | 2 | Ceiling Pendant | consistent |
| PHCGF1BMRBM | 2 | Pendant | consistent |
| PHFSH1PBRBM | 2 | Ceiling Pendant | consistent |
| PHSF1PBR20WH | 2 | Ceiling Pendant | consistent |
| PHTT1PBR5BM | 2 | Pendant | consistent |
| PHTT1PWR5WH | 2 | Pendant | consistent |

**No duplicate disagrees with itself on Mount_Type**, so de-duplicating is
lossless — no classification decision had to be made or invented. The dashboard
carries each of the 8 exactly once (asserted individually in the harness).

The dashboard therefore reports **291 / 107**, not 294 / 112.

## 3. Mount Type is an ATTRIBUTE, not the business category

The Sheet declares **no Level-1 business category** for this tab:
`Product_Type` is the constant `Lighting Accessory` and `Product_Subtype` is the
constant `Pendant Lamp Holder` across all 406 rows, and there are no banner rows
of the kind that carry the family split on the Ceiling Rose and Lampshade tabs.

Accordingly:

- `CATS.PH.fams` is **empty** — the category dropdown offers only
  "All Pendant Lamp Holder". No family was invented.
- Mount Type is registered as `attr: { key: 'mt', label: 'Mount Type' }` — it
  renders as a filter dropdown **labelled "Mount Type"**, never "Category".
- The sub-header reads: *"Pendant Lamp Holder — 398 SKUs; Mount Type is an
  attribute, not a business category"*.
- The CSV export gains one column, headed **`Mount Type`**.

Mount Type is **not** claimed to be the authoritative business category anywhere
in the UI, the data, or this evidence.

## 4. Code changes (5 edits, all additive)

| # | Location | Change |
|---|---|---|
| 1 | before `// ---- Category registry` | new `const PH_DATA = [ … 398 rows ]` + `LS_IMG_BASE` prefix expansion |
| 2 | `CATS` | new `PH` entry: `fams: []`, `attr: {key:'mt', label:'Mount Type'}`, no `sub2` |
| 3 | `CATEGORIES` | `Pendant Lamp Holder` changed from a `NOT_SYNCED` gap chip to `{ ds: 'PH' }` |
| 4 | `render()` | breakdown line gains an empty-`fams` fallback to `cfg.attr` |
| 5 | `TYPE_CLASS` | `PD:'crsf', CP:'crff'` added for badge colour |

Edit 4 is the only change to shared code. It is guarded on `cfg.fams.length`, so
Ceiling Rose and Lampshade — both of which declare families — take the original
branch unchanged. Proven by the locked-section assertions in §6.

No existing line was deleted or rewritten. Still a single self-contained file: no
external JS, CSS, JSON, or `fetch`.

## 5. Data provenance

Extracted via `mcp__claude_ai_Ledsone_postgres__execute_sql` (SELECT-only) in
4 chunks, each returning `md5()` **computed in the same transaction as the data**:

| Chunk | Rows | md5 (verified byte-for-byte after transfer) |
|---|---|---|
| 1 | 100 | `28d15ac9a99a4ea52c5fd9efc1c0d3fa` |
| 2 | 100 | `89ddcb9e4887a4eacf9fab8b80b5efe4` |
| 3 | 99 | `d34cdcaab9b6679aba52ddec72a2185b` |
| 4 | 99 | `e6d828bb182e4a7ba65b7385c8ae7b8f` |

Merged with `jq -s add`, then injected by script — no inventory value was typed
by hand. Query saved at `sql/pendant-lamp-holder-extraction-query.sql`; the
merged dataset at `sql/pendant-lamp-holder_data.json`.

Field coverage across the 398:

| Field | Coverage |
|---|---|
| Description | 398/398 (100%) |
| Image | 398/398 (100%, 398 distinct files) |
| Mount Type | 398/398 (100%) |
| Stock, all 7 warehouses | 398/398 (100%) |
| UK Unit 3 shelf location | 378/398 (95.0%) |
| Schmutter shelf location | 328/398 (82.4%) |
| UK Unit 4 shelf location | 188/398 (47.2%) |
| Kronen shelf location | 2/398 (0.5%) |
| UK container | 115/398 (28.9%) — unique for 51 |
| DE container | 37/398 (9.3%) — unique for 31 |
| UK Shopify price | 149/398 (37.4%) — single price for 75 |

Operationally notable: **129 of 398 carry a negative quantity in at least one
warehouse** (37 in UK Unit 3), and **20 have no positive stock anywhere**. These
are reported as-is; no value was corrected or suppressed.

## 6. Locked sections — verified unchanged after the PH work

Re-hashed from the shipped file, compared against `validation/locked-sections-lock.txt`:

| Section | Rows | Chars | SHA-256 | Result |
|---|---|---|---|---|
| Ceiling Rose (`DATA`) | 332 | 130,874 | `d24b8f0329b1623edc74e3fcca158c70f4637927004ff625f1712981b2596223` | **byte-identical** |
| Lampshade (`LS_DATA`) | 451 | 112,588 | `7b8aeae0e9deceda2044a86a3e34d6a71af1b43b055d2449f055bcddfbcc346a` | **byte-identical** |
| Pendant Lamp Holder (`PH_DATA`) | 398 | 107,663 | `7bbcec5811d5eb218d74a9916db2a90699e99388bdb060f85fbdb72ed0bc7022` | new |

Behavioural regression, run through the real shipped code:

- Ceiling Rose: 332 total, breakdown `CRSF 219 · CRFF 113`, **CSV still 23 columns**
- Lampshade: 451 total, breakdown `Metal 352 · Glass 72 · Fabric 13 · Crystal Glass 9 · Natural Rope 5`, **CSV still 25 columns**
- both verified again *after* switching away to PH and back

`validation/test_lampshade.js`: **160 assertions, 160 passed, 0 failed**
(96 pre-existing + 64 new for Pendant Lamp Holder).
`node --check` on the extracted inline script: PASS.

## 7. Why AMBER and not GREEN

Every implementation check passes. The verdict stays AMBER for one reason, which
implementation cannot fix:

**There is no authoritative source of truth for this category in the database.**
`configurator.components_sot_skus` has only three synced tabs — `bulb` (218),
`ceilingrose` (332), `lampshade` (451). There is no pendant-lamp-holder tab, so
the classification (`Mount Type`) exists **only in the Google Sheet** and is
merged in locally. Ceiling Rose and Lampshade both classify from the database.

Consequences to be aware of:

1. Mount Type will not follow Sheet edits until the tab is synced into
   `components_sot_skus` — it is a snapshot, not a live read.
2. The 152 database-only PH singles remain invisible in this section. They are
   real products; the Sheet simply does not name them. Whether they belong is a
   business decision, not a data one.
3. There is no Level-1 category to group by, so the category dropdown is
   single-option by design.

**To reach GREEN:** sync the `Pendant Lamp Holder_SOT` tab into
`configurator.components_sot_skus`, then re-extract from `source_tab`
instead of the pinned SKU list — the same shape Ceiling Rose and Lampshade use.

## 8. Not done, by instruction

- Not committed, not pushed — awaiting GPT review.
- Ceiling Rose and Lampshade logic and data untouched (§6).
- No production data, schema, or workflow modified. All DB access was SELECT-only.
