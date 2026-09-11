---
name: postage-inventory
description: Working on the LEDSone Postage Inventory Visibility project — the published HTML dashboard and the Next.js app. Load before changing anything that touches inventory rows, dispatch, containers, postage sheets, prices, filters, search, pagination, caching, or the LEDSone database. Carries the equivalence rules, the environment's real numbers, and the traps that have already cost days.
---

# Postage Inventory Visibility

## The one rule

**Prove the output did not change.** Every row on both deliverables is derived through rules
that took weeks to establish and are not re-derivable from the code alone. A change that
"looks equivalent" is not equivalent until it has been measured against the previous
output, field by field.

The bar that has been met before, and is the bar:

- 64,535 field comparisons across four sections, **0 differences**
- 24 filter/sort/search combinations, **identical rows in identical order**
- PRICE 4,608 / ALT 138 / COMMENT 6,183 against the pipeline, **0 differences**

If a change cannot be proven this way, say so before writing it, not after.

## Two deliverables, and most changes need both

| | |
|---|---|
| `dashboard/inventory-dashboard.html` | ~13 MB single file, all data embedded, rebuilt by a 2-hourly cron (`sql/refresh/refresh.sh`) and published to the Varman AIOS hub. Tab data is `const` in the file; only Postage is fetched live. |
| `postage-inventory/` | Next.js app. Reads the database through `app/api/*/route.js`. Port 3020. |
| `postage-inventory-v2/` | A copy carrying server-side pagination work. Port 3021. The original must stay untouched. |

When the user reports a behaviour, **check both** before concluding. They have diverged
before: the dashboard searched main-category and family (`mc`/`sc`) while the app did not,
so "lampshade" returned 1,036 in one and 417 in the other.

Never run `sql/refresh/refresh.sh` without being asked — it **publishes to the hub**.

## The environment's real numbers

Verified, not assumed. Re-measure rather than trusting these if something looks wrong.

- **The database is remote.** `169.58.91.229`, ~**168 ms** round trip. This dominates
  everything. Eight sequential queries cost 1.3 s before a single row moves.
- **It degrades intermittently.** The same `products` query has been measured at
  **1,770 ms** and, hours later, **23,948 ms** — while server-side execution stayed at
  150 ms. Before blaming code for slowness, measure the link:
  `SELECT 1` latency, then a known query, and compare to the baseline.
- **`tech_user`: connection limit 10, and `has_schema_privilege('inventory','CREATE')` is
  false.** No tables, no views, no indexes can be created. Shared with pgAdmin and the
  2-hourly cron.
- **Pool `max: 3`** locally (`1` on Vercel), `connectionTimeoutMillis: 15000`. A fourth
  concurrent build queues then throws.
- `withClient()` hands **one client**. `Promise.all` over it **serialises** — batching was
  implemented, measured at 22,647 ms → 23,277 ms, and reverted.

## Caching, and how it lies to you

`lib/dataset.js` — `getOrBuild(key, build)` resolves: memory → in-flight → shipped
snapshot → disk `.cache/` → build. All four gated by one TTL.

```js
const TTL = Math.max(0, Number(process.env.LEDSONE_DATA_TTL ?? 300)) * 1000;
```

Read **once at module load, from the process environment** — not from `.env`, and not
changeable in a running server.

> **Trap that cost a full investigation.** The cache appeared broken: a disk file well
> inside the TTL, yet every request rebuilt. `readDisk()` checked in isolation said HIT.
> The dev server had been started with `LEDSONE_DATA_TTL=20` in its shell. Nothing in the
> repository showed it.
>
> **Always check `tr '\0' '\n' < /proc/<pid>/environ`** before concluding anything about
> TTL, freshness or cache behaviour.

`data/snapshots/` is built by `prebuild` (`scripts/build-snapshots.mjs`, ~66 s for 17
snapshots) and shipped with a deployment. Empty locally unless `npm run snapshots` is run —
which is why a cold local search can trigger twelve section builds while Vercel is instant.

## Traps already paid for

**`'\s+'` inside a JS template literal is `'s+'`.** It silently became a regex matching
runs of the letter *s*, so "lampshade" → "lamp hade" and search stopped matching. Write
`'\\s+'`. One line above in the same file had it right.

