# Evidence 10 — Source-of-Truth Decision (Ceiling Rose Stock)

Date: 2026-08-20 · Mode: READ-ONLY · Supersedes the "unresolved conflict" position in `evidence/04`.

## The apparent conflict

Discovery 1 found three stock figures that disagreed and concluded RED. This pass tested
*why* they disagree instead of choosing between them.

| # | Source | Grain |
|---|---|---|
| A | `inventory.physical_product_stock.quantity` | inventory_id × warehouse **unit** |
| B | `inventory.local_inventory_current_stock_location_wise.stock` | inventory_id × **country** |
| C | `configurator.components_sot_skus` attr `total_stock` | SKU (single figure) |

## Test: is B a competing measure, or a derived one?

Hypothesis: B is *available-to-sell*, not *physical on-hand* — i.e. B is derived from A.

```sql
GREATEST(SUM(quantity) - SUM(reserved_quantity), 0)   -- computed from A, per country
  vs  local_inventory_current_stock_location_wise.stock
```

Result over the 332 Ceiling Rose SKUs:

| Country | SKUs | Reproduced by the formula | Rate |
|---|---|---|---|
| Germany | 332 | **332** | 100% |
| Canada | 332 | **332** | 100% |
| US | 331 | **331** | 100% |
| UK | 332 | **328** | 98.8% |
| **Total** | **1,327** | **1,323** | **99.7%** |

The four UK exceptions are tiny and all in the same direction (rollup slightly higher):

| SKU | Σqty | Σreserved | formula | rollup | Δ |
|---|---|---|---|---|---|
| CRFF140SN | 30 | 8 | 22 | 25 | 3 |
| CRSF100BM | 9027 | 28 | 8999 | 9005 | 6 |
| CRSF100WH | 136 | 3 | 133 | 135 | 2 |
| CRSF2003BM | 2663 | 4 | 2659 | 2660 | 1 |

Consistent with a short refresh lag between the two tables, not with a competing measure.

**Conclusion: B is not a conflicting source. It is a derived, country-level, availability
figure computed from A.** The "conflict" in Discovery 1 was a comparison of two different
measures at two different grains.

## Ruling

| Source | Verdict | Reason |
|---|---|---|
| **A — `inventory.physical_product_stock.quantity`** | **AUTHORITATIVE for per-warehouse stock** | Only source held at warehouse-unit grain — the grain the dashboard requires. Verified unique on (inventory, warehouse): 0 duplicates. Reproduces B to 99.7%, so it is also the upstream of the country rollup. |
| B — country rollup | Not used | Derived from A; country grain cannot answer "stock in Unit 3". |
| C — SOT `total_stock` | Not used | No warehouse grain at all, and it is a Google-Sheet snapshot (`synced_at` = 2026-08-10, ten days stale at extraction). Cannot answer a per-warehouse question regardless of accuracy. |

This is a grain-and-derivation ruling, not a preference. B and C are structurally incapable of
answering the business question; A is the only candidate, and B being derivable from A
confirms A is upstream rather than a rival.

## Reserved quantity — deliberately NOT applied

`reserved_quantity` is present and non-zero for Ceiling Rose (UK Unit 3: 101 across 31 rows;
Unit 4: 23; Schmutter: 25; US: 6; Kronen/Unit 18/Duisburg/Canada: 0). The dashboard shows
**physical on-hand** (`quantity`), not availability, because the requested column is warehouse
stock and no business rule in LEDSone MCP defines availability for this dashboard.
Nothing was netted off, clamped, or adjusted.

## Negative stock — displayed as stored

Negative quantities exist and are shown verbatim (84 SKUs have a negative in at least one
warehouse). No clamping, no absolute value, no substitution. LEDSone MCP defines no rule for
interpreting them.
