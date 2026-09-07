# Slow-Moving Stock — narrowing the order-line fallbacks

**Date:** 2026-09-07 · **Scope:** `postage-inventory/app/api/slow-moving/route.js`
**Follows:** `postgres-loading-analysis.md`, `postgres-loading-implementation.md`

No database data, schema, index, table, view or materialized view was created or changed.
No business rule, fallback precedence, ranking, sort, pagination or UI was changed. The
shared-catalogue optimisation was not modified.

---

## Bottleneck

Two queries at the end of Slow-Moving's name and image chains each scan
`order_management.order_item_info` — **1,198,304 rows / 863 MB** — in full:

| query | time | rows returned | payload |
|---|---|---|---|
| `lineName` | 4,226 ms | 46,301 | 6,619 KB |
| `lineImg` | 3,831 ms | 43,989 | 4,403 KB |

---

## When each fallback is actually used

Both are the **last** link in their chain. Each earlier source fills only the gaps the
previous ones left, so by the time the line query runs the remaining gap is known exactly.

**Name chain** — `products.title` (unless the combo placeholder), then Shopify, Amazon,
B&Q, eBay, then the order line:

```
  after products.title      named  6,851
  after shopName            named 20,440
  after amzName             named 29,576
  after bqName              named 29,923
  after ebayName            named 32,902
  -> still needing lineName       18,127  of 44,429 catalogue SKUs
```

**Image chain** — `product_images`, then Shopify, Amazon, B&Q, eBay, then the order line:

```
  after product_images     imaged 36,541
  after shopImg            imaged 38,510
  after amzImg             imaged 39,404
  after bqImg              imaged 39,435
  after ebayImg            imaged 41,462
  -> still needing lineImg         2,967  of 44,429
```

`lineImg` was fetching **43,989 rows to serve 2,967 possible gaps**.

---

## Change

Both queries take the gap as a parameter:

```sql
AND upper(COALESCE(NULLIF(real_sku,''),item_sku)) = ANY($1)
```

`DISTINCT ON` and `ORDER BY 1, id DESC` are untouched, and the filter is on the **same
expression the `DISTINCT ON` groups by** — so for every SKU asked for, the row that wins
is the row that won before.

The chains were restructured only so the gap is computed before the last step:

```js
for (const key of ['shopName','amzName','bqName','ebayName']) fillName(await q(SQL[key]));
const needName = [...bySku.keys()].filter(k => !name.has(k));
if (needName.length) fillName(await q(SQL.lineName, [needName]));
```

`fillName` / `fillImg` are the **same loop bodies** as before, extracted so they can be
called twice. Every guard is intact, including `bySku.has(r.s)` and `namesAnother()`.

**Precedence is unchanged.** The order line still runs last and still only fills gaps.
Every row this drops was one the loop would have discarded on `!name.has(r.s)` /
`img.has(r.s)` anyway.

---

## Affected SKU count

| | needs the fallback | of catalogue | rows fetched before | after |
|---|---|---|---|---|
| `lineName` | 18,127 | 44,429 (41%) | 46,301 | 5,958 |
| `lineImg` | 2,967 | 44,429 (6.7%) | 43,989 | 557 |

---

## Before / after timing

**At the query, three runs each:**

```
  lineName WIDE (today)        4,226ms   46,301 rows   6,619 KB
  lineName NARROW (candidate)  2,004ms    5,958 rows     744 KB     -53%
  lineImg  WIDE (today)        3,831ms   43,989 rows   4,403 KB
  lineImg  NARROW (candidate)  1,191ms      557 rows      59 KB     -69%
```

**At the API, cold build, identical URLs:**

| | before | after |
|---|---|---|
| `size=all&stock=a` | 24,566 ms | **20,138 ms** |
| dataset build (`[dataset] built slow-moving`) | 24,088 ms | **19,551 ms** |
| `size=all&stock=h` | 45 ms | 39 ms |
| `size=all&stock=z` | 91 ms | 92 ms |

**≈ 4.5 seconds off a cold Slow-Moving load**, and about 10 MB less transferred.

---

## Exact equivalence

### At the source, before implementing

The narrowed query was compared against the unnarrowed one, row by row:

```
  lineName equivalence   values differing 0   needed-but-absent 0
  lineImg  equivalence   values differing 0   needed-but-absent 0
```

### At the API, the complete dataset — not a page

Every filter state that changes the row set, plus two pages for pagination metadata:

```
  all-stock    rows 16439 -> 16439  SAME | order identical | rows differing 0 | metadata differing none   PASS
  holding      rows  2460 ->  2460  SAME | order identical | rows differing 0 | metadata differing none   PASS
  zero         rows 13979 -> 13979  SAME | order identical | rows differing 0 | metadata differing none   PASS
  page1        rows    25 ->    25  SAME | order identical | rows differing 0 | metadata differing none   PASS
  page7        rows    25 ->    25  SAME | order identical | rows differing 0 | metadata differing none   PASS
```

`page7` is `size=25&page=7&stock=h&pri=3` — a deep page under two filters, to exercise
pagination metadata rather than only the first slice.

### The two fields the change could possibly touch

```
  product name differing : 0 of 16,439
  image differing        : 0 of 16,439
  named  old 15,917   new 15,917
  imaged old 16,301   new 16,301
```

Metadata compared and identical: `total`, `page`, `pages`, `size`, `filtered`, `holding`,
`never`, `units`, `bands`, `categories`, `catCounts`, `phPeople`. `builtAt` and `asOf`
excluded — timestamps, they move by design.

---

## Evidence

- `docs/performance/postgres-loading-analysis.md` — the original read-only analysis
- `postage-inventory/app/api/slow-moving/route.js` — the change, with the counts in comments
- Baseline captures: complete JSON for three filter states and two pages, before and after
- Source-level equivalence harness, output reproduced above

---

## Remaining bottleneck

Slow-Moving is still **~20 s cold**. What remains:

- it is the route that builds the shared catalogue (~3.1 s), which the other two pages now avoid
- the four listing name/image sources still return 17k–26k rows each
- `products` remains 44,429 rows, and `ORDER BY upper(sku)` still sorts because there is
  no functional index on `upper(sku)` — candidate **C** in the analysis, which is DDL and
  outside a read-only role

The same narrowing cannot be applied to the four listing sources: they run *before* the
gap is known, and reordering them would change which name a SKU gets.

---

## PASS / FAIL

**PASS.** Exact equivalence proven across the complete dataset — 16,439 rows, three filter
states, two pages, every field, every metadata key, and both affected fields specifically.
Loading time improved by ~4.5 s. Optimisation kept.
