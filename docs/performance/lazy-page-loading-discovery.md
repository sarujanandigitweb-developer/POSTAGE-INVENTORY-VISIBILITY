# Lazy page loading — discovery

**Status: DISCOVERY ONLY. No code was modified.** Read-only inspection of the existing
app and dashboard, plus timing measurements against the running dev server. No DDL, no
writes, no schema or data changes.

Evidence: [`evidence/page-load-timings.json`](evidence/page-load-timings.json).

---

## 0. Conclusion first

**PASS — the requested behaviour is reachable, and most of it already exists.**

There are two deliverables in this project and they are in very different states:

| Deliverable | Verdict |
|---|---|
| `dashboard/inventory-dashboard.html` | **Already compliant.** It builds each tab on first sight and never rebuilds. No change is needed or recommended. |
| `postage-inventory/` (Next app) | **Partly compliant.** Per-tab fetching is already lazy. Two defects remain: an unconditional Inventory fetch on every open, and per-tab state that is destroyed on tab switch. |

The backend needs **no separation work at all** — all seven APIs are already independent,
independently cached, and already deduplicate concurrent builds. The whole remaining gap
is in one browser file.

---

## A. Current loading flow

### A.1 The published HTML dashboard

**What happens when `inventory-dashboard.html` opens.** Nothing is fetched. Every dataset
is embedded in the file as a JavaScript constant, written in by `sql/refresh/apply.js`
during the 2-hourly refresh — `LS_DATA`, `PH_DATA`, `FIXED_PRICE`, `SLOW_MOVING`,
`CONTAINER_DETAILS`, `PENDING_DISPATCH`, `RECENT_DISPATCH`, `HIST_RAW` and the rest
(`dashboard/inventory-dashboard.html`, lines 2053–4050).

**Which APIs are called immediately.** One, and only on the Postage tab: `pgLoad()` reads
the Google Sheets CSV endpoints. Every other tab reads a constant already in memory.

**Which JavaScript functions trigger the work.** `setView(v)` at line 2852:

```js
if (slow && !sm.built) smRender();
if (pend && !pd.built) pdRender();
if (sent && !rd.built) rdRender();
if (cont && !cd.built) cdRender();
if (post) pgLoad(false);
pgAutoRefresh(post);          // stop polling the moment the reader leaves the view
if (fixed && !fx.built) fxRender();   // "built on first sight, not at load"
```

Each `xxRender()` opens with `if (xx.built) return;` and sets `xx.built = true` on
completion. **This is exactly the requested architecture**, expressed against embedded
data instead of HTTP: render on first sight, never repeat, never do work for a tab that
was not opened. `pgAutoRefresh(post)` additionally stops the Postage poll on leave.

Nothing here needs to change.

### A.2 The Next application

**What happens when the app opens.**

1. `app/page.js` renders `<Shell/>` — a server component with no database access.
2. `Shell` mounts with `view = 'inv'` and `booted = false`. The body renders a skeleton
   only; `Sidebar` and `Header` are passed `view={booted ? view : null}` so nothing
   claims a tab yet (`components/Shell.jsx:158`).
3. An effect reads `localStorage['piv.view']`, restores the saved tab if it is in
   `ALL_VIEWS`, and sets `booted = true` (`Shell.jsx:96`).
4. **Independently and unconditionally**, a second effect fetches
   `/api/inventory?cat=<st.cat>` (`Shell.jsx:50`). Its dependency list is `[st.cat]`
   alone. It does not consult `view`.
5. The restored tab's component mounts and its own `useEffect` issues its own fetch.

**Which APIs are called for every page even when that page is not opened.**
Exactly one: **`/api/inventory`**. It is fetched on every open no matter which tab is
restored. Measured cost when the Inventory tab is not the one being shown: **4.34 s cold,
one of the three available pool clients, and the shared `catalogue` build** — entirely
invisible to the reader.

**Which functions trigger each request.**

| Function | File | Request |
|---|---|---|
| `useEffect(..., [st.cat])` | `Shell.jsx:50` | `/api/inventory?cat=` |
| `useEffect(..., [q,type,mk,cat,page,size,autoRows])` | `FixedPriceTab.jsx:55` | `/api/fixed-price?…` |
| `useEffect(..., [q,pri,stock,type,php,cat,sort,page,size,autoRows])` | `SlowMovingTab.jsx:37` | `/api/slow-moving?…` |
| `useEffect(..., [q,status,region,stage,sort])` | `ContainerDetailsTab.jsx:39` | `/api/container-details?…` |
| `useEffect(..., [])` | `PendingDispatchTab.jsx:32` | `/api/pending-dispatch` |
| `useEffect(..., [])` | `RecentlyDispatchedTab.jsx:41` | `/api/recent-dispatch` |
| `useEffect(load, [])` | `PostageTab.jsx:48` | `/api/postage` |
| `register()` | `instrumentation.js:41` | server-side warm of three datasets |

