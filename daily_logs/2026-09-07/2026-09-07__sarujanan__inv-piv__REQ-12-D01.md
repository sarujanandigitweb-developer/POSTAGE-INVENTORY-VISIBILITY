---
date: 2026-09-07
developer: sarujanan
project: Postage Inventory Visibility
project_code: INV-PIV
phase: >-
  Phase-12 — the app made to serve LIVE data instead of the copies it shipped with, the cold
  load measured end to end, and the two savings that survived an equivalence proof taken
requirement_id: REQ-12
deliverable_id: D01
status: >-
  Six commits (10:09, 13:43, 15:00, 15:59, 16:54, 17:58). Four cron runs, all OK. Six
  performance documents and three evidence files produced. Two optimisations shipped, one
  implemented and reverted on measurement, one rejected on equivalence before it was written.
evidence_location: >-
  git 3062970, 06c635e, a241279, 1b0b42e, cb6c8e1, ab144f0; logs/refresh.log;
  docs/performance/postgres-loading-analysis.md, postgres-loading-implementation.md,
  slow-moving-fallback-optimization.md, slow-moving-remaining-bottleneck.md,
  disk-cache-investigation.md, lazy-page-loading-discovery.md;
  docs/performance/evidence/slow-moving-phase-timings.json, disk-cache-ttl-finding.json,
  page-load-timings.json; postage-inventory/lib/catalogue.js, lib/shopify-price.js,
  lib/classify-sku.js, lib/section-of.js, lib/export-order.js, lib/sheet.js;
  validation/fixture-box-purchase-history.csv
blos_keys_used:
  - a_listing_title_needs_site_and_wrong_sku
  - a_runtime_require_is_invisible_to_a_bundler
  - one_client_means_promise_all_serialises      (NEW — withClient hands ONE client)
  - execution_time_is_not_transfer_time          (NEW — 108 ms server, 1,843 ms observed)
  - a_ttl_is_read_from_the_process_not_the_repo  (NEW — env at module load, invisible to git)
  - a_shipped_snapshot_is_a_cache_not_a_source   (NEW — or the site never moves again)
  - sql_trim_is_not_js_trim                      (NEW — spaces only, vs all whitespace)
hardcoded_thresholds:
  - dataset TTL = 300 s, from LEDSONE_DATA_TTL, read once at module load
  - pool max = 3 local / 1 serverless; tech_user connection limit = 10
  - Slow-Moving name chain = products.title, Shopify, Amazon, B&Q, eBay, then order lines
  - price rule = five tiers (exact, one-+ combo, pack, larger combo, none), LEDSone wins each
  - Box Purchase History clip = a row is real if it has an order date or a monthly total
three_am_standard: TRUE
llm_queryable: TRUE
company_knowledge_candidate: TRUE
domain: Inventory — Postage & Warehouse — LEDSone Postgres + three Google workbooks
User: Postage & Warehouse Team
Benefit status: >-
  Achieved for correctness — the app now shows what the database says today rather than what
  it said when the build was made, and the price it shows is the price the pipeline computes.
  Partial for speed — 6.2 s and 4.5 s were removed from the cold load, but 93% of what remains
  is the database round trip and cannot be removed from inside the application.

---

## 1. SYSTEM STATE

Start: the deployed app served snapshots that were frozen at build time, and both `builtAt`
and `asOf` reported them as current — so a page showing the deploy day's figures three days
later had nothing on screen admitting it. The Inventory price came from `data/price.json`, a
file, so a price changed in the database never appeared.

End: **every dataset is live under a configurable TTL**, the price is computed from the
database by the same five-tier rule the pipeline uses, and the cold load has been measured
query by query rather than guessed at.

## 2. WHAT CHANGED TODAY

**Snapshots became a cache instead of the source.** They were preferred over everything and
never expired. They are now judged by the same TTL as every other held copy, and they keep
their own timestamp so `builtAt()` reports when the data was *read*, not when the process
happened to load it.

**The Shopify price went live.** `lib/shopify-price.js` ports the five-tier rule out of the
pipeline. Verified against the pipeline's own output on 6,183 SKUs: **PRICE 4,608 / ALT 138 /
COMMENT 6,183 — all identical, 0 differences.**

**New SKUs appear on their own.** The section's SKU list now comes from the database and each
SKU is placed by `sectionOf()` — curated entry, else a 4-character prefix the whole catalogue
uses for exactly one section, else the page's own classifier. Anything none of those can place
is counted and reported, never filed somewhere plausible.

