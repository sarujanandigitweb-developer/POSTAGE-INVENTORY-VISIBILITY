# Evidence 46 — Last Container: resolved by order date, not by name

**Date:** 2026-08-26 · Not committed, not pushed.
Triggered by the team's note on how to fetch container details, whose key rule is:

> `ORDER BY o.order_date DESC` is what correctly determines the "last" container — never
> sort by container name text (16/17/14), it gives wrong results.

That rule was not in the original extraction, and the column was wrong because of it.

## Schema check first

The note names schema `supplier` (singular). On the LEDSone connector it is **`suppliers`**
(plural) — `supplier` does not exist. The tables and joins are otherwise exactly as
described.

`final_container_id` exists on **both** `orders` and `order_items`. The note's prose says
`orders.final_container_id` while its SQL uses `oi.final_container_id`; the extraction
uses `oi.` — the same as the SQL, which is the one that resolves per line item.

## The defect

The original extraction picked the container with **`max(container_name)`** — a *text*
maximum. `'Container 9' > 'Container 16'` is true in text, so the ordering was wrong.

It did not put a wrong name on screen, because the name was only displayed when a SKU had
exactly one container. Instead the column **refused to answer**:

> Not available in LEDSone MCP: this SKU has 3 containers marked arrived, and no receipt
> date exists to determine which was last. Showing one would be a guess.

Measured across the whole dashboard:

| Region | SKU/region pairs | One container | **More than one — shown as a refusal** | Text max picks the wrong one |
|---|---:|---:|---:|---:|
| UK | 1,186 | 693 | **493** | 142 |
| German | 344 | 261 | **83** | 83 |
| US | 76 | 76 | 0 | 0 |

**489 of the 1,038 dashboard SKUs with an arrived container showed no container name.**
And a text sort disagrees with the order-date rule on **225 of the 576** multi-container
pairs — it would have been wrong 39% of the time had it been displayed.

## The fix

`(array_agg(cname ORDER BY order_date DESC NULLS LAST))[1]` per SKU per region, carried as
a separate `LAST_CONTAINER` lookup (1,038 SKUs, 21 interned names, 45 KB) merged at load,
so all fourteen embedded datasets stay byte-identical.

The cell now shows the container name, with a **`+n` chip** when the SKU arrived in more,
and a tooltip that states what the ordering actually means:

> Most recent of 3 arrived containers for this SKU, by order date (ordered 2026-05-12).
> LEDSone records no goods-receipt date, so this is ordered-date order.

**That caveat is deliberate.** `order_date` is when the order was *placed*. Evidence/34
established there is no goods-receipt date anywhere in LEDSone, and that is still true —
so "last container" here means *most recently ordered*, not *most recently landed*. For a
SKU ordered in two containers where the older order lands later, the two differ. The
tooltip says which one the reader is looking at rather than letting "Last Container" be
read as an arrival.

## Side effect: the Unassign placeholder is gone from the data

The container fields now come from `LAST_CONTAINER`, which excludes `UNASSIGN` at source.
The 5 rows that carried the placeholder inside the embedded arrays no longer do, so the
render-time guard from evidence/34 is now a backstop rather than the only defence. Both
are asserted — that no row carries it, and that the guard still catches one if it returns.

## Validation

`node validation/test_lampshade.js` → **ALL PASS — 1,071 passed, 0 failed** (1,055 before).

Phase 43 asserts the 1,038 SKUs and 21 interned names, that no entry is the placeholder,
that every row carries a name, a count and a date, that all multi-container rows now show
a name rather than a refusal, the `+n` chip, the order-date wording in the tooltip, the
single-container wording, that a SKU with no container still says so, that the CSV carries
the name — and, directly, that **`'Container 9' > 'Container 16'`** so the defect this
fixes is proven rather than asserted.

All fourteen dataset locks verified byte-identical.
