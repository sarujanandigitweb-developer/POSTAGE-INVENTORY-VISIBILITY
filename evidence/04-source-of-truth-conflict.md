# Evidence 04 — CRITICAL: Three Conflicting Stock Sources

LEDSone MCP contains **three independent stock figures** for the same Ceiling Rose SKU.
They disagree. No source is marked authoritative, and no reconciliation rule exists in the database.

| # | Source | Grain | Nature |
|---|---|---|---|
| A | `inventory.physical_product_stock.quantity` | inventory_id × warehouse **unit** | per-unit physical counts |
| B | `inventory.local_inventory_current_stock_location_wise.stock` | inventory_id × **country** | country-level rollup |
| C | `configurator.components_sot_skus` → attribute `total_stock` | SKU (single total) | Google-Sheet sync, last synced 2026-08-10 |

## Conflict A vs B (warehouse-level sum vs country rollup)

Restricted to inventory ids present in BOTH sources (no NULL inflation):

| Country | Rows compared | Exact match | **Mismatch** | Σ warehouse-level | Σ country rollup |
|---|---|---|---|---|---|
| UK | 688 | 307 | **381 (55.4%)** | 236,139 | 128,066 |
| Germany | 688 | 512 | **176 (25.6%)** | 22,662 | 26,271 |
| Canada | 345 | 333 | 12 (3.5%) | 2,604 | 2,633 |
| US | 343 | 336 | 7 (2.0%) | 4,637 | 4,657 |

The UK figure — the one the Postage & Warehouse team actually needs — differs by
**108,073 units (≈1.84×)** between the two sources.

Worked example, `CRSF100BM` (inventory_id 344):
`Unit3 2264 + Unit4 1071 + Unit18 5700 = 9035`, but `local_inventory_current_stock_location_wise` UK = **9005**. Δ = 30.
`CRFF100BM` (668): `799 + 160 + 900 = 1859` vs rollup UK = **1846**. Δ = 13.

Source B also has **no rows at all** for France and Netherlands, while source A does — so B is
not simply a rollup of A.

## Conflict A vs C (physical stock vs Google-Sheet SOT `total_stock`)

```sql
-- 332 ceilingrose SOT SKUs vs SUM(physical_product_stock.quantity)
sot_skus = 332 | total_stock empty = 0 | not in inventory.products = 0 | MISMATCH = 161
```

**161 of 332 SKUs (48.5%) disagree.** Examples:

| SKU | SOT `total_stock` | Σ physical_product_stock | Δ |
|---|---|---|---|
| CRFF100BM | 2398 | 2179 | 219 |
| CRFF100CH | 586 | 555 | 31 |
| CRFF100CO | 299 | 263 | 36 |
| CRFF100GB | 194 | 134 | 60 |
| CRFF100SN | 178 | 156 | 22 |
| CRFF10020SN | 55 | 52 | 3 |
| CRFF100RO | 373 | 373 | 0 (match) |
| CRFF100WO | -20 | -20 | 0 (match) |

## Negative stock

Negative quantities are present and are **not** errors we may silence — they are the stored values:

| Prefix | Warehouse | rows qty < 0 |
|---|---|---|
| CRSF | UK Unit3 | 28 |
| CRSF | UK Unit4 | 25 |
| CRSF | Schmutter | 26 |
| CRFF | UK Unit3 | 13 |
| CRFF | Schmutter | 21 |

Whether a negative means oversold, an un-booked receipt, or a count error is **not defined
anywhere in the source**. No stock-calculation rule (e.g. `quantity - reserved_quantity`,
or clamping at zero) exists as a database object.

## Are values current or historical?

`inventory.physical_product_stock` has **no timestamp column at all** — no `created_at`,
no `updated_at`, no effective date. It is a current-state snapshot with no as-at marker and
no way to prove freshness. `configurator.components_sot_skus.synced_at` = 2026-08-10, i.e.
**10 days stale** relative to this discovery run (2026-08-20).

---

> **SUPERSEDED (2026-08-20, second pass).** The A-vs-B discrepancy documented above was tested
> rather than arbitrated and proved **not** to be a conflict: source B reproduces as
> `GREATEST(SUM(quantity) − SUM(reserved_quantity), 0)` computed from source A for
> **1,323 of 1,327** SKU-country pairs (99.7%) — B is a derived country-level *availability*
> figure, not a competing on-hand figure. See `evidence/10-source-of-truth-decision.md`
> for the test and the resulting ruling. The negative-stock and no-timestamp findings above
> still stand.
