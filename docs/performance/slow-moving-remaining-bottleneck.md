# Slow-Moving Stock — the remaining cold-load bottleneck

**Date:** 2026-09-07 · **Type:** read-only investigation, nothing implemented
**Follows:** `postgres-loading-analysis.md`, `postgres-loading-implementation.md`,
`slow-moving-fallback-optimization.md`

Nothing was created, altered or dropped: no DDL, no index, no schema, no data, no view.
The shared-catalogue optimisation and the `lineName` / `lineImg` narrowing were not
touched. No production change was made.

---

## A. Current measured bottleneck

Cold API, nothing cached: **18,911 ms**, of which the dataset build is **18,343 ms**.

The 18 queries were timed individually against the live database, on one connection, in
the order the route issues them:

| group | time | payload | share |
|---|---|---|---|
| movement sources (`direct`, `combo`, `adhoc`) | 5,029 ms | 4,660 KB | **29.5%** |
| order-line fallbacks (already narrowed) | 3,249 ms | 803 KB | 19.1% |
| shared catalogue (`products` + `images`) | 2,705 ms | 13,853 KB | 15.9% |
| PH categories | 2,237 ms | 2,616 KB | 13.1% |
| Amazon listing source (name + image) | 1,102 ms | 5,335 KB | 6.5% |
| eBay listing source | 973 ms | 3,420 KB | 5.7% |
| Shopify listing source | 943 ms | 3,105 KB | 5.5% |
| B&Q listing source | 435 ms | 966 KB | 2.6% |
| stock + warehouses | 380 ms | 731 KB | 2.2% |
| **database total** | **17,053 ms** | **34.7 MB** | |

**Remaining application/processing time: ≈ 1,290 ms** (18,343 build − 17,053 database).

That is the headline: **93% of the cold load is the database round trip, and only 7% is
this application doing anything with the rows.** Per-query detail is in
`evidence/slow-moving-phase-timings.json`.

Individual heaviest queries: `lineName` 2,288 ms (narrowed, 5,958 rows), `direct`
2,297 ms (46,085 rows), `ph` 2,237 ms (29,908 rows), `products` 1,880 ms (44,429 rows).

---

## B. The products query and its execution plan

```sql
SELECT DISTINCT ON (upper(sku)) upper(sku) AS sku, id, title, inventory_bool AS single,
       created_at,
       NULLIF(regexp_replace(trim(COALESCE(title,'')), '\s+', ' ', 'g'), '') AS title_norm
  FROM inventory.products
 WHERE sku IS NOT NULL AND sku <> ''
 ORDER BY upper(sku), id
```

`EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)`:

```
Unique  (actual time=128.277..139.231 rows=44429.00 loops=1)
  Buffers: shared hit=8752
  ->  Sort  (actual time=128.274..132.424 rows=44429.00 loops=1)
        Sort Key: (upper((sku)::text)), id
        Sort Method: quicksort  Memory: 6685kB
        Buffers: shared hit=8752
        ->  Seq Scan on products  (actual time=0.181..96.092 rows=44429.00 loops=1)
              Filter: ((sku)::text <> ''::text)
              Rows Removed by Filter: 1
              Buffers: shared hit=8746
Planning Time: 1.100 ms
Execution Time: 141.225 ms
```

**Yes, it sorts.** `Sort Key: (upper((sku)::text)), id`, quicksort in 6,685 kB. Every page
came from cache (`shared hit`, no `read`), and the sort stayed in memory — no disk spill.

---

## C. Existing indexes (inspected only)

```
CREATE UNIQUE INDEX inventory_products_sku_unique ON inventory.products USING btree (sku)
CREATE UNIQUE INDEX products_pkey                 ON inventory.products USING btree (id)
```

The index is on `sku`, **not** on `upper(sku)`. A btree on the raw column cannot satisfy an
ordering by an expression of it, so the planner sorts.

---

## D. Candidate optimisations, ranked by safety

