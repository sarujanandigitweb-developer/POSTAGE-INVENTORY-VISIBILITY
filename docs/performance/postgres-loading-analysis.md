# PostgreSQL loading analysis — Postage Inventory Visibility

**Date:** 2026-09-07 · **Scope:** read-only inspection · **Author:** engineering

Nothing in this analysis changed the database or the application. Every figure below
came from timing the routes' own SQL, `EXPLAIN (ANALYZE, BUFFERS)`, and the read-only
catalogue views `pg_indexes`, `pg_stat_user_tables` and `pg_roles`.

---

## Problem

Pages take roughly 6–17 seconds on a cold load. Slow-Moving Stock is the worst; the
browser sits on a skeleton while one API call assembles its whole dataset.

---

## What the measurements actually show

The first assumption — "a query is slow" — is **wrong**, and it matters, because it
points at the wrong fix.

| Same query, three shapes | time | rows returned | payload |
|---|---|---|---|
| `EXPLAIN ANALYZE` (server does all the work, returns 14 plan lines) | 276 ms | 14 | 0 MB |
| `count(*)` over the same subquery (all the work, one row back) | 223 ms | 1 | 0 MB |
| the real query, all columns | 1,619 ms | 44,429 | **5.77 MB** |
| the same rows without `title` | 1,062 ms | 44,429 | 4.11 MB |

The server finishes the work in about a quarter of a second. The rest is **moving rows
across the network and parsing them in Node**. The database is remote, so bytes on the
wire dominate — not planning, not scanning, not sorting.

`EXPLAIN (ANALYZE, BUFFERS)` on the single heaviest query confirms it:

```
Unique  (actual time=93.467..106.587 rows=44429 loops=1)
  Buffers: shared hit=8752                     <- every page from cache, no disk read
  ->  Sort  (actual time=93.463..99.265 rows=44429)
        Sort Key: (upper(sku)), id
        Sort Method: quicksort  Memory: 5288kB <- in memory, no spill to disk
        ->  Seq Scan on products (actual time=0.069..58.347 rows=44429)
Execution Time: 108.740 ms
```

108 ms server-side. The route measures the same query at 1.6 s calm and **17.4 s under
load** — the variance is transfer and contention, not the plan.

---

## Affected pages and where their time goes

Measured by running each route's own SQL, in order, on one connection.

| Page / API | DB time | Queries | Slowest query | Its rows |
|---|---|---|---|---|
| **Slow-Moving Stock** | **55.7 s** | 18 | `products` 17.4 s (31%) | 44,429 |
| SKU Fixed Price | 5.1 s | 7 | `products` 1.7 s | 44,429 |
| Inventory | 2.7 s | 8 | `HISTORY` 0.87 s | 225 |
| Container Details | 1.7 s | 2 | `NAMES` 1.5 s | 44,429 |
| Pending Dispatch | 0.8 s | 3 | `ORDERS` 0.40 s | 204 |

Slow-Moving's four heaviest queries are 64% of its time:

| query | time | rows |
|---|---|---|
| `products` | 17,373 ms | 44,429 |
| `lineName` | 7,659 ms | 46,299 |
| `amzName` | 6,307 ms | 20,030 |
| `images` | 4,196 ms | 36,550 |

---

## Root causes, in order of size

### 1. The same 44,429-row table is fetched independently by four routes

`inventory.products` is read in full by **Slow-Moving, SKU Fixed Price, Container
Details** (as `NAMES`) and, parameterised, by Inventory. Each is 5.77 MB. A reader who
opens three tabs moves ~17 MB of identical rows.

### 2. Every query runs sequentially on one connection

`withClient` holds a single client and each `await q(...)` waits for the last. Slow-Moving
issues **18** of them in a row. The pool allows 3 locally and **1 on Vercel**, so on the
deployed app the queries cannot overlap at all.

### 3. Table sizes are large and the database is remote

| table | live rows | total size |
|---|---|---|
| `order_management.order_item_info` | 1,198,304 | 863 MB |
| `order_management.orders` | 1,101,538 | 498 MB |
| `listings.ebay_listings` | 308,174 | 1,558 MB |
| `inventory.products` | 44,430 | 77 MB |

`lineName` and `lineImg` each scan `order_item_info` (1.2 M rows) to supply *fallback*
names and images — used only for SKUs the catalogue cannot name.

---

## Existing indexes

`inventory.products` — `btree (sku)`, `btree (id)`
`inventory.physical_product_stock` — `btree (inventory)`, `btree (warehouse)`, `btree (inventory, warehouse)`
`order_management.orders` — `status`, `status, merge`, `order_date`, `order_id`, `warehouse_id`, `market_place`, `sub_source_id`, `merge`, `id`
`order_management.order_item_info` — `order_id`, `item_sku`, `real_sku`, `product_id`, `item_id`, `item_asin`, and seven more
`listings.*_listings` — `sku`, `site`, `status`, `sub_source`, `item_id`

There is **no functional index on `upper(sku)`**, so `ORDER BY upper(sku)` sorts. That sort
is 93 ms of a 108 ms plan — real, but not the bottleneck.

---

## Pagination: where it happens

| Page | Paginated | Before or after the expensive work |
|---|---|---|
| SKU Fixed Price | server-side | **after** — the full set is built, then sliced |
| Slow-Moving | server-side | **after** — same |
| Inventory | client-side | after — one category (384–1,487 rows) is sent whole |
| Pending Dispatch | client-side | after |
| Container Details | client-side | after |

