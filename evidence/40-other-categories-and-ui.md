# Evidence 40 — Cosmetics / Clothes / Home Appliances / Refurbished + category-bar redesign

Date: 2026-08-25 · Status: **GREEN**
Source: LEDSone MCP (PostgreSQL), read-only. Query: `sql/other-categories-extraction-query.sql`

## A. What was asked

Four more categories, given as a sheet extract of type → SKU prefix, plus:

> understand the other category reduce the all category space so give the correct ui design

Twelve categories will not fit as twelve labelled dropdowns, so both halves were
done together.

## B. The four sections — 1,358 SKUs, 32 types

| Section | Types | SKUs |
|---|---|---|
| Cosmetics | 4 | 124 |
| Clothes | 9 | 177 |
| Home Appliances | 19 | 705 |
| Refurbished | 1 | 352 |

**Cosmetics** — Belt `CSBE` 70, Hair Clips `CSHC` 40, Hair Ornaments `CSHO` 12,
Wallets `CSWA` 2.

**Clothes** — Boxer `CTBO` 87, Pajamas (M) `CTMP` 47, Shorts (M) `CTMS` 13,
Apron `AP` 12, T-Shirts (K.Fem) `CTKFT` 8, Pajamas (K.M) `CTKMP` 4,
Pajamas (K.Fem) `CTKFP` 3, T-Shirts (K.M) `CTKMT` 3. `CTFP` (Pajamas Fem) is
declared but returns 0 rows today — the type is kept so the section is ready
when stock appears, and it simply shows no rows.

**Home Appliances** — Clock `CK` 199, Clip Board `FCB` 74, Bathroom sets `BS` 66,
Foot wear `FWS` 58, Mail bags `MB` 55, Table cloth `TC` 54, Artificial Flowers
`AFW` 41, Handles `HL` 31, Mat `MA` 28, Hanging layer bags `HB` 21, Weight
Machine `WM` 21, White Board `WB` 19, Laundry bags `LBT` 12, Mortar and Pestle
`PMS` 10, Sports `SS` 7, Shower curtain `SUA` 4, Storage Box `SB` 2, Walking
Stick `WK` 2, Back Scratchers `BTR` 1.

**Refurbished** — `RB` 352 (156 of them also end-of-line).

All 1,358 rows have an image and a description. No SOT tab exists for any of
these, so the SKU prefix is the only authority — the same basis as Lamp Spares
and Lighting.

`Handles` / `HL` appears here rather than under Lamp Spares, where it was
removed earlier at your instruction. `SPR_DATA` holds no `HL` SKU, so there is
no double-counting.

## C. The risk that had to be measured

14 of the 33 prefixes are only two characters — `SB HB MB SS BS CK WM MA WB TC
WK AP HL RB`. A two-character prefix is exactly the kind of rule that quietly
captures another section's SKUs, so every result was checked against the 4,303
SKUs already embedded across the eight existing sections:

**Zero collisions.** The four new sections also do not overlap each other
(1,358 rows, 1,358 distinct SKUs).

Matching is longest-prefix-wins, in both the extraction and the classifier. That
is what keeps `CTKMP` (Pajamas K.M) from being swallowed by `CTMP` (Pajamas M),
and `AFW` (Artificial Flowers) from being swallowed by `AP` (Apron).

## D. Classifier: the prefix table is built from the registry

Previously a new SKU was classified by a derived 4-character index plus six
hard-coded 2-character rules. Neither could express a 3- or 5-character prefix,
and neither knew about the prefix-defined sections.

A type now declares its SKU prefix as the 4th element of its `fams` entry, and
`PREFIX_RULES` is **built from the registry at load**, sorted longest-first:

```js
const PREFIX_RULES = [];
(function buildPrefixRules(){
  Object.keys(CATS).forEach(key => {
    (CATS[key].fams || []).forEach(f => {
      if (!f[3]) return;
      PREFIX_RULES.push({ p: f[3].toUpperCase(), key, code: f[0], label: f[1] });
    });
  });
  PREFIX_RULES.sort((a, b) => b.p.length - a.p.length);
})();
```

The prefix that decides **which products are fetched** and the prefix that
**classifies them** are now the same string, so the two cannot drift apart.
Adding a type is a one-line registry edit — there is still no per-SKU array and
no SKU→category dictionary anywhere.

