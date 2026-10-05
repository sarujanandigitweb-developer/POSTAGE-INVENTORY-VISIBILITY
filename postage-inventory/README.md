# Postage Inventory Visibility — the Next.js app

The deployed app. Seven tabs, each reading the LEDSone database server-side through its
own API route. It does not touch, import from, or modify
`../dashboard/inventory-dashboard.html` or anything under `../sql/refresh` — but it is
expected to **agree** with them figure for figure, and that agreement is the thing to
protect.

`../postage-inventory-v2/` is a copy of this app carrying server-side pagination. This
one is the original and the deployed one; keep it working.

## Run

```bash
npm install
npm run dev            # http://localhost:3020
npm run build && npm start
node sql/smoke.mjs     # connectivity + 22 named tables, prints no credentials
```

Credentials come from the gitignored `.env` at the **repo root** (`lib/pg-core.js` walks
up to five levels to find it), or from `process.env` when all five `LEDSONE_*` keys are
present — which is how Vercel supplies them. See `../example.env`.

Node 22 is what this runs on. There is no `engines` field, so nothing enforces that.

## The tabs

| Sidebar | Component | Route | Paged where |
|---|---|---|---|
| Inventory | `components/InventoryTab.jsx` | `/api/inventory?cat=&q=` | browser |
| Postage Information | `components/PostageTab.jsx` | `/api/postage` | not paged |
| SKU Fixed Price | `components/FixedPriceTab.jsx` | `/api/fixed-price` | **server** |
| Slow-Moving Stock | `components/SlowMovingTab.jsx` | `/api/slow-moving` | **server** |
| Dispatch → Recently Dispatched | `components/RecentlyDispatchedTab.jsx` | `/api/recent-dispatch` | browser |
| Dispatch → Dispatch Queue | `components/PendingDispatchTab.jsx` | `/api/pending-dispatch` | browser |
| Container Details | `components/ContainerDetailsTab.jsx` | `/api/container-details` | browser |

"Browser" means the route returns the **whole** result set and the tab slices it. That is
the difference v2 exists to remove; it is not a bug here, but it is why Recently Dispatched
ships ~2 MB to show 25 rows.

`components/Shell.jsx` owns view state (persisted to `localStorage` as `piv.view`), the
theme, the Inventory filter state, the client cache and the background warm-up. The tab
strip lives in a sidebar (`components/Sidebar.jsx`), which is the one deliberate departure
from the published dashboard's layout.

## How the database is reached

```
browser ──fetch──▶ /api/<tab> ──▶ lib/dataset.js (cache) ──▶ lib/db.js ──▶ lib/pg-core.js ──▶ PostgreSQL
```

* `lib/db.js` is marked `server-only`: importing it from a client component is a **build
  error**, not a silent leak. No credential, host or `pg` driver code appears in
  `.next/static`.
* `redact()` scrubs the password out of any driver error before it propagates.
* **Pool `max` is 1 on Vercel or Lambda, 3 anywhere else** (`lib/pg-core.js:92`), with
  `connectionTimeoutMillis: 15000` and a 120 s `statement_timeout`. The role's limit is 10
  for everyone, so a bigger pool starves the cron refresh rather than going faster.
* `withRetry` retries four times on "too many connections", backing off 0.4/0.8/1.6 s.
* `withClient()` hands out **one** client. `Promise.all` over it *serialises*. Batching was
  implemented, measured at 22,647 ms → 23,277 ms, and reverted.

SQL is ported from the validated extracts in `../sql/refresh/extract/` rather than
rewritten, so the figures agree with the published dashboard.

## Caching — and how it lies to you

`lib/dataset.js` resolves `getOrBuild(key, build)` in this order:

**memory → in-flight promise → shipped snapshot (`data/snapshots/`) → disk (`.cache/`) → build**

All four are gated by one TTL:

```js
const TTL = Math.max(0, Number(process.env.LEDSONE_DATA_TTL ?? 300)) * 1000;
```

Read **once at module load, from the process environment** — not from `.env`, and not
changeable in a running server. A cache that "looks broken" is almost always a dev server
started with a different TTL in its shell.

> **Check `tr '\0' '\n' < /proc/<pid>/environ`** before concluding anything at all about
> TTL, freshness or cache behaviour. Not doing so cost a full investigation once.