**Tab components are already lazy.** `Shell.jsx:196–202` renders each tab conditionally
(`{view === 'fx' && <FixedPriceTab/>}`), so a tab component does not exist — and
therefore does not fetch — until it is selected. Requirements 1, 2, 3 and 7 are already
satisfied *for the tab components*. The Inventory fetch in step 4 is what breaks
requirement 3.

### A.3 Page / API dependency table

Load times measured 2026-09-07 against the dev server with a healthy database link.
"Cold" = cache file deleted first; "warm" = repeat inside the 300 s TTL.

| Page / tab | Required API / data | Cold | Warm | Initial load? | Can be lazy? |
|---|---|---|---|---|---|
| **Inventory** (`inv`, default) | `/api/inventory?cat=` + shared `catalogue` | 4.34 s | 0.02 s | **Yes — always, even when not shown** | **Yes** — gate on `view === 'inv'` |
| **Postage Information** (`postage`) | `/api/postage` → Google Sheets, 3 CSV tabs, 3 workbooks | 1.43 s | 0.01 s | No | Already lazy |
| **SKU Fixed Price** (`fx`) | `/api/fixed-price` + shared `catalogue` | 3.16 s | 0.03 s | No | Already lazy |
| **Slow-Moving Stock** (`sm`) | `/api/slow-moving` + shared `catalogue` | 13.97 s | 0.02 s | No | Already lazy |
| **Dispatch → Queue** (`pd`) | `/api/pending-dispatch` | 0.96 s | 0.02 s | No | Already lazy |
| **Dispatch → Recently Dispatched** (`rd`) | `/api/recent-dispatch` | 2.44 s | 0.04 s | No | Already lazy |
| **Container Details** (`cd`) | `/api/container-details` + shared `catalogue` | 4.54 s | 0.02 s | No | Already lazy |
| **History** | *No API.* A dialog inside Inventory (`InventoryTab.jsx:200`), rendered from rows already in the Inventory payload | — | — | No | N/A — nothing to load |
| **Comment** | *No API.* Same pattern (`InventoryTab.jsx:201`) | — | — | No | N/A |

There is no "Home" tab. The app's landing view is **Inventory**, or whatever
`localStorage['piv.view']` last held. In the HTML dashboard the equivalent is `VIEWS[0]`,
`'inv'`, remembered under `crv-view`.

---

## B. Existing cache / shared-data mechanisms

Everything below already exists. **Nothing needs to be created.**

### B.1 `getOrBuild(key, build)` — `lib/dataset.js`

The single server-side cache. Its resolution order:

1. `cache` — an in-memory `Map` on `globalThis[Symbol.for('postage-inventory.dataset')]`,
   valid for `TTL`. On `globalThis` deliberately: Next bundles each route separately and
   dev HMR re-evaluates modules, so a plain module-level Map would be one map per bundle.
2. `inflight` — a `Map` of in-progress builds. **This is the server-side request
   coalescer, and it already satisfies requirement 6 at the API layer.**
3. Shipped snapshot (`data/snapshots/<key>.json`), if inside the TTL.
4. Disk cache (`.cache/<key>.json`), if inside the TTL.
5. Otherwise build, then populate the memory cache and write the disk cache.

`TTL = Number(process.env.LEDSONE_DATA_TTL ?? 300) * 1000` — **300 s**. This is the
existing freshness rule. It is not to be redefined.

Also exported and reusable as-is: `isReady(key)`, `fromSnapshot(key)`, `builtAt(key)`,
`shippedAt(key)`, and `page(rows, {page, size})` — "one place to slice, so every tab
paginates identically".

### B.2 Shared catalogue — `lib/catalogue.js`

`catalogue(q)` wraps `getOrBuild('catalogue', …)` around `products` + `images`. It is
consumed by **inventory, fixed-price, slow-moving and container-details**. It takes the
caller's `q` so a request that already holds a client does not open a second one.

