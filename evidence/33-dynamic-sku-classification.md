# Evidence 33 — Centralised dynamic SKU classification (`classifySKU`)

> **Revision 2 (2026-08-25).** The 4-character type map is no longer limited to
> Ceiling Rose and is no longer written by hand — it is **derived at load from every
> category's own validated rows**. 181 rules across five categories. Where the data
> disagrees about a prefix, no rule is created. See "Derived index" below.

**Date:** 2026-08-25 · Files changed: `dashboard/inventory-dashboard.html`,
`validation/test_lampshade.js`. Not committed, not pushed.

## §3 Discovery — which categories actually have a validated 4-character subcategory

This was measured, not assumed. The signature of a real 4-char subcategory rule is that the
category's **existing validated family code IS the first four characters of the SKU**.

| Category | `f === sku[0..3]` | Where its family really comes from | Validated 4-char rule? |
|---|---|---|---|
| **Ceiling Rose** | **332 / 332** | the SKU itself (CRSF / CRFF) | **YES** |
| Pendant Lamp Holder | 0 / 398 | Mount Type, from the SOT tab | no |
| Lampshade | 0 / 451 | `material_primary`, from the SOT tab | no |
| Wall Arm | 0 / 180 | `Product_Subtype`, from the SOT tab | no |
| Lamp Holder | 0 / 226 | the tab declares no family at all | no |
| LED Bulbs | 0 / 218 | banner series, from the SOT tab | no |

The 4-char prefix does not even *predict* those families reliably, so inventing rules from it
would misclassify real products:

| Category | 4-char prefixes | Pure | Counter-examples |
|---|---|---|---|
| Lampshade | 52 | 96.2% | `LSCY` → Crystal Glass **and** Glass **and** Metal; `LSHM` → Metal + Natural Rope |
| Wall Arm | 47 | 89.4% | `WSIW` → 3 subtypes; `WS2L` → 3 subtypes |
| LED Bulbs | 41 | 87.8% | `LDMS` → EXO + ST64; `LDG9` → GLO + PIN |
| Pendant Lamp Holder | 59 | 86.4% | `PHBA`, `PHCH`, `PHFH` → CP + PD |

**Conclusion (§20):** Ceiling Rose is the only category with a validated 4-character
subcategory. The other five get `subCategory = "Other"` and keep their own SOT-derived family
filters untouched. Nothing was guessed.

## §4 The classifier — one function, config-driven

```js
const CLASSIFY = {
  CR: { key:'CR', name:'Ceiling Rose',        sub4:{ CRSF:'Side Fit', CRFF:'Front Fit' }, otherCode:'CROT' },
  PH: { key:'PH', name:'Pendant Lamp Holder', sub4:null },
  LS: { key:'LS', name:'Lampshade',           sub4:null },
  WS: { key:'WA', name:'Wall Arm',            sub4:null },
  LH: { key:'LH', name:'Lamp Holder',         sub4:null },
  LD: { key:'LB', name:'LED Bulbs',           sub4:null }
};
const SUB4 = {};   // flat 4-char index built from CLASSIFY — consulted FIRST
```

`classifySKU(sku)` returns `{ mainCategory, subCategory, key, famCode, unclassified }`:

1. normalise — `trim()` + `toUpperCase()` only; **no character is removed**
2. look up `sku[0..3]` in `SUB4` — this runs **before** the 2-char rule, so `CRFF…`/`CRSF…`
   can never degrade to "Other"
3. else look up `sku[0..1]` in `CLASSIFY` → main category, `subCategory = "Other"`
4. unknown prefix → `mainCategory: 'Other'`, `key: null`, `unclassified: true`

Adding a validated subcategory for another category later is a **config edit**, not a code
change — `SUB4` rebuilds itself from `CLASSIFY`.

## §5 No per-SKU mapping

There is no SKU array, no SKU→category dictionary, no manually entered future SKU and no
"new SKU" list anywhere in the dashboard. The whole configuration is **six prefix rules plus
two Ceiling Rose subcategory rules**.

## §8 Wiring — every fetched row is verified

```js
CATS[key].data = CATS[key].data.filter(r => {
  const c = classifySKU(r.s);
  if (c.key !== key){ UNCLASSIFIED.push({...}); return false; }   // mismatch, never forced
  r.mc = c.mainCategory;  r.sc = c.subCategory;
  if (c.famCode) r.f = c.famCode;
  return true;
});
```

