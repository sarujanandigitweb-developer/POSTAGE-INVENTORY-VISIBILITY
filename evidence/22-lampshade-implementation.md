# Evidence 22 — Lampshade Implementation (validated SOT/database category mapping)

Date: 2026-08-24 · Dashboard: `dashboard/inventory-dashboard.html` (272,700 bytes, single file)

## Provenance chain

```
configurator.components_sot_skus (source_tab='lampshade', gid 816515986)
  + components_sot_attribute_values  → material_primary, shade_shape, fitting_type, hole_diameter_mm
  JOIN inventory.products            → product id, title
  JOIN inventory.physical_product_stock, inventory.product_images,
       suppliers.*, listings.shopify_listings
        ↓  4 chunked SELECTs, each returning its md5 IN THE SAME TRANSACTION
        ↓  each chunk written to disk and byte-verified against that md5
        ↓  jq -s add  →  sql/lampshade_data.json   (451 rows)
        ↓  python injection into const LS_DATA     (112,588 chars)
        ↓  validation/test_lampshade.js            (96 assertions)
```

**No inventory value was typed by hand.** Every chunk was proven byte-identical to the
server's own output before use:

| Chunk | Rows | md5 (server, same txn) | Local md5 | Verified |
|---|---:|---|---|---|
| 1 | 113 | `3de7a2f88783b6d84398d56cf97fdd25` | identical | ✅ |
| 2 | 113 | `315df05d36245bee706732ccebcfcf0a` | identical | ✅ |
| 3 | 113 | `6276293b33022b64d50b84d07e3a5b53` | identical | ✅ |
| 4 | 112 | `4a2b67cf640e8aff67b25ac352ab0e1c` | identical | ✅ |
| **Total** | **451** | | | |

The md5 is computed inside the same query that returns the data, so live-stock drift
between calls cannot invalidate a chunk. Chunks were fetched minutes apart, so the
embedded dataset is a point-in-time snapshot per chunk — the same property the Ceiling
Rose dataset has, and unavoidable against a live database.

## Category logic implemented

| Level | Source | Implementation |
|---|---|---|
| Population | `source_tab='lampshade'` | 451 rows; **not** an `LS%` prefix (81.5% contamination — evidence/21) |
| Level-1 | `material_primary` | row key `f` (MT/GL/FB/CG/NR) + `t` (display name) → the 5 category options |
| Level-2 | `shade_shape` | row key `sh` → `#sub2` dropdown, 46 values, counts shown |
| Attribute | `fitting_type` + `hole_diameter_mm` | row key `ft` → `#attr` dropdown, 5 classes |
| Description | `inventory.products.title` | row key `d`, included in the search haystack |

### The N/A recovery, in the extraction SQL

```sql
'ft', CASE WHEN COALESCE(prod.ft,'') <> '' THEN prod.ft
           WHEN prod.hole = '10'           THEN 'N/A — 10mm, no ring' END
```

31/31 recovered. `hole_diameter_mm = '10'` selects exactly those 31 and nothing else.
They are **not** placed in any Unclassified bucket — no such bucket exists any more.

### Source values preserved verbatim

Near-duplicate shape spellings are kept apart, exactly as stored:
`Bell` / `Bell shape` · `Striped` / `Stripped` · `Bowl` / `Bowel` ·
`Temple Dome` / `Temple- Dome` · `Globe` / `Globe Shape`.
The 3 `[VERIFY]` fittings (`LSHG240BG`, `LSOL220CH`, `LSTF290BB`) keep that literal value.

## Duplicate handling (§6)

`LSGLWA140AR` appears twice in the sheet (rows 401/403, conflicting `Product_Name`,
`Outer_Colour`, `IMG_LINK`). The database holds one row, and the dashboard holds
**exactly one** — asserted by the harness. Nothing was merged or invented; the conflict
is recorded in `evidence/19` and `data-maps/lampshade-category-mapping.md` as an owner item.

## Ceiling Rose regression

| | |
|---|---|
| `const DATA` sha256 before | `d24b8f0329b1623edc74e3fcca158c70f4637927004ff625f1712981b2596223` |
| `const DATA` sha256 after | `d24b8f0329b1623edc74e3fcca158c70f4637927004ff625f1712981b2596223` |
| chars / rows | 130,874 / 332 — unchanged |
| Verdict | **PASS — byte-identical** |

Ceiling Rose declares no `sub2`/`attr`, so both new dropdowns stay hidden and its CSV keeps
exactly its original 23 columns. Badge markup, search, family filter, breakdown text and
dark/light behaviour are all asserted unchanged.

## Changes made to shared code (all additive, CR-neutral)

| Location | Change | CR impact |
|---|---|---|
| `CATS.LS` | `fams` → 5 materials; added `sub2`/`attr` specs | none |
| `state` | added `sub2`, `attr` | none (empty for CR) |
| `matches()` | Level-2/attribute filters guarded on `cfg.sub2`/`cfg.attr`; search haystack gained `sh`+`ft` | none — guards are false for CR, and `r.sh`/`r.ft` are undefined → `''` |
| `buildExtras()` | new — renders the two dropdowns, hides them when absent | hidden for CR |
| `buildCSV()` | appends `extraCols(active())` | empty for CR → identical 23-column output |
| `TYPE_CLASS` | added MT/GL/FB/CG/NR; kept CRSF/CRFF | none |
| markup | added `<select id="sub2" hidden>`, `<select id="attr" hidden>` | none |

## Owner review items (recorded, not blocking)

1. `LSGLWA140AR` duplicate sheet row — conflicting name/colour/image.
2. 3 `[VERIFY]` fittings — unconfirmed at source, displayed as-is.
3. 1 `Product_Status = Draft` of 451 — currently included; confirm include/exclude.
4. Sheet→SOT sync flattens `N/A` → `''` — recovered here via `hole_diameter_mm`, but the
   sync should preserve the literal value.