**Moving pagination into the database is not possible without changing results.**
Slow-Moving ranks by days-without-movement, computed in JavaScript from three movement
sources; page 1 is "the 25 most critical", which cannot be known until every row is
scored. A `LIMIT` before scoring would return a different 25 rows. Same for Fixed Price,
whose lowest/highest tinting compares across all channels for a SKU.

---

## Optimisation candidates

### A. Share the whole-catalogue reads across routes — RECOMMENDED

**Change:** fetch `inventory.products` (and `product_images`) once into a cached dataset
that Slow-Moving, Fixed Price and Container Details all read, instead of each issuing its
own copy.

**Expected benefit:** removes two of the three 5.77 MB transfers per cold tour. On the
measured figures that is ~3.3 s off Fixed Price and ~1.5 s off Container Details, and the
same rows arrive.

**Data risk:** none. Identical SQL, identical rows; only the number of times it is issued
changes.

**Validation:** run both routes before and after, diff the full JSON response.

---

### B. Issue independent queries concurrently — RECOMMENDED, with a caveat

**Change:** Slow-Moving's 18 queries are mostly independent. Running them in small
concurrent batches instead of strictly one after another.

**Expected benefit:** wall time falls toward the slowest single query rather than the sum.
On the measured 55.7 s serial total, batches of three would put it near 20 s.

**Data risk:** none to the data. **But `tech_user` has `rolconnlimit = 10`**, shared with
pgAdmin and the 2-hourly refresh, and on Vercel every concurrent request is its own
instance with its own pool. Any increase in pool size multiplies by live instances. This
must be capped conservatively (2–3) and measured against the limit.

---

### C. A functional index on `upper(sku)` — RECOMMENDED, needs a DBA

**Change:** `CREATE INDEX ON inventory.products (upper(sku))`.

**Expected benefit:** removes the 93 ms sort from every `DISTINCT ON (upper(sku))` query
across four routes.

**Data risk:** none to results. **Out of scope here** — it is DDL, and `tech_user` is
read-only. It must go through whoever owns the schema.

---

### D. Narrow `lineName` / `lineImg` to the SKUs that need them — CANDIDATE

**Change:** both scan `order_item_info` (1.2 M rows) to supply fallback names and images.
They are consulted only for SKUs no earlier source could name. Passing that shorter SKU
list as a parameter would cut the scan.

**Expected benefit:** up to 11.6 s of Slow-Moving's 55.7 s.

**Data risk:** low but **not zero** — the fallback order is load-bearing and was the cause
of a defect fixed on 4 September. Would need a row-by-row diff of the resulting names and
images before adoption.

---

### E. Filter `products` to `inventory_bool` — **REJECTED**

This looked like the obvious win: 44,429 rows fetched, 6,510 of them `inventory_bool`.
`EXPLAIN` confirms it would be six times cheaper (19 ms vs 108 ms, 1.04 MB vs 5.77 MB).

**It is not equivalent, and must not be done.**

```
  fixed-price rows shown  : 31,400   single 4,824   combo 26,576
  catalogue inventory_bool: 6,510
```

The 26,576 combo rows have `inventory_bool = false`. Filtering them out would delete
five-sixths of the Fixed Price table and a large part of Slow-Moving. The column is also
read as `single` to decide which titles may be trusted, so the flag must survive on the row.

**PASS/FAIL: FAIL — rejected on equivalence grounds.**

### F. Drop unused columns from `products` — **REJECTED**

Every column is read: `sku` (21 references), `id` (8), `title` (2, for the trusted-title
rule), `single` (2), `created_at` (1 — it is the ageing basis for a SKU that has never
moved). Nothing can be removed without changing output.

**PASS/FAIL: FAIL — no unused columns exist.**

### G. Move pagination into SQL — **REJECTED**

See *Pagination* above. Ranking happens after the full set is scored; a database `LIMIT`
would return different rows.

**PASS/FAIL: FAIL — would change results.**

---

## Validation method for anything adopted

1. Capture the full JSON response of the affected route before the change.
2. Apply the change.
3. Capture again with identical parameters.
4. Diff: row count, row order, and every field of every row.
5. Adopt only on an exact match.

This is the method that caught defect E above, and the same method proved the Slow-Moving
name/image repair on 4 September (7,170 name differences and 3,085 image differences
reduced to zero).

---

## Summary

| | |
|---|---|
| **Slowest API** | Slow-Moving Stock — 55.7 s of database time across 18 queries |
| **Slowest single query** | `products` — 17.4 s under load, 44,429 rows, 5.77 MB |
| **Main bottleneck** | Row transfer, not query execution. The server plans and executes in ~108 ms; the time is 5.77 MB crossing the network, repeated by four routes, issued strictly one query at a time |
| **Safest change** | A — share the whole-catalogue reads across routes. Identical SQL, identical rows, fewer transfers |
| **Not recommended** | E (`inventory_bool` filter — drops 26,576 rows), F (column trimming — none are unused), G (SQL pagination — changes which rows are returned) |
| **Needs a DBA** | C — a functional index on `upper(sku)`; `tech_user` is read-only |
| **Result** | **PASS** — analysis complete, no database or application change made |