`UNCLASSIFIED` is **empty** — no row is shown under a heading its SKU does not support, and no
product was deleted to make a count pass.

## §19 Report

| Main Category | Main Prefix | Validated 4-char Subcategories | Count | Other |
|---|---|---|---:|---:|
| Ceiling Rose | CR | CRSF Side Fit = 219; CRFF Front Fit = 113 | 332 | 0 |
| Pendant Lamp Holder | PH | none validated | 398 | 398 |
| Lampshade | LS | none validated | 451 | 451 |
| Wall Arm | WS | none validated | 180 | 180 |
| Lamp Holder | LH | none validated | 226 | 226 |
| LED Bulbs | LD | none validated | 218 | 218 |

```
Total rows classified:      1805
Total Other:                1473
Total Unclassified:            0
Classification mismatches:     0
```

## §16 Regression lock — all six datasets byte-identical

| Section | Rows | SHA-256 |
|---|---|---|
| Ceiling Rose | 332 | `d24b8f03…6223` **LOCK INTACT** |
| Lampshade | 451 | `7b8aeae0…c346a` **LOCK INTACT** |
| Pendant Lamp Holder | 398 | `7bbcec58…7022` **LOCK INTACT** |
| Wall Arm | 180 | `d954388f…` **LOCK INTACT** |
| LED Bulbs | 218 | `6b7ea547…` **LOCK INTACT** |
| Lamp Holder | 226 | `71a85c6f…` **LOCK INTACT** |

Stock, warehouse mapping, image mapping, locations, container logic, price logic and history
handling are untouched. CSV structure unchanged (Ceiling Rose 23 columns, Lampshade 25).

## §18 Validation — 360 assertions, 0 failures

| # | Check | Result |
|---|---|---|
| A | Main category: CR, PH, LS, WS, LH, LD + unknown | PASS |
| B | Every discovered validated 4-char prefix, all six categories | PASS |
| C | Every fetched row classified (1,805) | PASS |
| D | New SKUs classify with nothing added to code | PASS |
| E | Unknown SKU → Other / unclassified | PASS |
| F | All six datasets unchanged | PASS |
| G | Search | PASS |
| H | Filters (category, subcategory, warehouse, stock condition) | PASS |
| I | CSV | PASS |
| J | Dark/Light | PASS |
| K | Console errors (`node --check` + harness run) | PASS |

§11 synthetic tests: `CRSFNEW001` → Ceiling Rose / Side Fit, `CRFFNEW001` → Ceiling Rose /
Front Fit, `LSNEW001` → Lampshade, `LHNEW001` → Lamp Holder, `PHNEW001` → Pendant Lamp Holder,
`WSNEW001` → Wall Arm, `LDNEW001` → LED Bulbs, `CRNEW001` → Ceiling Rose / Other,
`ZZNEW001` → Other / unclassified. All nine asserted **absent from every dataset**, so the
result cannot come from a lookup.

§12 normalisation: `" lsNEW001 "`, `" crffNEW001 "`, `"\tcrsf100bm\n"` and
`" phsq1.5pbryb "` all classify correctly; dots are never stripped.

## §7 Scope boundary preserved

Classification uses the prefix. **Population does not.** The six populations still come from
the validated SOT extraction, because prefix *membership* is 73–95% contaminated — `LSCA`
alone is 82 products described as *"100cm French gold crystal light"*, i.e. chandeliers.
Nothing entered or left a dataset.

## Open item

The Ceiling Rose badge and CSV still read **"Side Fitting"** (the value inside the locked
dataset) while the classifier and the dropdown read **"Side Fit"**. The stored value was not
edited because that dataset is locked and byte-verified. Aligning them is a one-line display
change awaiting confirmation.

**STATUS: GREEN**


---

# Revision 2 — the 4-character index derives itself from the data

## What changed

`SUB4` is now built at load by grouping each category's own validated rows by
`sku[0..3]`:

- prefix resolves to **exactly one** type → it becomes a **rule**
- prefix spans **several** types → recorded in `SUB4_AMBIGUOUS`, **no rule is created**

Nothing is typed by hand. When the extraction returns new rows the index rebuilds
itself, so the map cannot drift away from the data.

## Derived rules, per category

