# Evidence 03 — Warehouse / Location Mapping

## `inventory.warehouse` (complete contents)

| warehouse | warehouse_name | warehouse_location | Dashboard column |
|---|---|---|---|
| 1 | UK Unit3 | UK | UK → Unit 3 |
| 8 | UK Unit4 | UK | UK → Unit 4 |
| 6 | UK Unit18 | UK | UK → Unit 18 |
| 10 | Trossingen kronen str | Germany | GERMAN → Kronen |
| 7 | Trossingen schmutter str | Germany | GERMAN → Schmutter |
| 4 | Canada1 | Canada | CA |
| 32 | US1 | US | US |
| 5 | Duisburg warehouse | Germany | *(not on dashboard)* |
| 2 | France1 | France | *(not on dashboard)* |
| 3 | Netherlands1 | Netherlands | *(not on dashboard)* |

Every dashboard warehouse column maps to exactly one `warehouse` id. This mapping is
unambiguous and is the one genuinely solid part of the discovery.

## AMBIGUITY — orphan warehouse id 33

```sql
SELECT string_agg(DISTINCT s.warehouse::text, ',')
FROM inventory.physical_product_stock s
LEFT JOIN inventory.warehouse w ON w.warehouse = s.warehouse
WHERE w.warehouse IS NULL;   -- => '33'

SELECT count(*) FROM inventory.physical_product_stock WHERE warehouse = 33;  -- => 2225
```

**2,225 stock rows reference `warehouse = 33`, which does not exist in `inventory.warehouse`.**
Of those, 162 belong to CR-prefixed SKUs (63 CRFF, 99 CRSF). All carry quantity 0 and NULL
locations today, but the warehouse has no name, no country, and no definition anywhere in the
database. Its business meaning is unknown and cannot be inferred from the source.

## Location fields

`inventory.physical_product_stock` has two location columns:

- `product_bulk_location` — **100% NULL for every CRSF/CRFF row** (4,274 CRSF + 1,400 CRFF rows). Unusable.
- `product_shelf_location` — the only usable location field. Sample values match the dashboard
  format exactly: `L-A-05-B`, `1-I-06-B`, `2-B-02`, `3-E-01`, `R1-S05-E`, `R2-S15-B`.

Sentinel value: `'-'` is used in `product_shelf_location` (e.g. every UK Unit4 row for
`CRFF10020*`) and is not a real location. It is neither NULL nor a shelf code.

### Location coverage for the 332 SOT ceilingrose SKUs

| Warehouse | CRSF loc present / 219 | CRFF loc present / 113 |
|---|---|---|
| Unit 3 (1) | 196 (89.5%) | 111 (98.2%) |
| Unit 4 (8) | 191 (87.2%) | 113 (100%) |
| **Unit 18 (6)** | **0 (0%)** | **0 (0%)** |
| **Kronen (10)** | **0 (0%)** | **0 (0%)** |
| Schmutter (7) | 143 (65.3%) | 38 (33.6%) |

Unit 18 and Kronen locations are **entirely absent** from the source for Ceiling Rose.