`classifySKU` order is now: derived 4-char rule → ambiguous 4-char prefix →
declared prefix (longest first) → 2-char rule → unclassified. A validated 4-char
rule still wins over a declared prefix, so no existing section changed behaviour:
`CRSFNEW001`, `LSNEW001`, `PHNEW001`, `WSNEW001`, `LHNEW001` and the five Bulbs
prefixes all resolve exactly as before, and `ZZTEST001` is still unclassified.

The per-section skips in the index builder collapsed into one list,
`PREFIX_DEFINED = { SPR, LGT, LB, CSM, CLO, HAP, RFB }`, and the three
near-identical load-time branches became one.

**Not changed:** Lamp Spares and Lighting still declare no prefixes on their
`fams`, so a brand-new `CG…` or `TP…` SKU is still unclassified, exactly as
before. Giving them prefixes would be a small edit, but Lighting's `WS` collides
with Wall Arm's `WS`, so it needs the Wall Arm / Wall Scones question settled
first — the same open question from evidence/38.

## E. The sheet's "Bags" grouping was kept

Your sheet nests Laundry bags / Storage Box / Hanging layer bags / Mail bags
under a `Bags` heading. Rather than flatten that away, it is kept as a **Group**
attribute on Home Appliances (90 SKUs), using the same mechanism as Pendant Lamp
Holder's Mount Type. The other fifteen types have no group.

## F. Category row — same design, smaller

The first attempt at this replaced the twelve dropdowns with a pill row and one
shared type dropdown. That was the wrong call: it changed a control the team
already knows in order to solve a sizing problem. **Reverted.**

The row keeps its original design — one labelled dropdown per category, product
types inside it, identical behaviour. Only the sizes changed:

| | Before | After |
|---|---|---|
| Column sizing | `min-width:158px`, grown to the widest option | `flex:1 1 112px; min-width:0` — equal and flexible |
| Row gap | 14px | 10px across / 8px down |
| Label | 12px | 11px |
| Select padding / font | 7px 10px / 13px | 5px 7px / 12px |
| Heading | 15px, 10px margin | 14px, 8px margin |

The column-sizing line is the one that mattered. A `<select>` is as wide as its
widest option unless it is told otherwise, so Wall Arm alone — whose longest type
is "Double Wall/Ceiling Spotlight Arm" — took ~190px and pushed Refurbished onto
a second row. `min-width:0` removes that floor and `flex:1 1 112px` makes all
twelve share the row equally.

All twelve now sit on **one line** at 1454px and wider; below that the row wraps
rather than squeezing the dropdowns into unreadable slivers.

Trade-off worth stating: at twelve-across each select is ~140px, so a long
selected type name is clipped in the closed dropdown. The full text is still
there when the dropdown is opened, and the Type column in the table always shows
it in full.

Two small additions, neither of which moves anything:

- Each label carries its **section population** (`Ceiling Rose 332`). It is the
  whole section, never the filtered view, so it can never disagree with the
  "Showing N of M" line.
- The active category's label is tinted with the accent colour, so which
  category you are in is readable without hunting for the outlined select.

Long names ellipsise with the full name on hover; the count and the GAP badge are
`flex:none`, so a label like "Pendant Lamp Holder" can never clip them away.

## G. Validation

`node validation/test_lampshade.js` → **ALL PASS — 783 passed, 0 failed**
(was 636 before this change; +147 assertions).

New Phase 33 asserts, among others:
- per-section counts 124 / 177 / 705 / 352 and per-type prefix membership
- **zero collisions** with the 4,303 existing SKUs, and none between the four
- 25 not-yet-existing SKUs classify to the right type, one per prefix
- `CTKMP` beats `CTMP`, `CTKFP` beats `CTFP`, `AFW` beats `AP`
- every real row classifies back to the type it is filed under
- all ten existing prefixes still resolve to their original section
- the prefix table is derived from `fams` — every rule traced back to a registry entry
- `Group = Bags` on exactly the four bag types (90 SKUs)
- the category row still renders one `<select>` per category, twelve of them
- each dropdown switches section, shows its section's population, and exactly one is active
- Home Appliances CSV is 26 columns (25 + Group); Refurbished is 25
- all eight pre-existing sections still show their original totals

All ten pre-existing dataset locks verified byte-identical.

## H. Totals

| | Before | After |
|---|---|---|
| Sections | 8 | 12 |
| Types | 55 | 87 |
| Dashboard SKUs | 4,303 | 5,661 |
| Category row width | ~2064px | ~1608px |
