# Evidence 43 — UK Unit 5 column (warehouse 33)

**Date:** 2026-08-26 · Read-only discovery, then implemented. Not committed, not pushed.
Request: *"new warehouse add the unit 5 — check the database — add the new column in UK,
don't need the location."*

## The one thing to know before trusting this column

**There is no warehouse called "Unit 5" in LEDSone.** `inventory.warehouse` holds ten
rows, and the only names containing "Unit" are:

| id | name | region |
|---:|---|---|
| 1 | UK Unit3 | UK |
| 8 | UK Unit4 | UK |
| 6 | UK Unit18 | UK |

Warehouse **id 5** is **`Duisburg warehouse`, Germany** — an established site with 2,090
orders against it, 7,910 stock rows and its own carrier-service entries. It is *not* the
new UK unit, and reading "Unit 5" as "warehouse id 5" would have put German stock in the
UK column group.

## What the new warehouse actually is

`inventory.physical_product_stock` contains **eleven** warehouse ids. Ten are named. One
is not:

**Warehouse 33 — 2,601 stock rows, no row in `inventory.warehouse`.**

| Measure | Value |
|---|---:|
| Stock rows | 2,601 (2,601 distinct products) |
| Non-zero | 315 — **all positive**, no negatives |
| Total units | 534,520 (max single line 30,000) |
| Shelf locations | **0** |
| Bulk locations | **0** |
| Reserved quantities | 0 |

It behaves exactly like a warehouse that has just been created and stocked but not yet
wired into the rest of the system: it appears in `physical_product_stock` **and nowhere
else** — no row in `inventory.warehouse`, no `order_management.orders`, no
`order_management.carrier_service`, no `inventory.product_mapping`. Every other warehouse
appears in at least one of those.

Its contents are the team's own stock — mail bags, lever connectors, saddles:

```
MBEX3245WH  30,000  Mail bag (White) 32cm*45cm
MBEX1730BM  30,000  Mail bag 17cm*30cm
CO232AGY    10,000  2 Way Spring Lever Reusable Electric Terminal
PCD20WH     10,000  Saddle 20mm white
```

**2,319 of the dashboard's 5,661 SKUs have a row there; 265 hold stock.** It spans every
section — Lamp Spares 738 rows, Lampshade 529, Pendant Lamp Holder 229, Lighting 210 —
so it is a general warehouse, not a niche one.

## Naming is a team statement, not a database fact

Warehouse 33 is identified as the new UK unit because it is the **only** warehouse holding
stock that the dashboard did not already show, and the only unnamed one. The other three
unshown warehouses are explicitly non-UK by name: France1 (2), Netherlands1 (3), Duisburg
(5).

That is inference, not a lookup. It is stated in the file, above the data:

> NAMING IS A TEAM STATEMENT, NOT A DATABASE FACT. … If the master row is later created
> with a different name or region, change the header and the group below — the data is
> correct either way.

**Ask the database owner to create the `inventory.warehouse` row for 33.** Until then the
dashboard is asserting a name the database cannot confirm.

## What was built

- **`Unit 5` column in the UK group, stock only.** No Location column — warehouse 33 has
  zero shelf and zero bulk locations across all 2,601 rows, so there is nothing to show.
  The UK header group grows from `colspan="10"` to `colspan="11"`.
- **Placed immediately after Unit 18**, so no existing column changes position. Asserted
  in the harness against `CSV_HEADERS`.
- **Absent means zero, not unknown** — see the correction below.
- **Warehouse filter** gains `UK — Unit 5`, and the whole-dashboard stock-condition sweep
  now includes it, so a SKU whose only stock is at Unit 5 is no longer invisible to the
  "in stock" filter.
- **CSV** gains `UK Unit 5 Stock` after `UK Unit 18 Stock`. Shared width 25 → 26;
  Lampshade 27 → 28; Pendant Lamp Holder / Lamp Holder / Bulbs / Home Appliances 26 → 27.

Held as a separate `WH5_STOCK` lookup merged at load, so **all fourteen embedded datasets
stay byte-identical** and their locks survive.

## Correction — "Unavailable" was wrong for this column

First build followed the project's standing rule: no stock row → *Unavailable*, row with
quantity 0 → `0`. For this warehouse that rule is wrong, and the team said so.

**The warehouse was opened about two weeks ago.** A SKU with no row there has never been
placed in it — which is zero stock, not missing data. *Unavailable* claims the database
cannot answer, when in fact it answers clearly: none.

The rule the other columns follow is right *for them*: Unit 3 has been running for years,
so a missing row there genuinely could be a sync gap. A warehouse two weeks old cannot
have unrecorded stock.

It was also inconsistent on screen. Measured across all 5,661 rows before the change:

| Column | SKUs carrying a number |
|---|---|
| Unit 3, Unit 4, Unit 18, Kronen, Schmutter, Canada | **5,661 — never renders Unavailable** |
| **Unit 5 (before)** | **2,319 — Unavailable on 3,342 rows** |

Unit 5 was the only warehouse column showing *Unavailable* to a picker. It now carries a
number on every row like the rest.

**Consequence for the data:** only the **265 non-zero** quantities are stored and
everything else resolves to `0` at load, so the lookup shrank from 2,319 entries /
32,651 bytes to **265 entries / 4,458 bytes**. The source does distinguish *row with
quantity 0* (2,054 SKUs) from *no row at all* (3,342 SKUs); that distinction is collapsed
deliberately and is recorded in the file, so it can be reinstated by re-extracting with
the zero rows and dropping the `|| 0`.

**Consequence for the filter:** "Unit 5" alone now returns every row, exactly as "Unit 3"
already did. The useful combination is **Unit 5 + In stock**, which isolates the 265 SKUs
actually held there — asserted in the harness.

## Validation

`node validation/test_lampshade.js` → **ALL PASS — 900 passed, 0 failed** (874 before; +26).

Phase 36 asserts that only the 265 non-zero quantities are stored and none is zero, that
**every one of the 5,661 rows carries a Unit 5 number** so none renders *Unavailable*,
that 265 show stock and 5,396 show `0`, that Unit 5 now behaves like every other
warehouse column, that the UK group spans 11,
that Unit 5 has no Location column anywhere, that it sits directly after Unit 18, that Unit 5 + In stock isolates
the 265 held SKUs, and that the naming caveat is present in the file. All fourteen dataset locks verified byte-identical; Shopify price unchanged at 3,302.