**`.next` holds one build.** Running `npm run build` while `next dev` is live overwrites
the chunks the dev server is serving → `__webpack_modules__[moduleId] is not a function`.
Fix: stop dev, `rm -rf .next`, `npm run dev`.

**Postgres collation ≠ `localeCompare(numeric:true)`.** "LSFC10" and "LSFC9" order
differently. If a sort must agree between JS and SQL, rank in JS and have SQL order by the
rank.

**Reversing an ascending rank reverses the tie-break too.** Compute the rank in the
direction actually requested, then order ascending — otherwise rows within one group come
out backwards.

**`SELECT DISTINCT` with no `ORDER BY`, read with last-write-wins, is plan-dependent.**
`INCOMING` in the inventory route does this. `CL2RAG` has two pending containers: an array
of 2 SKUs returns one, an array of 51 returns the other. The original app *and* the
pipeline both carry it, so the published dashboard shows an arbitrary one too. **Not
fixed** — fixing it changes 146 rows and needs its own decision.

**A sticky first column cannot have a column placed before it.** `td.sku` is
`position:sticky; left:0` in both deliverables; anything in front slides underneath on a
sideways scroll. New columns go after it.

**Underscore-prefixed folders are private and never routed** — a `/api/_diag` route can
never respond. `createRequire(import.meta.url)` is invisible to webpack, and a `.nft.json`
listing a file is not proof the bundle can load it.

**Filters are category-scoped.** `fam`, `sub2` and `attr` are declared by one section. A
cross-section search must skip them or it silently drops every foreign match.

## Verifying

Always, before reporting done:

```bash
# the dashboard's own suite — all of these must say ALL CHECKS PASSED
for c in check-postage check-recent-dispatch check-pending-dispatch check-fixed-price \
         check-container-details check-csv-export check-first-paint check-day-numbers; do
  DASHBOARD=dashboard/inventory-dashboard.html node validation/$c.js
done
node validation/smoke-render.js     # sections rendering the wrong count : 0
```

`sql/refresh/apply.js` runs several of these before publishing — a check that hard-codes a
value will **roll back the next cron run**. When changing a business value, update the
check to read it from source rather than restating it.

For the dashboard, drive its own functions rather than reimplementing them: read the file,
extract the last `<script>`, and run it with a small `document` stub — `validation/check-postage.js`
is the working pattern.

For the app, verify in a **real browser**. Chrome is installed; drive it over CDP:

```bash
google-chrome --headless=new --disable-gpu --user-data-dir=<tmp> --remote-debugging-port=9222 about:blank
# then Node's global WebSocket against http://127.0.0.1:9222/json/list
```

This is how "the search works" was distinguished from "the request fires but nothing
renders", and how a 14 s response was traced to dev recompilation rather than the query.
Kill the browser and remove the temp profile afterwards.

## Measuring

**Never state a performance number that was not measured in this session.** The link
varies by more than 10×, so before/after timings must be interleaved, not taken hours
apart, or they measure the network.

Separate the layers when something is slow:

1. Server-side execution — `EXPLAIN (ANALYZE)`, which returns almost no rows.
2. Client-observed elapsed — the same query through `withClient`.
3. The gap between them is **row transfer**, not query cost. `products` executes in 150 ms
   and has taken 1.8–24 s to arrive.

## What not to do

- Do not create tables, views, materialized views or indexes — the role cannot, and it has
  been asked for and declined before.
- Do not change ranking, fallback precedence, marketplace precedence, or the shared
  catalogue without an explicit request and an equivalence proof.
- Do not add `inventory_bool` filtering to Slow-Moving. It looks 6× cheaper and drops
  26,576 combo rows.
- Do not use `min(price)` as the Shopify price. The rule is five tiers across four
  marketplaces (`lib/shopify-price.js`); `min()` produced a false "4 differ" and blanked
  LSFC160BT.
- Do not run `pkill -f` here. It has twice matched the killing shell's own command line and
  killed the run it was protecting.
- Listing queries need **both** `site='UK'` and `COALESCE(wrong_sku,0)=0`.

## The user

Writes in Tamil/English mix; reply in kind. Wants the reason, not just the fix — "why did
this happen" is a real question. Has pushed back on UI changed without being asked
("naan itha change panna sollala"), so keep visual changes to what was requested and offer
the rest. Prefers short answers; when a correction is needed, state it plainly and move on.
