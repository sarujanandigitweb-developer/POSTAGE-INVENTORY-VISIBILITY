# Postage Inventory Visibility — v2

A copy of `../postage-inventory/` with two changes to **where** work happens, and none to
what the work produces:

1. **Search, filter, sort and paging moved to the server** on the four tabs that still did
   them in the browser.
2. **A cache that never blocks a reader** — a stale copy is served while the rebuild runs
   behind the request, and a background sweep refreshes hot datasets before they expire.

**Not deployed.** v1 is the deployed app. Run this one on **port 3021**.

```bash
npm install
npm run dev      # http://localhost:3021
```

> `package.json` still says `"name": "postage-inventory"` — the folder is the only thing
> that distinguishes the two. Read `../postage-inventory/README.md` first: everything
> about credentials, the connection pool, classification, business constants and filter
> semantics is identical and is documented there, not repeated here.

## What actually differs from v1

Fifteen files differ and two are new. Nothing else in the tree does.

| File | Difference |
|---|---|
| `lib/query.js` | **New.** The whole server-side pipeline: `SIZES`, `pageParams`, `applyFilters`, `sortRows`, `paginate`, `runQuery`, `optionsFor`. |
| `lib/dispatch-filter.js` | **New.** The two dispatch tabs' predicates, lifted out of the components so the routes can run them. |
| `lib/dataset.js` | Stale-while-revalidate + the keep-warm sweep. |
| `instrumentation.js` | Explicit warm list, adds `inventory-CR`, honours `LEDSONE_SKIP_WARM`. |
| `app/api/inventory/route.js` | Server-side page/sort/filter/search; adds the `engine` switch. |
| `app/api/recent-dispatch/route.js`, `pending-dispatch/route.js` | Filter and paginate server-side. |
| `app/api/container-details/route.js` | Paginates, and serves one container's manifest on demand via `?manifest=`. |
| `components/*Tab.jsx`, `Shell.jsx`, `Pager.jsx` | Send the query to the server instead of filtering locally; page sizes fixed at 25/50/100/250. |
| `app/theme.css`, `package.json` | Port 3021; **lacks** v1's `.bdg.nodata` rule — see the warning at the end. |

## Page sizes are a ceiling, not a suggestion

`lib/query.js:29-31` — `SIZES = [25, 50, 100, 250]`, `MAX_SIZE = 250`, default 25. Any
other value is clamped, because `?size=100000` is how server-side pagination quietly
becomes no pagination at all. A page past the end is clamped to the last page rather than
returned empty.

`fixed-price` and `slow-moving` already paged on the server in v1 and were left alone —
they still use `page()` from `lib/dataset.js` and still accept an unclamped `size`.

## What it deliberately does NOT do

**It does not change any SQL.** The predicates the routes run are the ones `lib/filter.js`
already used in the browser, *imported rather than reimplemented*, so a row is included or
excluded for exactly the reason it always was.

That is not laziness. These rows are not rows of any table: Slow-Moving assembles three
movement sources with a fallback precedence, Fixed Price applies a five-tier price rule
across four marketplaces, and an Inventory row's price is computed in JS while its stock is
pivoted across eight warehouses. `ORDER BY price` cannot be written against a column that
does not exist. Pushing these predicates into SQL would mean maintaining the business rules
in two languages for ever.

**Every sort ends on a unique tie-breaker** (`lib/query.js:71-93`). Paging over an unstable
order is how a reader sees the same SKU on page 2 and page 3 and never sees another at all.

**Option lists come from the matching set, not from the page** (`optionsFor`). Building
them from the 25 rows on screen would offer a reader the three warehouses that happen to
appear on page 1.

## The cache

Same four layers as v1 (memory → in-flight → shipped snapshot → `.cache/` → build), same
`LEDSONE_DATA_TTL` read once at module load. Two additions:

**Stale-while-revalidate** (`lib/dataset.js:224-232`). Past the TTL, the newest copy from
any layer is returned immediately and the rebuild runs behind the request — as long as that
copy is younger than `LEDSONE_MAX_STALE` (default 3600 s). Older than that, the reader
waits, as in v1. The served copy's real age is what `builtAt()` reports, so the "read at"
chip never claims to be fresher than it is.

**Keep-warm sweep** (`lib/dataset.js:144-175`). A dataset is rebuilt at **80% of its TTL**
if a reader has asked for it within the last 30 minutes. Strictly serial, `unref()`ed, and
it only touches keys a reader has actually requested. At the default TTL it ticks every
75 s (floor 15 s).

Both exist because the database is remote and slow, and a reader who arrives one second
after the TTL expires should not pay for a 15-second rebuild.

## Environment knobs

Only `LEDSONE_DATA_TTL` exists in v1. All the rest are v2's.

| Variable | Default | Effect |
|---|---|---|
| `LEDSONE_DATA_TTL` | `300` s | How long a built copy is served before a rebuild is due. Also sets the sweep interval (TTL/4) and the 80% refresh point. `0` disables the sweep. |
| `LEDSONE_MAX_STALE` | `3600` s | Oldest copy still served while the rebuild runs behind. |
| `LEDSONE_STALE=0` | unset | Turns stale-while-revalidate off — v1 behaviour, the reader waits. |
| `LEDSONE_KEEP_WARM=0` | unset | Turns the background sweep off. |
| `LEDSONE_SKIP_WARM=1` | unset | Skips the boot warm-up. |
| `LEDSONE_INVENTORY_ENGINE` | `memory` | `sql` switches Inventory to database-side pagination. See below. |
| `PORT` | `3020` | ⚠️ The boot warm-up fetches `127.0.0.1:$PORT`. **v2 runs on 3021**, so with `PORT` unset it warms v1 instead. Set `PORT=3021`. |

The three knobs that turn features off exist so a measurement can be taken without the
background work competing with it. Interleave the runs; the link varies by more than 10×.

## The `engine` switch — measured, and left on `memory`

`?engine=sql` (or `LEDSONE_INVENTORY_ENGINE=sql`) makes PostgreSQL filter, order, count and
cut, so only the ~25 SKUs on the page go through `buildRows()`. It exists, it is correct,
and it is **slower**, which is why it is not the default:

| | in memory | in SQL |
|---|---|---|
| Ceiling Rose, page 1 | 42 ms | 6,263 ms |
| Lampshade, page 1 | 57 ms | 4,323 ms |
| cross-category search | — | 13,958 ms |

The dataset is already built and cached; narrowing it in process costs nothing, while every
SQL page is a fresh round trip to a database 170 ms away. Sorting by Shopify price and
`all=1` always fall back to memory — the price is computed in JS and is not a column.

Text sorts on the SQL path are **ranked in JS first** and SQL orders by that rank, because
Postgres collation and `localeCompare(numeric:true)` disagree: "LSFC10" and "LSFC9" order
differently.

## Before you promote v2 over v1

1. **v2 does not have the dispatch-status fix.** `app/api/recent-dispatch/route.js:185`
   still invents `'Label Created'` where the tracking log has no row; v1 says
   `'No Carrier Data'`. `app/theme.css` here also lacks the `.bdg.nodata` badge rule and
   `components/RecentlyDispatchedTab.jsx` lacks its branch. v2 branched before that commit
   (`4e346f3`).
2. **No validator covers v2.** The 17 scripts in `../validation/` drive the published HTML
   dashboard; none of them mentions this folder or port 3021. Pagination correctness here
   was proven by ad-hoc comparison against v1, not by a committed test.
3. **The warm-up port** above.
4. Its `.cache/` is tracked in git, as v1's is.