**A shared catalogue.** `products` + `images` were being read separately by Inventory, Fixed
Price, Slow-Moving and Container Details. One copy through the existing `getOrBuild`.

**Box Purchase History moved to its own workbook.** The legacy copy stops at 20/06/2025 while
the team kept buying; the legacy section itself links out to the workbook they actually
maintain — 560 rows reaching 03/09/2026.

**Six performance documents** and three evidence files, all reproducible.

## 3. THE COLD LOAD, MEASURED

18 queries, phase by phase (`evidence/slow-moving-phase-timings.json`):

| Phase | Time | Bytes |
|---|---|---|
| movement sources (`direct`, `combo`, `adhoc`) | 5,029 ms | 4,660 KB |
| order-line fallbacks | 3,249 ms | 803 KB |
| shared catalogue | 2,705 ms | 13,853 KB |
| PH categories | 2,237 ms | 2,616 KB |
| four listing sources | 3,453 ms | 12,826 KB |
| stock + warehouses | 380 ms | 731 KB |
| **database total** | **17,053 ms** | **34.7 MB** |

Cold API 18,911 ms, build 18,343 ms — leaving **≈1,290 ms of application time**.

> **93% of the cold load is database round trip. 7% is this application doing anything with
> the rows.** No amount of JavaScript tuning reaches the other 93%.

**And execution is not transfer.** The server plans and executes `products` in **108 ms**;
the application observes **1,843 ms**. The gap is 44,429 rows crossing the wire, not query
cost. Any future "the query is slow" claim must separate the two before acting.

## 4. WHAT WAS SHIPPED, AND WHAT WAS NOT

**Shipped — the shared catalogue.** Three routes reading their own copy cost 9,351 ms; one
copy costs 3,117 ms. **Saving ≈ 6,234 ms**, and `title_norm` is built with the *same SQL
expression* as the query it replaced, because SQL `trim()` strips spaces only while JS
`trim()` strips all whitespace — a leading tab would have normalised differently.

**Shipped — narrowed order-line fallbacks.** `lineName` scanned 44,429 SKUs (18,127 rows,
46,301 returned) to name the 5,958 still unnamed after the listing sources. Narrowed to the
candidates: **4,226 ms → 2,004 ms, 6,619 KB → 744 KB, −53%.** Proved row by row across five
views — `all-stock 16,439 → 16,439`, `holding 2,460`, `zero 13,979`, `page1 25`, `page7 25`
— **order identical, rows differing 0, metadata differing none, PASS.**

**Implemented, measured, reverted — query batching.** `Promise.all` over the query function
looked obviously right. Measured **22,647 ms → 23,277 ms**. `withClient()` hands **one
client**, so concurrent queries on it serialise and the batching only adds bookkeeping. The
revert is commented in place so it is not tried again.

**Rejected before writing — an `inventory_bool` filter.** It looked 6× cheaper and would have
dropped **26,576 combo rows** from the result. Rejected on equivalence, not on performance.

**Not created — `CREATE INDEX ON inventory.products (upper(sku))`.** Expected to be the large
win; the plan shows the seq scan completing at 96 ms and the sort costing ≈32 ms of an
18,911 ms load — **~1.7%**. This corrected an earlier claim of mine that the index was the
main cost. `tech_user` cannot create it in any case.

## 5. THE DISK CACHE THAT WAS NEVER BROKEN

Reported: the cache expired after ~15 s despite a 300 s TTL, and `readDisk()` checked in
isolation said HIT while the server rebuilt every time.

`lib/dataset.js:22` reads the TTL **once at module load, from the process environment**:

```js
const TTL = Math.max(0, Number(process.env.LEDSONE_DATA_TTL ?? 300)) * 1000;
```

`/proc/<pid>/environ` on the running dev server: **`LEDSONE_DATA_TTL=20`**. Not in `.env`,
not in `package.json`, not in `next.config`, not in the investigating shell — only in the
environment of the process, set by whichever shell started it.

Same file, same instant, two environments: **TTL 300,000 ms → HIT. TTL 20,000 ms → MISS.**
The cache was correct; the measurement was taken somewhere else. The observed boundary
(hits at 2/5/10 s, rebuilds at 20/30 s) matches 20 s and contradicts 300 s.

## 6. FAILURE MODE OR EDGE CASE

**A shipped snapshot preferred forever is not a cache, it is a freeze.** The site served the
data it was built with and would never have moved on its own, with `builtAt` and `asOf` both
reporting it as current. Two mechanisms hid it and neither was lying — they were answering a
different question from the one a reader asks.

