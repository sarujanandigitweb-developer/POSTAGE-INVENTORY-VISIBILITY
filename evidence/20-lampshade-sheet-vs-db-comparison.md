# Evidence 20 — Lampshade: Sheet ↔ Database Bidirectional Comparison (Phases 4–7)

Date: 2026-08-24 · Mode: READ-ONLY · **Dashboard NOT modified**

## Method — checksum comparison, not eyeballing

Rather than transfer 451 rows and compare by hand, the same canonical string was built on
both sides and hashed. An identical md5 proves set equality over every element; a differing
md5 was then bisected by field until the exact cause was isolated.

* **Sheet side** — `data-maps/lampshade-sheet-skus.csv`, extracted from `xl/worksheets/sheet13.xml`, de-duplicated keeping first occurrence (451 rows).
* **Database side** — `configurator.components_sot_skus` WHERE `source_tab='lampshade'` pivoted against `components_sot_attribute_values`.

## Phase 4 — Sheet SKU reference set

| Category (`Material_Primary`) | Sheet SKU Count | Unique SKU Count | Duplicate Rows |
|---|---:|---:|---:|
| Metal | 352 | 352 | 0 |
| Glass | 73 | 72 | **1** (`LSGLWA140AR`) |
| Crystal Glass | 9 | 9 | 0 |
| Fabric | 13 | 13 | 0 |
| Natural Rope | 5 | 5 | 0 |
| **Total** | **452** | **451** | **1** |

## Phase 5/6 — SKU set comparison

```
sheet SKU-list md5 (451 sorted SKUs) : d3dfb5acee5a4bf8fac606918fad77fd
DB    SKU-list md5 (451 sorted SKUs) : d3dfb5acee5a4bf8fac606918fad77fd
                                        ^^^ IDENTICAL
```

Confirmed independently in SQL:

```sql
-- SOT SKUs that do not resolve in inventory.products
SELECT count(*) FROM sot WHERE sku NOT IN (SELECT upper(sku) FROM inventory.products);  -- 0
-- SOT lampshade SKUs resolved 1:1
SELECT count(*) FROM sot JOIN inventory.products p ON upper(p.sku)=sot.sku;             -- 451
```

### A. Sheet → Database

| SKU | Sheet Category | Database Found? | Reason | Status |
|---|---|---|---|---|
| *(none)* | — | — | — | **All 451 sheet SKUs exist in the database** |

**0 missing.** Every distinct sheet SKU resolves 1:1 to a row in `inventory.products`.

### B. Database → Sheet

| SKU | Database Category/Type | In Sheet? | Reason/Classification | Status |
|---|---|---|---|---|
| *(none, within the SOT population)* | `source_tab='lampshade'` | Yes — all 451 | The SOT tab **is** the sheet tab; it cannot contain a SKU the sheet does not | No gap |

**0 missing within the authoritative population.**

Separately, `inventory.products` holds **2,438** rows whose SKU begins `LS`, of which
**1,987 are not in the sheet**. These are *not* missing lampshades — they are bundles, packs,
combos and end-of-line records. Quantified in `evidence/21-lampshade-prefix-validation.md`.
The sheet is a curated component list; `inventory.products` is a raw catalogue. They are not
expected to be equal.

## Phase 7 — Category / type comparison

Canonical string `sku|Material_Primary|Shade_Shape|Fitting_Type` over all 451:

```
sheet, values as written           : 1285438dd69b63280ff5b5e0cbde5f69
DB                                 : 05940956f817d6d5bc8308ed4e74dedb   (differs)

sheet, with Fitting_Type 'N/A' → '': 05940956f817d6d5bc8308ed4e74dedb
DB                                 : 05940956f817d6d5bc8308ed4e74dedb
                                       ^^^ IDENTICAL
```

**One single systematic transform accounts for the entire difference.** With `N/A` mapped to
empty, sheet and database agree byte-for-byte on material, shape and fitting for all 451 SKUs.