Measured: 44,430 products, **5,362 kB on the wire**, server-side execution **150.7 ms**,
client-observed **1,770 ms** on a healthy link.

**Out of scope by instruction and not touched by any recommendation here.**

### B.3 Snapshots — `scripts/build-snapshots.mjs`

Run by `prebuild`, so `next build` produces them. Writes one file per dataset into
`data/snapshots/`, importing each route's own exported `buildSnapshot` so there is no
second copy of the logic. Inventory is snapshotted one section at a time, keyed the way
the request is keyed.

`data/snapshots/` is **currently empty in this working tree**, so every dev-server open is
a live build. A deployment that ran `prebuild` opens no connection at all until the TTL
expires.

### B.4 Server-side warm-up — `instrumentation.js`

Four seconds after boot, warms `container-details`, `fixed-price`, `slow-moving`
**sequentially**, and skips entirely when snapshots are shipped. Its own comment records
why sequential: *"slow-moving builds in ~15 s idle and 512 s when the reader was browsing
at the same time. The contention is the cost."*

This is the existing background prefetch. Requirement 4 is already met on the server for
three of the seven datasets.

### B.5 Browser-side state

- **Inventory only** has a client cache: `const [cache, setCache] = useState({})` keyed by
  category, read through `cacheRef` so it is not an effect dependency (`Shell.jsx:44`).
  It implements **stale-while-revalidate**: the held copy paints immediately with no
  spinner, and the request still goes out behind it. *This is the existing, proven pattern
  the other tabs should adopt.*
- **Every other tab**: `const [d, setD] = useState(null)` inside the tab component. Because
  `Shell` unmounts the component on tab switch, **this state is destroyed and refetched on
  return**. There is no browser-side dedupe and no in-flight registry.
- `localStorage`: `piv.view` (app) / `crv-view` (dashboard), and `piv.theme`.

### B.6 Postage — its own cache

`app/api/postage/route.js` does not use `getOrBuild`. It has a module-level `cache` with
`CACHE_MS = 60 * 1000`, because *"the sheet is edited by hand a few times a day"*. A
separate, deliberate freshness rule. **Leave it alone.**

### B.7 Connection pool — `lib/pg-core.js:92`

`max: 3` locally (`1` on Vercel/Lambda), `connectionTimeoutMillis: 15000`, against a role
whose `rolconnlimit` is **10**, shared with pgAdmin and the 2-hourly refresh cron.

---

## C. Duplicate-request risk

**At the API layer: no duplicate DB work is possible.** `getOrBuild`'s `inflight` map
means a second caller for a key already building attaches to the same promise. Two tabs,
two browser tabs, the warm-up and a reader all racing for `slow-moving` produce **one**
build. Requirement 6 is already satisfied server-side.

**Three real problems exist, and none of them is a duplicate of the same key.**

### C.1 The unconditional Inventory fetch — the main defect

`Shell.jsx:50`, deps `[st.cat]`:

```js
fetch('/api/inventory?cat=' + encodeURIComponent(st.cat))
```

Nothing gates this on `view`. Open the app on Slow-Moving and two cold builds start at
once: `inventory-CR` (4.34 s, needed by nobody on screen) and `slow-moving` (13.97 s,
the one the reader is waiting for). They take two of three pool clients and compete for a
10-connection role. **This is the code that violates requirements 1 and 3.**

### C.2 Tab state destroyed on switch — requirements 5 and 8

`Shell.jsx:196–202` renders tabs conditionally, so leaving a tab unmounts it and discards
its `d`. Returning remounts and refetches. Inside the TTL the server answers from memory
in ~0.02 s, so this is cheap **today** — but:

- once the TTL lapses it is a full cold rebuild for a page the reader has already seen;
- it re-transfers the payload every time (12 MB for Fixed Price, 5.8 MB for Slow-Moving);
- it discards scroll position, page number and filters.

"Switching tabs must feel immediate whenever the data is already available" is only true
while the server cache is warm. It is not a property of the client.

### C.3 Pool exhaustion under concurrency — the stall mechanism

`max: 3` with `connectionTimeoutMillis: 15000`. A fourth concurrent build **queues for up
to 15 s and then throws**. The realistic path: warm-up holds one, Shell's inventory holds
one, the reader's tab holds one — a fourth request (a filter change, a second browser tab)
queues. This is the mechanism behind the `instrumentation.js` note about 15 s becoming
512 s.

### C.4 Not a defect, but worth recording

