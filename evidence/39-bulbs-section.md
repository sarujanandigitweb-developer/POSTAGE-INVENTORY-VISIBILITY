# Evidence 39 — BULBS section (replaces LED Bulbs)

Date: 2026-08-25 · Section: Bulbs · Status: **GREEN**
Source: LEDSone MCP (PostgreSQL), read-only. Query: `sql/bulbs-extraction-query.sql`

## A. What was asked

> BULBS / LED Bulbs LD / Incandescent Bulbs IC / LED Panel Light LL /
> LED Spot Light LP / Lamp Bulbs LQ — understand the bulb category remove the
> before led bulbs category and analyse create new type

The previous `LED Bulbs` section is retired as a section. It returns as the
`LED Bulbs` **type** inside the new BULBS section, alongside four new types.

## B. What the five prefixes actually return

Single products only — bundles excluded by SKU shape (`%+%`, trailing `PK`).

| Type | Prefix | SKUs | In bulb SOT | Images | EOL | With UK price |
|---|---|---|---|---|---|---|
| LED Bulbs | `LD` | 220 | 218 | 100% | 33 | 187 |
| Incandescent Bulbs | `IC` | 32 | 0 | 100% | **32** | 27 |
| LED Panel Light | `LL` | 36 | 0 | 100% | 0 | 26 |
| LED Spot Light | `LP` | 36 | 0 | 100% | 0 | 27 |
| Lamp Bulbs | `LQ` | 10 | 0 | 100% | 0 | 10 |
| **Total** | | **334** | | | | |

Every one of the 32 Incandescent SKUs is also in
`inventory.end_of_line_products`. That is a real signal about the range, not a
data fault, and the rows are shown as they are.

## C. The one thing worth checking before replacing a SOT-backed section

`LED Bulbs` was one of only three sections with a synced in-database source of
truth (`configurator.components_sot_skus source_tab='bulb'`, 218 rows). Swapping
a validated population for a SKU prefix is normally how contamination gets in —
prefix membership is 73–95% contaminated in the other categories — so the
overlap was measured before anything was changed:

```
in LD-prefix but NOT in the bulb SOT   LDCWA60HE277  "A60H E27 Cool white 7W"
                                       LDMT1852E274  "T185 E27 4W Edison Style LED…"
in the bulb SOT but NOT in LD-prefix   LDDMST64E276  "Combo Default Title."
                                       LDST64E278    "Combo Default Title."
```

The two apparent SOT-only rows were an artefact of my first filter, which
excluded any description containing "combo". `LDST64E278` (ST64 E27 8W) and
`LDDMST64E276` (dimmable ST64 E27 6W) are real single bulbs whose `description`
column holds a clobbered Shopify bundle title. The filter was corrected to test
SKU **shape** only.

**Result: the `LD` prefix (220) is a strict superset of the bulb SOT (218).**
The replacement adds two real bulbs the SOT sync missed and removes none. This
is the opposite of the usual prefix risk, and it is why the swap is safe here.

Collision check against all 4,187 SKUs already embedded across the eight
sections: `IC`, `LL`, `LP`, `LQ` have **zero** overlap; the only overlap is
`LD` ↔ the 218 being replaced. `LC` (Lamp Spares, LED Stripe accessories) does
not collide with any bulb prefix.

## D. Nothing the sheet declared was thrown away

The old section's ten banner series (WW-CW Range 51, A60 22, Filament-Deco,
Deco-Colour, ST64, Small-Shapes, Globe, Exotic-Special, Pin-Spot,
Spiral-Filament) are not a type in the new scheme. Rather than discard them they
move to a **Series** attribute — the same mechanism Pendant Lamp Holder uses for
Mount Type. Series appears as a dropdown, a table column and a CSV column, and
only the 218 SOT rows carry a value.

`LB_DATA` on disk is **byte-identical**; its lock hash is unchanged
(`6b7ea547…`). The re-typing happens in memory at load, exactly as the
Lampshade type-merge does.

## E. Classification

Bulbs is prefix-defined, so it is excluded from the derived 4-character index
(as Lamp Spares and Lighting already are). Keeping it in would have indexed the
banner series as though they were types.

The 4-char index therefore drops from 181 rules to **145**, and ambiguous
prefixes from 20 to **15** — all of the removed entries were `LB`.

In its place the two-character rule set grows from 6 rules to 10, and gains the
ability to name a type where the prefix *is* the type:

```js
LD: { key:'LB', name:'Bulbs', sub:'LED Bulbs',          code:'BLD' },
IC: { key:'LB', name:'Bulbs', sub:'Incandescent Bulbs', code:'BIC' },
LL: { key:'LB', name:'Bulbs', sub:'LED Panel Light',    code:'BLL' },
LP: { key:'LB', name:'Bulbs', sub:'LED Spot Light',     code:'BLP' },
LQ: { key:'LB', name:'Bulbs', sub:'Lamp Bulbs',         code:'BLQ' }
```

`classifySKU` step 3 now returns `c.sub || 'Other'`. The five other prefixes
have no `sub`, so `LSNEW001` still resolves to Lampshade / Other — two
characters cannot identify a shade's material. Unchanged behaviour there.

A SKU that does not exist today classifies with no code change:
`LPZZZ999` → Bulbs / LED Spot Light. `LQH` (three characters) still classifies,
because the 4-char index is skipped for short SKUs and the 2-char rule catches it.

## F. Data quality noted, not silently fixed

- `LPRO9W` carries the description `Combo Default Title.` It is a real single
  product; the description is shown verbatim rather than blanked or guessed.
- None of the 116 added SKUs has an arrived-container record, so Last Container
  renders Unavailable for all of them. That is the true state of
  `suppliers.order_items` for these SKUs.
- 116 of 334 Bulbs SKUs have no single UK price (`p` absent). This is the same
  known bundle-listing issue recorded in evidence/34; the validated price fix
  (exclude `price = 0`, prefer `sub_source = 104`) is still **not applied**, to
  any section.

## G. Validation

`node validation/test_lampshade.js` → **ALL PASS — 636 passed, 0 failed**
(was 564 before this change; +72 assertions).

New Phase 32 asserts, among others:
- no section is named `LED Bulbs`; it survives as a type
- all 218 SOT SKUs are still on screen — the replacement lost none
- per-type counts 220 / 32 / 36 / 36 / 10
- exactly 218 rows carry a Series, covering all ten series
- each of the five prefixes classifies a not-yet-existing SKU to the right type
- every Bulbs row classifies back to the type it is filed under
- `LC` does not route to Bulbs
- CSV is 26 columns and the Series cell is filled only for SOT rows
- Lighting (562) and Ceiling Rose (332) unaffected

All nine pre-existing dataset locks verified byte-identical after the change.

## H. Totals

| | Before | After |
|---|---|---|
| Sections | 8 | 8 |
| Bulbs SKUs | 218 | 334 |
| Dashboard SKUs | 4,187 | 4,303 |
| Derived 4-char rules | 181 | 145 |
| 2-char rules | 6 | 10 |
