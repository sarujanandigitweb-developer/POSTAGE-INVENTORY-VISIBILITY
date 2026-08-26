# Evidence 35 — Incoming stock section

**Date:** 2026-08-25 · `dashboard/inventory-dashboard.html`, `validation/test_lampshade.js`.
Not committed, not pushed.

## Problem

The dashboard showed only containers that had **arrived**. Stock that was already
paid for, produced, or on a ship was invisible. A picker seeing `0` or `−1` had no
way to know 100 pieces were three weeks away, so the team re-ordered stock that was
already coming and told customers "unavailable" for items landing next month.

## Source

```
suppliers.order_items  ->  suppliers.orders            (status flags)
                       ->  suppliers.final_containers  (name, region)
                       ->  suppliers.containers        (older assignments)
WHERE NOT orders.status_arrived
  AND container name IS NOT NULL
  AND upper(trim(name)) <> 'UNASSIGN'          -- placeholder, not a container
```

Stage is derived from the order's own status flags — nothing is inferred:

| Flag on `suppliers.orders` | Stage shown |
|---|---|
| `status_shipped` | **Shipped** |
| `status_finished_production` | **Production done** |
| `status_confirmed` | **Confirmed** |
| none of the above | **Ordered** |

Where a SKU appears on several open orders, the most recent `order_date` wins
(`DISTINCT ON … ORDER BY order_date DESC`).

## Result

488 SKUs have incoming stock; **414 of them are in the dashboard**:

| Section | Rows with incoming |
|---|---:|
| Lampshade | 188 |
| Pendant Lamp Holder | 76 |
| Ceiling Rose | 62 |
| Wall Arm | 36 |
| Lamp Holder | 31 |
| LED Bulbs | 21 |
| **Total** | **414 of 1,805** |

14 containers, 4 stages.

## Worked example

`LSCO335WH` — UK Unit 3 stock **−1**. Previously read as "we have none".
Now shows **UK Container 9th 2026 · Production done**.

## Design decisions

- **Arrived and incoming are never mixed.** The existing `Last Container` columns
  still show only `status_arrived` containers. Incoming is a separate, visually
  distinct column group. 82 SKUs carry both, and they stay in separate columns.
- **Stored as a separate lookup**, not merged into the six datasets, so all six
  remain **byte-identical** and their SHA-256 locks still pass. `INC_CONTAINER`
  and `INC_STAGE` are index arrays; `INCOMING` maps SKU → `"containerIdx,stageIdx"`.
- **Rows with nothing incoming show *Unavailable* with a reason**, never a blank.
- **No arrival date is shown** — none exists in the database (evidence/34 §3.1).
  Stage answers "how far along is it", which is what the database can actually say.

## UI / CSV

New column group **Incoming** (Container · Stage) after *Other markets*. Stage is a
colour-coded pill: Shipped green, Production done blue, Confirmed amber, Ordered
violet — all theme-aware.

CSV gains **two columns at the end**: `Incoming Container`, `Incoming Stage`.
Base width 23 → 25. Per-category extras (Shade shape, Fitting type, Mount Type)
still append after them, so the existing column order is unchanged.

Search now matches container name and stage.

## Verification — 461 assertions, 0 failures

All six datasets **LOCK INTACT**. Counts per section verified, every row with a
container has a valid stage, no row names the `Unassign` placeholder, and the
`LSCO335WH` example is asserted end to end.