Past the TTL, a reader **waits** for the rebuild. (v2 is the version that serves a stale
copy and refreshes behind the request.)

Two on-disk layers, easily confused:

| | Built by | Committed? |
|---|---|---|
| `data/snapshots/` (17 files, ~27 MB) | `npm run snapshots`, which `prebuild` runs | **No** — gitignored. Empty locally until you build, which is why a cold local search can trigger twelve section builds while Vercel is instant |
| `.cache/` (18 files) | written by the running server | **Yes, tracked in git.** Nothing ignores it, so cache files land in commits |

`instrumentation.js` warms `container-details`, `fixed-price` and `slow-moving`
sequentially 4 s after boot — and skips the whole thing when those three snapshots already
exist on disk.

## Classification: curated, not derived

The first version of this app derived section and type from the SKU prefix. That was wrong
and disagreed with the dashboard on six of twelve sections. `build.js` states the rule:

> **an existing SKU keeps the classification it already has — the embedded arrays on disk
> are the authority for `f`, `t`, `x`, `mt`, `sh`, `ft` and `sr`.**

So `scripts/export-classification.cjs` exports that placement once into `data/`, and the
app joins live stock, price, description and image onto it. Re-run it whenever those
arrays change. It also reproduces the three re-typings the page does in memory (the 31
`ZHL` handles moving to Lamp Spares, the Wall Arm collapse to four families, the Bulbs
re-typing), because anything reading the arrays directly gets the pre-transform shape.

A SKU that is in Postgres but not in the curated arrays is **reported, never silently
dropped** — `lib/section-of.js` places it by unique prefix or by rule, and what is left is
`unplaced`. The 12 sections and their populations come from `data/sections.json` and
`data/classification.json` (6,183 SKUs at the last export).

**Dead files worth knowing about:** `data/price.json`, `data/price-alt.json` and
`data/price-comments.json` are written by `npm run sync-data` from the pipeline's output
and **nothing reads them**. Price, alt price and the Price Comment are all derived live by
`lib/shopify-price.js`. The files are left on disk as a record — see the note at
`app/api/inventory/route.js:36-39`.

## Filters and search

`lib/filter.js` is a port of the page's `matches()`, clause for clause.

* **One active category at a time.** "Select" is not a filter state; `*` means "All
  <name>". Switching category clears the level-2 and attribute filters, because their
  dimensions differ between sections.
* **Level-2 and attribute dropdowns** are built from the *active* category's rows, so
  every option offered is a value that exists, listed exactly as stored.
* **Search is cross-category.** `?q=` makes the route run `searchAll()` over all twelve
  sections and return matches from every one, each row tagged with its category (`mc`/`sc`),
  which the tab shows in an extra Category column placed **after** the sticky SKU column.
  Category-scoped filters (`fam`, `sub2`, `attr`) are **skipped while searching** — they
  are declared by one section, so applying them would silently drop every foreign match.
* **Stock** conditions are the page's five: `pos zero neg low out`. `low`/`out` use
  `stockLevel`, which sums **all eight** warehouse columns, not just the UK ones. Getting
  that wrong changes both alert counts.
* **The header alerts are scoped to the active category**, not the catalogue — which is
  why Ceiling Rose reads 62 / 7 and not 1613 / 687.

A sticky first column cannot have a column placed before it: `td.sku` is
`position:sticky; left:0`, and anything in front of it slides underneath on a sideways
scroll. New columns go after it.

## Business constants

Changing one of these changes what the team sees. They are stated once, here, and live in
exactly one place each in the code.

| Value | Where |
|---|---|
| Dispatch SLA 3 days; open statuses `Inprogress/New/Hold` | `app/api/pending-dispatch/route.js:18-19` |
| Recently Dispatched window **7 days**, lookback 90 | `app/api/recent-dispatch/route.js:28,33` |
| Slow-moving after 90 days; Medium 91-180, High 181-365, Critical >365 | `app/api/slow-moving/route.js:26-28` |
| Stock out `<= 0`, low `<= 10` | `lib/stock.js:7-10` |
| History capped at 12 movements per region | `app/api/inventory/route.js:392` |
| Marketplaces Shopify/eBay/Amazon/B&Q; Wayfair and Temu **declared empty**, not blank | `app/api/fixed-price/route.js:16-20` |
| Shopify price: five tiers across four marketplaces | `lib/shopify-price.js` |