The 36 s / 24 s page loads observed earlier the same day were **not** caused by any of the
above. Measured at the time: the shared `products` query took **23,948 ms** against a
server-side execution of **150 ms**. Re-measured after recovery over 12 cold connections:
min 1,699 ms, median 1,770 ms, max 1,919 ms — a 1.1× spread. The database is remote
(169.58.91.229, 178 ms RTT, 0% loss) and the link degraded transiently. Lazy loading will
not fix a slow link; it will limit how many pages pay for it.

---

## D. Target architecture (design only — NOT implemented)

The smallest safe change is **one new client-side module and two edits to `Shell.jsx`**.
No backend change. No change to any route, query, ranking, precedence, pagination or the
shared catalogue.

### D.1 A browser-side dataset registry

A single module holding, per cache key, `{ status, promise, data, at }` — deliberately the
same shape and the same rules `lib/dataset.js` already uses on the server, so there is one
concept in the codebase rather than two:

```
get(key, url):
  hit = store[key]
  if hit.data  and (now - hit.at) < TTL   -> return it synchronously   (req. 5, 8)
  if hit.promise                          -> return hit.promise        (req. 6)
  otherwise                               -> start fetch, record the promise, return it (req. 7)
```

`TTL` must be **read from the server, not redefined**. Every route already returns `asOf`;
`lib/dataset.js` already exports `builtAt()`. The client stores `asOf` and treats a held
copy exactly as `Shell`'s Inventory cache already does — **paint it, then revalidate
behind it**. That reuses the existing freshness rule rather than inventing one
(requirement 9).

This registry lives outside React state so it survives unmount.

### D.2 Gate the Inventory fetch on the view

`Shell.jsx:50` becomes conditional on `booted && view === 'inv'`, with `view` added to the
dependency list. Everything else about that effect — the `cacheRef` read, the
stale-while-revalidate paint, the `[st.cat]` reasoning about the endless-fetch loop — is
preserved.

### D.3 Background prefetch, after the selected page is visible

Once the selected tab has rendered, ask the registry to warm the others at low priority,
one at a time. Two constraints already established by the codebase must be honoured:

- **Sequential, never parallel** — `instrumentation.js` records the measurement that
  proves why (15 s → 512 s under contention), and the pool is `max: 3`.
- **Skip anything already warm** — `isReady(key)` exists for this.

Because the registry returns the in-flight promise, a reader who clicks a tab mid-prefetch
attaches to that request instead of starting a second (requirement 6, now client-side too).

### D.4 Resulting flow

```
OPEN
 └─ booted resolves the saved tab
     └─ ONLY that tab's data is requested
         └─ tab paints as soon as its own data arrives
             └─ background prefetch begins, sequentially, for the rest

CLICK a tab
 ├─ registry has fresh data      -> render synchronously, revalidate behind
 ├─ registry has a promise       -> await it; no second request
 └─ registry has nothing         -> fetch that tab alone
```

---

## E. Do the backend APIs already support independent page loading?

**Yes. Completely. No backend separation is required.**

Every route is independently addressable, independently cached under its own key, and
already coalesces concurrent builds:

| API | Cache key | Independent? |
|---|---|---|
| `/api/inventory?cat=` | `inventory-<cat>` | Yes — one key per category |
| `/api/fixed-price` | `fixed-price` | Yes |
| `/api/slow-moving` | `slow-moving` | Yes |
| `/api/container-details` | `container-details` | Yes |
| `/api/pending-dispatch` | `pending-dispatch` | Yes |
| `/api/recent-dispatch` | `recent-dispatch` | Yes |
| `/api/postage` | own 60 s module cache | Yes |

Four of them share `catalogue`, but that is a *shared cache entry*, not a coupling: the
first to need it builds it, the rest attach to the same `inflight` promise or read the
same cache entry. Requesting one page never requires another page's dataset.

---

## F. Data freshness — where each page's data actually comes from

No values invented; all read from the code.

