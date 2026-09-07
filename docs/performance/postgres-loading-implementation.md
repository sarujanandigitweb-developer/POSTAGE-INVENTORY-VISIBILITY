# PostgreSQL loading — implementation

**Date:** 2026-09-07 · **Scope:** `postage-inventory/` only · **Follows:** `postgres-loading-analysis.md`

No database data, schema, index, table, view or materialized view was created or changed.
No business rule, ranking, sort, fallback chain or pagination behaviour was changed. No UI
or content was changed.

---

## What was changed

### 1. The whole-catalogue reads are fetched once and shared — KEPT

**New file:** `postage-inventory/lib/catalogue.js`

`inventory.products` (44,429 rows) and `inventory.product_images` (36,550 rows) were each
read in full, independently, by three routes:

| route | its query | rows |
|---|---|---|
| Slow-Moving Stock | `products` + `images` | 44,429 + 36,550 |
| SKU Fixed Price | `products` + `images` | 44,429 + 36,550 |
| Container Details | `NAMES` (same table, normalised title) | 44,429 |

All three share the same `FROM inventory.products WHERE sku IS NOT NULL AND sku <> ''
ORDER BY upper(sku), id`. Only their select lists differed.

They now read one shared result. The shared SQL is the **union of the three select lists**;
`FROM`, `WHERE` and `ORDER BY` are byte-identical to all three originals.

**Not a new source of truth.** It uses the existing `getOrBuild()` cache in
`lib/dataset.js`, with the same key/TTL policy as every other dataset, and takes the
caller's query function so no extra connection is opened — `tech_user` allows ten.

Container Details' normalised title is carried as `title_norm`, using the **same SQL
expression** rather than being re-derived in JavaScript: SQL `trim()` strips spaces only
while JS `trim()` strips all whitespace, so a title with a leading tab would normalise
differently. Keeping the expression in the database removes the question entirely.

### 2. Batching Slow-Moving's queries — TRIED, MEASURED, REVERTED

Implemented as fetch-in-batches-of-three with the **apply order untouched** (the name and
image chains are first-source-wins and reordering them would change which name a SKU gets).

**It does nothing.** `withClient()` hands one **client**, not the pool, and node-postgres
queues queries on a client — so `Promise.all` over `q` serialises exactly as the awaits
already did.

| | Slow-Moving, cold |
|---|---|
| before batching | 22,647 ms |
| with batching | 23,277 ms |

Real overlap would need separate connections, which raises the per-instance ceiling
against a role limited to ten and pinned to one on serverless — outside the brief's
"do not increase database concurrency aggressively". **Reverted**, with the measurement
recorded as a comment in the route so nobody repeats the experiment.

---

## Why

From the analysis: the server plans and executes the `products` query in **108 ms**
(`Buffers: shared hit=8752`, quicksort in 5,288 kB — no disk read, no spill). The cost is
5.77 MB of rows crossing the network to a remote database, and it was being paid three
times for identical data.

---

## Before / after timing

Measured against the live database, same connection, three consecutive runs each:

```
  products (44,429 rows)       1843ms  920ms  858ms     avg 1207ms
  images   (36,550 rows)       2157ms 1848ms 1724ms     avg 1910ms

  one copy of the shared reads        : 3,117 ms
  BEFORE — three routes, three copies : 9,351 ms
  AFTER  — three routes, one copy     : 3,117 ms
  removed from a cold tour            : 6,234 ms
```

**~6.2 seconds removed from a cold tour of the three pages**, and roughly 8 MB of
duplicate transfer.

Per-route cold builds also observed directly (`[dataset] built …`):

| route | before | after | note |
|---|---|---|---|
| Container Details | 3,701 ms | 30 ms* | *the catalogue was already warm from the first route |
| SKU Fixed Price | 5,576 ms | 43 ms* | as above |
| Slow-Moving | 22,027 ms | 23,588 ms | unchanged; it is the route that builds the catalogue |

Whichever page is opened first pays for the catalogue once; the other two then read it
from the existing cache.

---

## Data equivalence

### At the source — every row of all three original queries

```
  slow-moving products vs shared                  44,429 rows  IDENTICAL
  fixed-price products vs shared                  44,429 rows  IDENTICAL
  container NAMES.title vs shared.title_norm      44,429 rows  IDENTICAL
  images (self-check, same query twice)           36,550 rows  IDENTICAL
```

Every field compared, row by row, in order.

### At the API — full responses, same parameters

```
  slow-moving        rows 25 -> 25   order identical   rows differing 0   metadata 13 keys, none differ
  fixed-price        rows 25 -> 25   order identical   rows differing 0   metadata 13 keys, none differ
  container-details  rows 36 -> 36   order identical   rows differing 0   metadata  7 keys, none differ
```

Metadata compared includes `total`, `page`, `pages`, `size`, `filtered`, `single`, `combo`,
`holding`, `never`, `units`, `bands`, `counts`, `regions`, `stages`, `pieces`, `cbm`,
`categories`, `catCounts`. `builtAt` and `asOf` are excluded — they are timestamps and
move by design.

**Pagination behaviour is unchanged.** Ranking still happens over the full scored set and
the slice is taken afterwards, exactly as before.

---

## Evidence

- `docs/performance/postgres-loading-analysis.md` — the read-only analysis this follows
- `postage-inventory/lib/catalogue.js` — the shared reads, with the reasoning in comments
- `postage-inventory/app/api/slow-moving/route.js` — the reverted-batching note
- Equivalence harness output, reproduced above

---

## Remaining bottleneck

**Slow-Moving Stock is still ~23 s cold**, and the shared catalogue does not change that:
it is the route that builds the catalogue, so it pays the 3.1 s that the other two now
avoid. Its remaining cost is its own queries — `lineName` (7.7 s, 46,299 rows) and
`lineImg` (4.0 s, 43,987 rows), which each scan `order_management.order_item_info`
(1,198,304 rows / 863 MB) to supply fallback names and images.

Narrowing those two to the SKUs that actually need a fallback is candidate **D** in the
analysis. It was **not** implemented here: the fallback order is load-bearing and was the
cause of a defect repaired on 4 September, so it needs its own row-by-row equivalence run
rather than being folded into this change.

The other open item is candidate **C** — a functional index on `upper(sku)` — which is DDL
and outside a read-only role.

---

## PASS / FAIL

**PASS.**

- Catalogue sharing: implemented, 44,429 rows proven identical at source and 25/25 and
  36/36 rows identical at the API, with all pagination metadata unchanged. ~6.2 s removed
  from a cold three-page tour.
- Query batching: implemented, measured as a non-improvement, and **reverted** per
  instruction 10.
- No database data, schema or object changed. No business rule, ranking, fallback or
  pagination changed. No UI change.