**A TTL of 1 s invalidated a comparison.** An earlier catalogue A/B measured nothing useful
because the shared dataset expired every second. A short TTL set for measurement must be
removed before measuring anything else, and the same variable then produced today's
"broken cache" report.

**`.cache/*.json` are tracked.** They change on every run, so they appear in `git status`
after any measurement and make a diff look larger than the work.

## 7. DECISIONS MADE TODAY

| Decision | Why |
|---|---|
| Snapshots expire like everything else | A source that never expires is a frozen page with a fresh-looking timestamp |
| Price computed live, not read from the file | A database price change was invisible; £47.20 shown against a database saying £7.71 |
| Batching reverted rather than kept "in case" | It was measured slower; one client cannot run two queries at once |
| The index not requested | ~1.7% of the load, and the role cannot create it |
| Box Purchase History read from its own workbook only | Showing a year-old copy beside the live one is worse than showing neither |

## 8. COMPANY KNOWLEDGE EXTRACT

1. **`withClient()` hands one client — `Promise.all` over it serialises.** Batching queries on
   a single client adds bookkeeping and no concurrency.
2. **Execution time is not transfer time.** 108 ms on the server, 1,843 ms observed. Separate
   them before optimising, or the wrong thing gets tuned.
3. **A TTL read from `process.env` at module load is invisible to the repository.** Check
   `/proc/<pid>/environ` before concluding anything about cache or freshness.
4. **A shipped snapshot must be a cache, not a source**, or the deployment serves its build
   day forever.
5. **SQL `trim()` strips spaces; JS `trim()` strips all whitespace.** Normalise on the side
   that owns the value.
6. **An optimisation that changes which rows are returned is not an optimisation.** The
   `inventory_bool` filter was 6× cheaper and dropped 26,576 rows.

## 9. LLM STANDARD CHECK

Every figure is reproducible. The phase timings come from a run that records each query's
elapsed time and byte count into `evidence/slow-moving-phase-timings.json`. The 108 ms
execution figure is `EXPLAIN (ANALYZE)`, which returns almost no rows, against the same
query timed through `withClient`. The price equivalence is a full-dataset diff of
`lib/shopify-price.js` against the pipeline's own output on 6,183 SKUs. The fallback
narrowing is a row-by-row comparison across five views. The TTL finding is
`/proc/<pid>/environ` plus the same `readDisk()` logic run under both TTLs against one file
at one instant.

## RESULT

| | Start of day | End of day |
|---|---|---|
| Datasets served live | 0 of 7 | **7 of 7, under a 300 s TTL** |
| Inventory price source | `data/price.json` (a file) | **the database, five-tier rule** |
| Price / alt / comment differing from the pipeline | unknown | **0 / 0 / 0 on 6,183 SKUs** |
| New SKUs appearing without a re-export | no | **yes, three-source placement** |
| Whole-catalogue reads per cold load | 3 | **1** |
| `lineName` fallback | 4,226 ms, 6,619 KB | **2,004 ms, 744 KB** |
| Cold load understood | guessed | **measured, 18 queries, 93% database** |
| Performance documents | 0 | **6, with 3 evidence files** |
| Box Purchase History rows | ~400, ending 20/06/2025 | **560, reaching 03/09/2026** |

Cron runs on 2026-09-07: **four, all OK**, 6,183 rows each, published to hub 218.

**Carried into 8 September:**
1. The remaining cold load is **93% database round trip** and cannot be reduced from inside
   the app. The options left are fewer queries or fewer bytes, both of which change results.
2. `data/snapshots/` is empty locally, so every dev cold open is a live build.
3. Seven cross-check findings from REQ-11 still open.
4. The `upper(sku)` index remains un-requested, with its real value now measured (~1.7%).

## BLOS GOVERNANCE NOTE

| Value | Where it lives now | Why it must be governed |
|---|---|---|
| Dataset TTL | `LEDSONE_DATA_TTL`, read once at module load | Invisible to the repository; a stale value reads as a broken cache |
| Five-tier price rule | `postage-inventory/lib/shopify-price.js` | A second copy of the pipeline's rule; the two must be diffed, not trusted |
| Shared catalogue | `postage-inventory/lib/catalogue.js` | Four routes depend on it; a change there changes four tabs |
| Section placement | `lib/section-of.js` + `data/classifier.json` | Decides which tab a new SKU appears on, with no query to check it |
| Box Purchase History source | `lib/sheet.js` `BOOKS.purchases` | The legacy copy still exists and is a year stale |
