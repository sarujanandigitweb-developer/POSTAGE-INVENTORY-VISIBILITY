# Evidence 45 — Stock history filled from `inventory.product_history`

**Date:** 2026-08-26 · Not committed, not pushed.

## This closes evidence/41

Evidence/41 concluded, after six checks, that LEDSone held **no** stock-movement source.
That conclusion was wrong in one specific way: it searched for a table shaped like an
audit log — by name, by column, by recency. `inventory.product_history` has neither an
obvious name match nor a single structured column, and it stores its record as **prose**.
A search for `stock_before` / `from_location` / `changed_by` could never find it.

The table exists, and it goes back to 2020-12-07.

## What the source actually is

| | |
|---|---|
| Rows | 6,316 — one per product, keyed `inventory_id` |
| SKU | **none** — must join `inventory_id → products.id → products.sku` |
| `history` | newline-separated free text, 30 MB total, up to 1.37 MB in one row |
| `source_created_at` / `source_updated_at` | rebuild timestamps, all in one narrow window — **useless as business dates** |

Real event dates live **inside the text**.

## Reading 468,923 lines

| Line kind | Lines | |
|---|---:|---|
| `Product was editted by <user> On <date>` | 380,777 | catalogue edits — **excluded**, no stock content |
| Product flags (`outofstock`, `endofline`, …) | 2,717 | **excluded**, not stock |
| Order cancellations | 1,426 | **excluded**, not a movement |
| **Stock movement lines** | **84,424** | parsed |

**81% of the table is not stock history at all.** Parsing it naively would have produced
a history dominated by "someone edited the product description".

The 84,424 stock lines parsed into **85,180 movements** — a line can carry several:

```
UK stock changes: Unit3(Quantity) from -4 to 120,Unit4(unit3) from 124 to 0 (L/Z taken) by mithusha on 2026-05-04
```

is two movements, and reading only the first would lose the Unit 4 pick.