Three rules in the dispatch and price tabs were real defects when they were missing:

* **Single vs combo is `inventory.products.inventory_bool`**, not whether the SKU contains
  a `+`. The `+` heuristic gave 15,768 / 14,453 against the correct 4,771 / 25,450.
* **A SKU holding nothing that has never sold is a dormant catalogue entry, not a
  slow-mover.** Leaving those in more than doubled the row count.
* **A SKU never sold is aged from `created_at`**, not treated as infinitely old.

And from the source scripts: Cancelled and Deleted orders are not sales; a component sold
inside a combo has moved; `order_info.shipped` is not the open/closed signal.

## Dispatch status — read this before touching Recently Dispatched

The status column is the carrier's own word from `order_management.shipment_tracking_log`,
joined on the tracking number. Nothing is inferred from the order status.

Since 2026-09-15 (`4e346f3`) the route **invents nothing**. Where the log has no row:

```js
const status = (r.track_status || '').trim() ||
               (r.trk ? 'No Carrier Data' : 'Dispatched - No Tracking');
```

* `No Carrier Data` — there is a tracking number but the sync never fetched it. This is
  every DHL, Evri, DPD and UPS parcel: the external sync only ingests 13-character Royal
  Mail numbers. Verified over 4,661 rows: 1,548 of them.
* `Dispatched - No Tracking` — no tracking number at all. Mostly Amazon Shipping and
  Wayfair Shipping, where the marketplace buys the label.

It previously said `Label Created` in both cases, which was a guess. **The published
dashboard and v2 still make that guess.** Do not "restore consistency" by putting the
guess back; carry the fix forward instead — see the root README's Known Issues.

## Postage Information

The only tab that does not read PostgreSQL. `app/api/postage/route.js` fetches four Google
Sheet tabs as CSV and caches them for 60 s in its own in-process cache, independent of
`lib/dataset.js`. `lib/sheet.js` holds the workbook ids, gids and column rules for all six
sections — Postage Prices, International Prices, postage Dimensions, Contact Details, Box
Sizes and Box Purchase History, the last of which lives in its own workbook. A failing tab
degrades to a section carrying an error, not a whole-page failure.

## What is NOT done

1. **The Inventory status line has no per-family breakdown** ("CRSF 267 · CRFF 116"). It
   shows `Showing N of M`, and a per-category breakdown while searching.
2. **Nothing writes.** Every query is read-only; no schema is touched. This is a rule, not
   a gap.
3. `scripts/check-handler-refs.cjs` exists but is not wired into any npm script.

## Deployment

Deployed to Vercel from this folder. **There is no `vercel.json`, no Dockerfile and no CI
config in the repo** — the project settings live in the Vercel dashboard, so whoever takes
this over needs access to that account, not just to git.

What the deployment relies on:

* `next.config.mjs` — `serverExternalPackages: ['pg']` and
  `outputFileTracingIncludes: { '/api/**': ['./data/**/*.json'] }`, which is what puts the
  curated classification inside the serverless bundle. The file carries a standing note
  **not** to pin `outputFileTracingRoot`.
* `prebuild` runs `sync-data` then builds the 17 snapshots, so a deployment ships warm.
  If the host cannot reach the database at build time, the documented fallback is to commit
  `data/snapshots/` — remove that line from `.gitignore`.
* The five `LEDSONE_*` variables set in the Vercel project.

Underscore-prefixed folders are private and never routed: an `/api/_diag` route can never
respond. `createRequire(import.meta.url)` is invisible to webpack, and a `.nft.json`
listing a file is not proof the bundle can load it.

## Verifying a change

```bash
npm run build                  # never while `next dev` is running — see below
node sql/smoke.mjs
```

Then drive it in a real browser over CDP. Chrome is installed:

```bash
google-chrome --headless=new --disable-gpu --user-data-dir=<tmp> \
              --remote-debugging-port=9222 about:blank
```

**`.next` holds one build.** Running `npm run build` while `next dev` is live overwrites
the chunks the dev server is serving and the browser throws
`__webpack_modules__[moduleId] is not a function`. Fix: stop dev, `rm -rf .next`,
`npm run dev`.