| SKU | Google Sheet Type | Database Type | Match? | Difference |
|---|---|---|---|---|
| 420 SKUs | `Easy Fit` / `Pendant Light` / `Ceiling Mounted` / `[VERIFY]` | same | ✅ exact | none |
| **31 SKUs** | `Fitting_Type = N/A` | `fitting_type = ''` (empty) | ⚠️ **transformed** | the sync stores the literal `N/A` as an empty string |
| all 451 | `Material_Primary` | `material_primary` | ✅ exact | none |
| 449 SKUs | `Shade_Shape` | `shade_shape` | ✅ exact | none |
| 2 SKUs | banner `Shape Pending Confirmation` | `Striped` / `Globe` | ⚠️ banner-only | column value is real; only the banner says "pending" |

### Distribution cross-check

| `Fitting_Type` | Sheet | Database | Note |
|---|---:|---:|---|
| Easy Fit | 404 | 404 | ✅ |
| **N/A** | **31** | **(blank) 31** | ⚠️ flattened by the sync |
| Pendant Light | 9 | 9 | ✅ |
| Ceiling Mounted | 4 | 4 | ✅ |
| `[VERIFY]` | 3 | 3 | ✅ |

| `Material_Primary` | Sheet | Database |
|---|---:|---:|
| Metal | 352 | 352 |
| Glass | 72 | 72 |
| Fabric | 13 | 13 |
| Crystal Glass | 9 | 9 |
| Natural Rope | 5 | 5 |

## The `N/A` transform is recoverable — proven

`N/A` is **not** missing data. The sheet's own note on `Shade_ring_Compact` reads:

> "Y = 42mm hole (fits standard Easy Fit ring) / **N/A = 10mm hole (no ring, needs
> extended-thread lampholder)** / [VERIFY] = other hole size not yet ruled"

All 31 sheet rows with `Fitting_Type = N/A` carry `Shade_ring_Compact = N/A`,
`Hole_Diameter_mm = 10.0` and `Material_Primary = Metal`, across 6 shapes
(Teardrop 13, Mosque 9, Bell 4, Dome 2, Deep Dome 1, Necked Cone 1).

The database preserves the distinguishing evidence even though it dropped the label:

| `fitting_type` | `shade_ring_compact` | `hole_diameter_mm` | SKUs |
|---|---|---|---:|
| Easy Fit | Y | 40 | 182 |
| Easy Fit | [VERIFY] | 40 | 179 |
| **(blank)** | **(blank)** | **10** | **31** |
| Easy Fit | N | 40 | 29 |
| Easy Fit | y | 40 | 11 |
| Pendant Light | Y | 35 | 8 |
| Ceiling Mounted | [VERIFY] | 40 | 4 |
| [VERIFY] | [VERIFY] | 40 | 2 |
| Easy Fit | Y | (blank) | 2 |
| [VERIFY] | [VERIFY] | [VERIFY] | 1 |
| Pendant Light | (blank) | (blank) | 1 |
| Easy Fit | N | [VERIFY] | 1 |

**`hole_diameter_mm = '10'` selects exactly those 31 SKUs and nothing else.** So the `N/A`
class is fully recoverable from the database with a deterministic predicate — no guessing.

Data-quality note: `shade_ring_compact` casing is inconsistient — `Y` (182) vs `y` (11).
It does not affect the category logic.

## Impact on the currently-shipped dashboard

The Lampshade section already in `dashboard/inventory-dashboard.html` divides Lampshade by
`fitting_type` into `EF 404 / PL 9 / CM 4 / UN 34`. Against this evidence that is wrong twice:

1. **Wrong axis.** The sheet's category structure is `Material_Primary` (5 groups) with
   `Shade_Shape` beneath it. `Fitting_Type` is an attribute, not the category — and it barely
   divides anything, since 404 of 451 share one value.
2. **Wrong merge.** `UN 34` merges 31 `N/A` (a real class: 10 mm hole, no ring) with 3
   `[VERIFY]` (genuinely unconfirmed). Those are different things and must not share a bucket.

No change has been made — reported for review per Phase 12.