| Page | Source today | Rule |
|---|---|---|
| Inventory | Live PostgreSQL via `getOrBuild('inventory-<cat>')`, shared `catalogue` | 300 s TTL (`LEDSONE_DATA_TTL`), then re-queried |
| SKU Fixed Price | Live PostgreSQL via `getOrBuild('fixed-price')`, shared `catalogue` | 300 s TTL |
| Slow-Moving Stock | Live PostgreSQL via `getOrBuild('slow-moving')`, shared `catalogue` | 300 s TTL |
| Container Details | Live PostgreSQL via `getOrBuild('container-details')`, shared `catalogue` | 300 s TTL |
| Dispatch Queue | Live PostgreSQL via `getOrBuild('pending-dispatch')` | 300 s TTL |
| Recently Dispatched | Live PostgreSQL via `getOrBuild('recent-dispatch')` | 300 s TTL |
| Postage Information | **Google Sheets**, three tabs across three workbooks, read server-side | **60 s** module cache — a separate, deliberate rule |
| History / Comment dialogs | Rows already in the Inventory payload | Inherits Inventory's TTL |
| Published HTML dashboard | Data embedded at build time by `sql/refresh/apply.js` | 2-hourly cron; Postage alone is live |

In a deployed build, a shipped snapshot serves each key **while it is inside the same
300 s TTL** and is re-queried after — `lib/dataset.js` is explicit that the snapshot "is a
CACHE, NOT THE SOURCE".

**The recommendation changes none of this.** The client registry adopts the server's
`asOf`; it does not define its own age.

---

## G. Safety

The design touches presentation-layer scheduling only. It confirms preservation of:

| Must be preserved | How the design preserves it |
|---|---|
| Exact existing data | No route, query or shaping code is touched. The client requests the same URLs. |
| Business logic | Untouched — all of it is server-side. |
| Slow-Moving ranking | `sort` remains a request parameter handled by the route. |
| Fallback precedence | Inside `slow-moving/route.js`, not touched. |
| Pagination | `page`/`size` stay request parameters; `page()` in `lib/dataset.js` is untouched. |
| Marketplace precedence | Inside the routes, not touched. |
| Shared catalogue | `lib/catalogue.js` not touched; consumers unchanged. |
| `lineName`/`lineImg` narrowing | Not touched. |
| Refresh behaviour | The client adopts the server's existing TTL and `asOf`. No new rule. |
| Existing validation | Nothing removed. The `validation/` checks read the dashboard, which is not modified. |
| Source of truth | None created. The registry is a request coalescer over the same APIs. |

**One risk to note explicitly:** a client-side registry that outlives unmount will hold the
last payload in browser memory — 12 MB for Fixed Price plus 5.8 MB for Slow-Moving. A cap,
or storing only the current page's slice, should be decided before implementation.

---

## H. Expected UX after implementation

```
OPEN DASHBOARD
  → saved tab resolves (already the case today, via `booted`)
  → ONLY that tab's data is requested          [today: + a wasted 4.34s inventory build]
  → tab visible as soon as its own data lands
  → background prefetch begins, one dataset at a time

CLICK A PAGE
  → data ready      → renders immediately, no spinner, revalidates behind
  → request running → attaches to it; no duplicate
  → never requested → fetches only that page

RETURN TO A PAGE ALREADY SEEN
  → immediate                                   [today: refetch, and a cold rebuild once the TTL has lapsed]
```

Concretely, opening the app on Slow-Moving today costs `13.97 s + 4.34 s` of competing
work against a three-client pool. After the change it costs the Slow-Moving build alone.

---

## I. Implementation file map (NOT modified)

| File | Function | Change |
|---|---|---|
| `postage-inventory/components/Shell.jsx` | `useEffect(..., [st.cat])` at line 50 | Gate on `booted && view === 'inv'`; add `view` to deps |
| `postage-inventory/components/Shell.jsx` | the disabled prefetch effect at line 77 | Reinstate as a *client-registry* prefetch, sequential, skipping warm keys |
| **new** `postage-inventory/lib/client-datasets.js` | — | The browser-side registry of §D.1 |
| `postage-inventory/components/FixedPriceTab.jsx` | load effect, line 55 | Route through the registry |
| `postage-inventory/components/SlowMovingTab.jsx` | load effect, line 37 | Route through the registry |
| `postage-inventory/components/ContainerDetailsTab.jsx` | load effect, line 39 | Route through the registry |
| `postage-inventory/components/PendingDispatchTab.jsx` | load effect, line 32 | Route through the registry |
| `postage-inventory/components/RecentlyDispatchedTab.jsx` | load effect, line 41 | Route through the registry |
| `postage-inventory/components/PostageTab.jsx` | `load`, line 42 | Route through the registry (its own 60 s rule stays server-side) |