**Seven lines out of 84,424 could not be parsed** — every one a typing error in the
source (`unit2 value changed from 0 to Q`, ``to ` ``, `to FCBQ324RE`). Skipped rather than
rendered as a quantity.

## Formats found (all measured, none assumed)

| Shape | Maps to |
|---|---|
| `UK stock changes: Unit4(unit3) from -25 to 0 (remark) by user on <date>` | Stock change |
| `Supply - SU1201 loaded by user On <date> - <detail>` | Goods received, container `SU1201` |
| `[ <date> - Canada Inventory Changed through CSV Upload from -1 to 30(x informed) by user]` | CSV upload |
| `germanInventory changed from 2 to 3(remark) by user On <date>` | Manual correction |
| `[ <date> - Quantity 11 is increased in Unit2 from Unit1 by user. Old quantity …]` | **Transfer** |

## A bug worth recording

The field-tidying helper stripped `-` from both ends of every captured value. It turned
`from -1 to 30` into `1` — **silently making negative stock positive**. It was found only
by eyeballing a parsed row against its source line.

**5,967 movements carried a negative before/after value and were being corrupted.**
2,933 of them survive into the carried set, and the count is now asserted so the bug
cannot return.

## What reaches the dashboard

**5,480 of the 5,661 SKUs have recorded movements.** The **12 most recent** are carried
per SKU; where more exist the true total is stored, and the dialog says *"Showing the 12
most recent of 70 recorded movements"* rather than implying it is the whole story. 1,796
SKUs are truncated that way.

44,330 movements in ~2.2 MB, by interning repeated values — 1,181 dates, 4 actions,
37 locations, 84 people. The file grows 1.55 MB → 3.66 MB.

Action mix: CSV upload 37,301 · Goods received 15,017 · Stock change 13,178 ·
Manual correction 12,064.

## Mapping to spec §8.2

All ten columns now come from the source:

| Spec column | Source |
|---|---|
| Date | parsed from the line |
| From Location | transfers only — **see below** |
| To Location | the unit/inventory the line names |
| Stock Before / After | the `from X to Y` pair |
| Qty | computed, **only when both sides are numbers** |
| Action | the line's own shape; a goods receipt shows its `SU####` |
| Informed Person | extracted from `(<name> informed)` — 6,105 movements carry one |
| Changed Person | the `by <name>` clause |
| Remarks | the parenthetical text |

**`From Location` is empty on every row, and that is the source's state, not a parsing
gap.** The unit-to-unit transfer format exists but occurs on **2 of 84,424 lines**,
neither of them a dashboard SKU. Spec §8.3 lists Unit-to-Unit Transfers first; the
warehouse is not recording them in a form this log captures. **Worth raising with whoever
owns the stock-update process.**

## Two decisions

**The dialog is no longer split by region.** The source logs Canada, USA, Netherlands and
France movements alongside UK and German ones; filtering by region would hide them
entirely. Both History buttons now open the SKU's complete record, and each row names its
own location.

**Numeric styling is per value, not per column.** On a location move, Stock Before/After
hold a shelf code (`L-A-02-A`), which should not be right-aligned as a number.

## Warehouse 33 is Unit 5 — now proven

Evidence/43 identified warehouse 33 as the new Unit 5 by inference and said so plainly:
*"NAMING IS A TEAM STATEMENT, NOT A DATABASE FACT."*

This log settles it. 26 SKUs carry a `Unit5(unit5) from … to …` line; **all 26 have a
warehouse-33 row, and in all 26 the quantity in the text equals the current warehouse-33
stock exactly.** For example `MBEX3245WH`:

```
UK stock changes: Unit5(unit5) from  to 30000 (GH Conatiner received -2026) by mithusha on 2026-08-11
```

The inference was right. The `inventory.warehouse` row for 33 is still missing and should
still be created, but the mapping is no longer an assumption.

## Validation

`node validation/test_lampshade.js` → **ALL PASS — 997 passed, 0 failed** (988 before).

Phase 34 asserts the 5,480 / 44,330 / 1,796 counts, the 12-per-SKU cap, that every
movement has a date and action, that **2,933 negative values survive**, that Qty is
computed only where both sides are numeric, that a goods receipt carries and displays its
`SU####`, that a shelf code is not right-aligned, that both regions return the same
record, and that a SKU the source never logged shows a GAP row naming
`inventory.product_history` rather than implying it never moved.

All fourteen dataset locks verified byte-identical.

---

# Part 2 — The dialog redesigned for real data

**Reported:** the History dialog looked good while empty and bad once filled.

## Cause — measured, not guessed

With the log loaded, **40.5% of all cells are legitimately blank**, and each was rendering
as the stock table's full `Unavailable` chip:

| Column | Blank |
|---|---:|
| From Location | **100%** |
| Informed Person | **90%** |
| Qty | 62% |
| Remarks | 59% |
| Changed Person | 44% |
| Stock Before | 32% |

Nearly half the table was grey chips, and the values that *were* there had no visual
weight at all. Remarks — which run to **189 characters** — were crammed into 12% of the
width.

That the chip is right in the stock table and wrong here is the point: there,
*Unavailable* means the database has no answer. In a movement log a blank is **normal** —
a CSV upload has no informed person, a goods receipt has no before/after. Saying
"Unavailable" ten times a row states a problem that does not exist.

## Changes

- **Blank → a quiet dash**, keeping *"Not recorded for this movement."* on hover. Same
  information, none of the noise. Asserted: every dash carries the tooltip, and no cell is
  ever left visually empty.
- **Wider dialog** — `min(1360px)` → `min(1560px, 100% − 40px)`.
- **Remarks is now the widest column** at 20%, up from 12%. Widths still sum to 100%, so
  the table still cannot scroll sideways.
- **Action is a colour-coded badge** — Goods received / CSV upload / Manual correction /
  Stock change each get their own tone, so a column that is 100% populated becomes the
  fastest thing to scan.
- **Container rides beside it as a mono chip** (`SU1201`) instead of being appended to the
  action text.
- **Qty is signed and coloured** — `+50` in the positive colour, `-4` in the negative.
- **Dates and quantities in tabular monospace** so columns of figures line up.
- **Sticky header, zebra rows, hover highlight**, and the table scrolls vertically inside
  the dialog (`max-height:min(64vh,760px)`) rather than growing the dialog past the
  viewport on a 12-row history.
- **A shelf code is never styled as a number** — a location move puts `L-A-02-A` in Stock
  Before, which must not be right-aligned in a numeric column.

## Validation

`node validation/test_lampshade.js` → **ALL PASS — 1,014 passed, 0 failed** (997 before).

Phase 40 asserts a busy SKU renders its 12 rows, that blanks are dashes and every one
carries its tooltip, that no cell is visually empty, that the widths still total 100% and
Remarks is the widest, the sticky header, zebra and hover rules, all four badge colours,
a real negative movement rendering in the negative style, and that a shelf code in Stock
Before is not styled as a number.

All fourteen dataset locks verified byte-identical.

---

# Part 3 — UK and German histories split, without losing anything

**Reported:** the UK and German History buttons showed the same content; they must be
separate.

They were the same because I merged them deliberately in Part 1, and said why: the log
records Canada, USA, Netherlands and France movements too, and a strict UK/German split
would hide those entirely. That reasoning was right about the risk and wrong about the
answer — the fix is to split them *and* account for the remainder, not to refuse to split.

## Regions, derived from the location each line names

| Region | Movements | Rule |
|---|---:|---|
| UK | 58,043 | `unit1`–`unit5`, `unit18`, `Quantity`, `Location`, `Location B/C` |
| German | 13,964 | anything naming german / tros / kronen / schmutter / duisburg, or ending ` DE` |
| Canada | 3,089 | |
| USA | 1,719 | |
| Netherlands | 568 | |
| France | 177 | |

Every one of the 77,560 movements maps to a region — checked, with **zero** left
unassigned. `Mapping SKU DE` was the only case that needed a rule of its own.

## What changed

- **`STOCK_HISTORY` is now `sku → region → movements`.** The UK button opens the UK
  record, the German button the German one.
- **The cap is now 12 per SKU *per region*.** Capping across all regions would have let a
  busy UK history crowd the German one out entirely — a SKU with 12 UK movements would
  have shown an empty German dialog. Carried movements rise 44,330 → **58,542**, the
  payload 2.2 MB → 3.0 MB.
- **Each button counts its own region**, and its tooltip names it: *"7 recorded German
  stock movements for LSCY290BM"*.
- **The dialog header names the region again** — `Region: German`.
- **Nothing disappears.** Where a SKU has movements the open dialog is not showing, a
  footer names them with counts: *"This SKU also has 7 German and 3 Canada movements
  recorded."* **1,220 SKUs have movements outside UK and German**; without this they
  would have vanished the moment the views were split.
- **An empty region says which one is empty** — *"No UK stock movement is recorded for
  this SKU"* — and still points at the regions that do have some.

## Validation

`node validation/test_lampshade.js` → **ALL PASS — 1,032 passed, 0 failed** (1,014 before).

Phase 41 asserts every movement carries a region and sits only in its own bucket, the
5,439 UK / 2,558 German SKU counts, that **German movements never name a UK unit and UK
movements never name a German location**, that a SKU with both renders two different
tables under two different headers, that the 1,220 cross-region SKUs are named rather
than hidden, that a German-only SKU says so under the UK button and points to the German
one, and that a SKU with no history at all still shows the GAP row under both.

The fixture in Phase 34 now carries one UK and one German movement, so the split is
proven on known data as well as real data.

All fourteen dataset locks verified byte-identical.
