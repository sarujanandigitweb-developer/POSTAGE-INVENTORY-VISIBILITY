# Evidence 49 — Lamp Holder repopulated from the `LH` prefix, 226 → 417

**Date:** 2026-08-27 · Applied. Not committed, not pushed.
**Triggered by:** *"how many extra lampholder add here all are single component or"* → *"add now"*

Evidence/48 established the reconciliation: the dashboard's 226 came from the
`LampHolder_SOT ` Google Sheet tab, not from the database, because
`configurator.components_sot_skus` has no lampholder tab at all. 191 LH SKUs that
exist in `inventory.products` appeared on **no section of the dashboard**.

This applies the fix.

## What was added

**191 SKUs, every one a single component.** Bundles (`%+%`, e.g. `LHBPE27BM+CGMLBM`)
and packs (`…PK`, e.g. `LHDHE27SN5PK`) are excluded, which is why the section total is
417 and not the ~511 you get by counting every LH listing.

| | |
|---|---:|
| rows added | **191** |
| bundles among them | **0** |
| packs among them | **0** |
| with stock history | 168 SKUs · 1,192 movements · 1,131 carried |
| with a Shopify price | 115 (76 have no UK listing at all) |
| with Unit 5 / warehouse 33 stock | 21 |
| with a last arrived container | 29 |

155 of the 191 say "holder" in their own description. The other 36 are holder **parts** —
13 lids and teeth rings, 14 rods and rod-plus-cup assemblies, 3 aluminium lamp heads,
3 named only `lamp spare Part`, and 3 oddities (`LHPVGBWH` a junction box, `LHXDE27BM`
a bulb, `LHTT20E27YB` an arm). They keep the `LH` prefix, so they stay in Lamp Holder:
the prefix is what the warehouse actually files them under, and reclassifying by
description would be inventing a rule the source does not state.

Across all 417, **380 (91.1%) say "holder"** — the prefix is clean.

## On screen now

```
Lamp Holder rows          417        unique SKUs        417
dropped by the classifier   0        all main category  Lamp Holder
families declared           0        (no type dropdown - the source declares none)

with a Mount Type         215        with an image      416
with a Shopify price      335        with Unit 5 stock   23
with a UK container        72        German container    13
with stock history        394        UK 392 / German 275 / truncated past 12: 68

total units on shelf  125,904
```

Dashboard total **5,661 → 5,852**.

`Mount Type` is blank on the 191 and reads *Unavailable*, because nothing in
`inventory.products` declares one. No type was invented, and the section still shows no
type dropdown — the same decision as Pendant Lamp Holder.

## How it was applied

Through the separate-lookup pattern, exactly as `LS_EXTRA` and `LB_EXTRA`:

```js
const LH_EXTRA = [ … 191 rows … ];
LH: { data: LH_DATA.concat(LH_EXTRA), … }
```

`LH_DATA` is untouched on disk. **All fourteen pre-existing dataset locks verified
byte-identical** after the change — re-run with `node validation/verify-locks.js`.

Four lookups grew, each by exactly what was generated:

| lookup | before | after | Δ |
|---|---:|---:|---:|
| STOCK HISTORY | 5,480 | 5,648 | +168 |
| LAST CONTAINER | 1,038 | 1,067 | +29 |
| UK UNIT 5 | 265 | 286 | +21 |
| SHOPIFY PRICE | 3,320 | 3,435 | +115 |

Shopify prices were **appended textually** rather than re-serialised: the source writes
`17.0` where `JSON.stringify` writes `17`, so re-encoding the object would have rewritten
3,320 entries that did not change.

## The parser had to be rebuilt — and was proved, not assumed

The code that produced `HIST_RAW` from `inventory.product_history` was never saved. Adding
history for 168 new SKUs meant reconstructing it, and a reconstruction that merely *looks*
right would put two subtly different histories side by side in the same dialog.

So it was checked against the rows already published, in both directions:

| check | result |
|---|---|
| embedded Lamp Holder movements re-derived | **2,626 / 2,626 exact** |
| region sequences (ordering + the 12-per-region cap) | **590 / 590 identical** |
| `HIST_TOTAL` entries | **590 / 590 identical** |
| regions present in the rebuild but not embedded | **0** |
| SKUs re-encoding byte-identical to `HIST_RAW` | **226 / 226** |

Getting there took nine measured corrections, each forced by a diff rather than guessed:

- **`Supply` lines** carry a timestamp the date regex has to step over, and their detail
  is kept whole as the remark — a supply line is one movement, not four.
- **`UK stock changes:`** splits into several movements, but the value capture must stop
  at a comma: `(\S*)` swallowed `120,Unit4(unit3` and destroyed the second movement.
- **Concatenated records.** Some source lines hold several records with no newline
  between them. The `to` that splits before/after is anchored on a **digit** first;
  only then on anything at all. This is what the published rows show.
- **A `by <who> On <date>` trailer names its own date, and that date wins** — but only
  where the trailer is the whole tail. If the new value still contains its own ` to `,
  another record is buried in there and the greedy split is the right one.
- **`Changed through low inventory checkup`** is a second CSV-upload wording.
- **`German inventory changed to null from 0 By joylene.`** writes the pair **backwards**.
- **`informed` needs a space in front of it.** `-informed nanthu` is not a name boundary,
  and treating it as one invented an informed person on 10 movements.
- **Remarks lose trailing punctuation; people keep theirs.** `manoranjini on 2024-04-10.`
  is stored with its full stop; `…changed to 0,` is not.
- **`Mark(unit2) from 1 to yes`** — a typed-in word where a quantity belongs. The segment
  is dropped rather than rendered as a stock figure.

## A defect reproduced deliberately

**On CSV-upload lines only, a leading minus is dropped.** `from -2 to 0` is recorded as
`2 → 0`, which flips the sign of the movement:

```
German Inventory Changed through CSV Upload from -2 to 0 by trainees_nelliady on 2023-03-13.
   → stored as  before 2 · after 0 · qty −2      (it should be −2 → 0, qty +2)
```

It affects **41 of the 2,626** Lamp Holder movements (1.6%). Other branches are fine —
`UK stock changes` keeps `-4`, manual corrections keep `-21`.

This is reproduced rather than fixed. Fixing it here would leave the 191 new SKUs
disagreeing with the 5,480 already published, in the same dialog, with nothing on screen
to say which is which. **The fix belongs to all 5,480 at once**, and that means
re-extracting the whole 30 MB table — its own task, not a side effect of this one.
Recorded here so it is not rediscovered from scratch.

Note this is a *different* bug from the one evidence/45 fixed. That one stripped `-` from
both ends of every captured value everywhere; this one survives in a single branch.

## Two decisions left at their conservative default

1. **The 37 holder parts stay in Lamp Holder.** Moving lids, rods and teeth rings to Lamp
   Spares is defensible, but the SKU prefix is the only thing the source actually states.
2. **No type dropdown.** At 417 SKUs a breakdown would earn its place, but it would have
   to be derived from the SKU, and nothing in the source declares one. Inventing one
   breaks the rule this dashboard has held to throughout.

Both are owner calls, and both are cheap to reverse.

## Files

- `sql/apply-lamp-holder-extra.js` — the applier; refuses to run twice
- `sql/lamp-holder-extra_data.json` · `_price.json` · `_unit5.json` · `_container.json`
- `sql/product-history-parser.js` · `sql/product-history-regions.js` — the rebuilt parser
- `validation/verify-locks.js` — re-hashes every dataset
- `validation/check-lamp-holder.js` — loads the data layer and reports the section

## Validation

`node validation/verify-locks.js` → all fourteen pre-existing datasets byte-identical.
`node validation/check-lamp-holder.js` → 417 rows, 417 unique, 0 dropped.
`node validation/test_lampshade.js` → see below.

WHOLE FILE sha256 `f48f0c96…`, 4,806,205 characters (was 4,710,030).