**Not to be modified:** every `app/api/*/route.js`, `lib/dataset.js`, `lib/catalogue.js`,
`lib/pg-core.js`, `scripts/build-snapshots.mjs`, `instrumentation.js`, everything under
`sql/`, everything under `validation/`, and `dashboard/inventory-dashboard.html`.

---

## J. Validation plan

Each item states the method and the pass condition. Items 6–11 are **equivalence proofs**
and are the gate: the change must not alter a single byte of any dataset.

| # | Claim | Method | Pass condition |
|---|---|---|---|
| 1 | Home no longer waits for unrelated pages | Set `piv.view` to `sm`, reload with the network panel recording | `/api/inventory` is **absent** from the request list |
| 2 | Selected page renders when its own data is ready | Record time from navigation to first row painted, per tab | Matches that tab's own cold time (§A.3), not the sum |
| 3 | Background loading does not block the UI | Reload on `pd` (0.96 s), interact while prefetch runs | Page interactive before the prefetch finishes; no frozen frames |
| 4 | No duplicate request for one page | Click a tab twice quickly; click a tab while its prefetch is in flight | Exactly **one** network request per key |
| 5 | Tab switching issues no unnecessary request | `sm → fx → sm` inside the TTL | Second `sm` visit issues **no** request; renders synchronously |
| 6 | API JSON unchanged | Capture all seven endpoints before and after; `diff` the canonicalised JSON | **Zero** differences |
| 7 | Slow-Moving unchanged | Full dataset (`size=all`) before/after; compare row order, ranking, every field | Identical, including ordering |
| 8 | Fixed Price unchanged | Same, `size=all` | Identical |
| 9 | Container Details unchanged | Same, plus manifest sub-tables | Identical |
| 10 | History unchanged | Open the dialog for a fixed set of SKUs; compare rendered rows | Identical |
| 11 | Pending Dispatch unchanged | Same, `size=all` | Identical |
| 12 | No DB/schema/data change | `git diff` touches no file under `sql/`; no DDL executed; confirm `has_schema_privilege(inventory, CREATE) = false` still holds for `tech_user` | Clean |

Additionally, the existing checks must still pass unchanged:
`validation/check-postage.js`, `check-recent-dispatch.js`, `check-pending-dispatch.js`,
`check-fixed-price.js`, `check-container-details.js`, `check-csv-export.js`,
`smoke-render.js`.

**Measurement caveat.** Every before/after timing must be taken in the same session and
interleaved. The link to the remote database varies by more than an order of magnitude
(§C.4); a before/after comparison taken hours apart measures the network, not the change.

---

## Risks

1. **Client memory.** The registry holds payloads across unmount — 12 MB + 5.8 MB + 2.4 MB
   if all are visited. Needs a cap or a page-slice-only policy, decided before coding.
2. **Stale paint.** Paint-then-revalidate is already how Inventory behaves, so it is a
   known and accepted pattern — but extending it to six more tabs makes it much more
   visible. The existing `asOf` display must be shown for all of them, not only Inventory.
3. **Prefetch contention.** A parallel prefetch would make things worse, not better —
   `max: 3` and a 10-connection role. The 512 s figure in `instrumentation.js` is the
   evidence. Sequential and skip-if-warm are mandatory, not preferences.
4. **Double warming.** `instrumentation.js` already warms three datasets server-side. A
   client prefetch of the same keys is harmless (`inflight` coalesces) but pointless; the
   client should prefer `isReady(key)` and skip.
5. **Filter-driven refetch is not addressed.** Fixed Price and Slow-Moving refetch on every
   filter and page change by design. That is correct behaviour and out of scope here.
6. **The network dominates.** With the link healthy, cold loads are 1–14 s; degraded, the
   same pages took 36 s. Lazy loading reduces *how many* pages pay that cost. It does not
   reduce the cost.

---

## PASS / FAIL

**PASS.** The requested behaviour is achievable with no backend change, no new source of
truth, and no change to any dataset, ranking, precedence or pagination rule.

- The **HTML dashboard already implements it** and should be left alone.
- The **Next app already fetches per tab lazily**; the two remaining gaps are an
  unconditional Inventory fetch (`Shell.jsx:50`) and per-tab state discarded on unmount.
- The server already provides request coalescing (`inflight`), a shared cache
  (`getOrBuild`), a snapshot mechanism, a background warm-up, and a stale-while-revalidate
  pattern proven on Inventory. **All of it is reusable; none of it needs to be created.**

**Nothing was implemented. No code, schema, index or data was modified.**
