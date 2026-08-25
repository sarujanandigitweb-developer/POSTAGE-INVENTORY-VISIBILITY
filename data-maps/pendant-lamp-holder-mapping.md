# Pendant Lamp Holder — Mapping & Final Population Rule (Phases 2, 3, 11)

Date: 2026-08-24 · Source: `Pendant Lamp Holder_SOT` (gid 2041874053, content-identified) ↔ LEDSone MCP

## Phase 2 — SKU prefix → type mapping found in the sheet

| Prefix / Pattern | Type / Category | Sheet SKU Count | Evidence |
|---|---|---:|---|
| `PH` (all 398) | `Product_Subtype = 'Pendant Lamp Holder'` | 398 | col 4, constant on 406/406 rows |
| `PH` (all 398) | `Product_Type = 'Lighting Accessory'` | 398 | col 3, constant on 406/406 rows |

**One prefix, one declared type — and the type is constant, so it carries no discriminating
information.** There is no second prefix, and no prefix maps to more than one sheet type,
because the sheet declares only one type.

The prefix is, however, **not safe as a population rule** — `PH%` in the database also covers
ceiling-rose-and-chain sets, lampshades, chandeliers and wooden ceiling lamps
(`evidence/25`).

## Phase 3 — how the sheet divides the products: **it does not**

| Level | Field / Rule | Values | SKU Count |
|---|---|---|---:|
| Declared Level-1 | — | **none** | — |
| Banner rows | — | **none (0 single-cell rows)** | — |
| `Product_Type` | col 3 | `Lighting Accessory` | 406 (constant) |
| `Product_Subtype` | col 4 | `Pendant Lamp Holder` | 406 (constant) |

Unlike `lampshade_SOT`, which declares its categories with `◀ Metal Lampshades ▸ 364 SKUs ▶`
family banners and `• Cone (54 SKUs)` shape banners, this tab has **no banners and no
category column**. Every column that could act as a category is an *attribute*:

| Candidate | Values | Blank/`-` | Why it is not a category |
|---|---|---:|---|
| `Mount_Type` (col 55) | `Pendant` 294 · `Ceiling Pendant` 112 | 0 | Kit contents, not a product family — mirrors `Parts_List` |
| `Parts_List` (col 62) | `Lamp Holder, Shade Ring, Lock Nut, Cable` 293 · `Lamp Holder, Cable, Ceiling Rose, Mounting Bracket` 112 · `Lamp Holder, Lock Nut, Cable` 1 | 0 | what is in the box |
| `Body Material (Primary)` (col 21) | 9 values | **3 blank** | vocabulary inconsistent — `Hemp` (2) vs `Hemp / Natural Fiber Rope` (14) |
| `Cable_Material` (col 30) | 6 values | 0 | cable spec, not product family |
| `Cable_Type` (col 28) | `Round` 353 · `Twisted` 39 · `Rope Cable` 14 | 0 | cable spec |
| `Finish Name` (col 24) | 32 values | — | colourway, too granular |
| `Colour Family` (col 25) | 30 values | — | colourway, too granular |

The nearest thing to a clean 2-way split is `Mount_Type` / `Parts_List`
(**with ceiling rose 112 · without 294**), but the sheet never labels it as the category, and
choosing it would be **our** decision, not the sheet's.

## Phase 11 — Final population rule (proposed, NOT yet implementable)

```text
POPULATION  = the 398 distinct SKU_ID values on tab `Pendant Lamp Holder_SOT`
              (gid 2041874053), de-duplicated, joined to inventory.products on upper(sku).
              NOT `inventory.products WHERE sku LIKE 'PH%'` — that is 84.9% contamination.

CATEGORY    = *** NOT ESTABLISHED ***
              The sheet declares no Level-1 category. Product_Type and Product_Subtype are
              constant across all 406 rows.

SUBCATEGORY = *** NOT ESTABLISHED ***
```

The population half is proven. The category half **cannot be stated** without inventing a
grouping the sheet does not declare — which the brief forbids.

### Why this rule is weaker than Ceiling Rose and Lampshade

| | Ceiling Rose | Lampshade | **Pendant Lamp Holder** |
|---|---|---|---|
| Authoritative list in the DB | ✅ `source_tab='ceilingrose'` | ✅ `source_tab='lampshade'` | ❌ **not synced — sheet only** |
| Reproducible by SQL alone | ✅ | ✅ | ❌ needs a manual sheet export |
| Declared Level-1 category | ✅ `fitting_type` | ✅ `material_primary` (+ banners) | ❌ **none** |
| Declared Level-2 | — | ✅ `shade_shape` | ❌ **none** |
| Sheet duplicates | 0 | 1 (cosmetic) | **8** (1 with 18 conflicting fields) |

## Options to reach GREEN

1. **Sync the tab.** Add `Pendant Lamp Holder_SOT` (gid 2041874053) to the sheet→SOT sync as
   `source_tab='pendantlampholder'`. This is the proven pattern and would make the population
   reproducible from SQL, exactly like the two completed sections.
2. **Declare the category.** Have the sheet owner state the Level-1 grouping — either by adding
   banner rows / a category column, or by confirming that `Mount_Type`
   (*Pendant* 294 / *Ceiling Pendant* 112) is the intended split.
3. **Resolve the 56.** Decide whether the 35 holder-like actives are sheet omissions, and
   confirm the 21 other-category SKUs are deliberately out of scope.
4. **Fix the 8 duplicates**, especially `PHCGF1BMRBM` (E27 vs E28, two different images).
5. **Rule on the 32 EOL** SKUs the sheet still lists.