**1. Serve the previous build while refreshing behind it — SAFEST**
Results are byte-identical because it is the *same* build output; only *when* the reader
receives it changes. Removes the wait entirely rather than shortening it. Requires a
product decision about acceptable staleness, not a technical one. No query change.

**2. Build the dataset outside the request**
The existing snapshot mechanism (`scripts/build-snapshots.mjs`) already does this; it is
simply not currently scheduled. Same code path, same output. No query change.

**3. Functional index on `upper(sku)` — LOW BENEFIT, see E**
Would remove the sort. Quantified below; the benefit is far smaller than expected.

**4. Narrowing `direct` / `combo` to catalogue SKUs — NOT WORTH IT**
Both feed `note()`, which keeps `max(order_date)` per SKU — order-independent, so
narrowing would be semantically safe. But `direct` already returns 46,085 SKUs against a
44,429-row catalogue: the overlap is nearly total and the saving would be marginal.

**5. Narrowing `ph` — NOT RECOMMENDED WITHOUT PROOF**
29,908 rows, consumed first-wins (`if (!ph.has(r.sku))`) from a three-arm `UNION`. A
`UNION` carries no ordering guarantee, so which category a SKU already gets when it
appears in more than one arm is not pinned by anything. Narrowing would not *introduce*
that, but it would touch a query whose determinism is unproven. It needs its own
equivalence run first, on the same standard as the `lineName` work.

---

## E. Expected benefit, from the plan rather than a guess

From the plan above:

- Seq Scan completes at **96.092 ms**
- Sort produces its first row at **128.274 ms**
- Therefore the sort costs **≈ 32 ms**
- Total server execution: **141 ms**

The same query measured from the application takes **1,880 ms**.

> An index on `upper(sku)` could remove at most **32 ms of 1,880 ms — about 1.7%** of the
> observed cost, and roughly 0.2% of the 18.9 s cold load.

The gap between 141 ms server-side and 1,880 ms observed is the 7,816 KB of rows crossing
the network and being parsed. **The sort is not the bottleneck; the transfer is.**

This contradicts the intuition recorded in the earlier analysis, where the index was
listed as "the single biggest win". Measured against the plan, it is not.

---

## F. Approval required

**Yes, and it is currently impossible for this role regardless.**

```
current_user     : tech_user
rolsuper         : false
rolcreatedb      : false
rolcreaterole    : false
rolconnlimit     : 10
has_table_privilege(inventory.products, SELECT) : true
has_schema_privilege(inventory, CREATE)         : false
```

`tech_user` holds `SELECT` but **not** `CREATE` on the `inventory` schema. Creating the
index requires a DBA or schema owner.

Given section E, that request should carry the measured 1.7% figure with it, so the owner
can judge whether an index on a 44,430-row table is worth maintaining for ~32 ms.

---

## G. What must NOT be changed

Explicitly out of bounds, and untouched by this investigation:

- SQL pagination — ranking is computed over the full scored set; a `LIMIT` before scoring
  returns different rows
- `inventory_bool` filtering — would drop the 26,576 combo rows Fixed Price shows
- Dropping product columns — every one is read (`sku` 21 refs, `id` 8, `title` 2,
  `single` 2, `created_at` 1 as the ageing basis)
- Reordering the marketplace fallback sources, or changing fallback precedence
- Introducing a new source of truth
- Any production change, any DDL, any schema, index, view or data change

---

## H. Discovery conclusion

**PASS.**

The investigation is complete and the remaining bottleneck is now attributed with
evidence rather than estimated. The finding that matters:

> **93% of the cold load is database round-trip time, ~35 MB across 18 queries, and only
> ~1.3 s is application processing. No single query dominates — the four largest are
> 2.3 s, 2.3 s, 2.2 s and 1.9 s. There is no remaining query-level change that is both
> safe and materially fast.**

The index that was expected to be the large win is worth ~32 ms of a 18,911 ms load, and
the role cannot create it in any case.

The remaining levers are architectural, not query-level: serve the last build while
refreshing, or build outside the request. Both keep results byte-identical because they
reuse the same build output.

Nothing implemented. Nothing recommended for implementation without a further approved task.