| Main Category | Prefix | Derived 4-char rules | Ambiguous prefixes | Rows | Other |
|---|---|---:|---:|---:|---:|
| Ceiling Rose | CR | 2 | 0 | 332 | 0 |
| Pendant Lamp Holder | PH | 51 | 8 | 398 | 0 |
| Lampshade | LS | 50 | 2 | 451 | 0 |
| Wall Arm | WS | 42 | 5 | 180 | 0 |
| Lamp Holder | LH | 0 | 0 | 226 | 226 |
| LED Bulbs | LD | 36 | 5 | 218 | 0 |
| **Total** | | **181** | **20** | **1805** | **226** |

Lamp Holder contributes no rules because its SOT tab declares no type at all
(evidence/30) — so all 226 are legitimately "Other". Nothing was invented for it.

## The 20 ambiguous prefixes — reported, never guessed

| Category | Prefix | Types the data gives it |
|---|---|---|
| Lampshade | `LSCY` | Metal 45 · Crystal Glass 9 · Glass 1 |
| Lampshade | `LSHM` | Natural Rope 2 · Metal 1 |
| Wall Arm | `WS2L` | Wall Arm 11 · Double Spotlight 1 · Double Arm 1 |
| Wall Arm | `WSIW` | Wall Arm 9 · Adjustable 4 · Bulkhead Nautical 1 |
| Wall Arm | `WSNW` | Wall Arm 8 · With Ceiling Rose 2 |
| Wall Arm | `WSWT` | Wall Arm 7 · Bulkhead Cage 1 |
| Wall Arm | `WSBW` | Wall Arm 3 · Adjustable Cage 1 |
| LED Bulbs | `LDWW` | WW-CW Range 16 · Small-Shapes 1 |
| LED Bulbs | `LDG9` | Globe 4 · Pin-Spot 2 |
| LED Bulbs | `LDMS` | ST64 5 · Exotic-Special 1 |
| LED Bulbs | `LDDR` | Deco-Colour 2 · Small-Shapes 1 |
| LED Bulbs | `LDSS` | ST64 1 · Spiral-Filament 1 |
| Pendant Lamp Holder | `PHTT` | Pendant 40 · Ceiling Pendant 4 |
| Pendant Lamp Holder | `PHCH` | Pendant 31 · Ceiling Pendant 3 |
| Pendant Lamp Holder | `PHHT` | Pendant 20 · Ceiling Pendant 1 |
| Pendant Lamp Holder | `PHSH` | Pendant 16 · Ceiling Pendant 6 |
| Pendant Lamp Holder | `PHHR` | Ceiling Pendant 8 · Pendant 2 |
| Pendant Lamp Holder | `PHHC`, `PHBA`, `PHFH` | evenly split |

For these, a new SKU gets its **main category with certainty** and
`subCategory = "Other"` with `ambiguousPrefix: true`. The existing rows keep their
own validated SOT type — they are never rewritten to "Other".

## Behaviour for a SKU the data has never seen

| New SKU | Result |
|---|---|
| `LSGLNEW001` | Lampshade / **Glass** |
| `LSFCNEW001` | Lampshade / **Fabric** |
| `WSSSNEW001` | Wall Arm / **Adjustable Wall Arm / Lamp Holder Arm** |
| `LDA6NEW001` | LED Bulbs / **A60** |
| `CRSFNEW001` | Ceiling Rose / **Side Fit** |
| `CRNEW001` | Ceiling Rose / Other |
| `LSCYNEW001` | Lampshade / Other *(prefix ambiguous in the data)* |
| `ZZNEW001` | Other / Other *(unclassified)* |

All 181 derived rules were tested with a synthetic `<prefix>NEW001` SKU; every one
resolved to the correct main category **and** type. None of those SKUs exists in any
dataset.

## Regression

All six datasets **byte-identical**. Every type count unchanged: Ceiling Rose
CRSF 219 / CRFF 113 · Lampshade Metal 352 / Glass 72 / Fabric 13 / Crystal Glass 9 /
Natural Rope 5 · Wall Arm 118 in its main family · Pendant Lamp Holder PD 291 / CP 107 ·
LED Bulbs WW-CW 51 / A60 22. `UNCLASSIFIED` empty, 0 mismatches.

**Harness: 380 assertions, 0 failures. STATUS: GREEN.**
