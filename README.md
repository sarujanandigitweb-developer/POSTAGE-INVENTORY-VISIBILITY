# Postage Inventory Visibility

Stock, dispatch, container and postage visibility for the LEDSone Postage & Warehouse
team, built on a **read-only** connection to the LEDSone PostgreSQL database.

Nothing in this project writes to that database. There is no INSERT, UPDATE, DELETE or
DDL anywhere in the pipeline or either app, and the role it connects as could not run one
if it tried.

## Three deliverables

| | What it is | Where it runs |
|---|---|---|
| `dashboard/inventory-dashboard.html` | **The published dashboard.** One 13 MB HTML file with every figure embedded as `const` arrays. Rebuilt every 2 hours by cron and pushed to the Varman AIOS hub as page **218**, slug `postage-inventory-visibility`. | this machine's cron → the hub |
| `postage-inventory/` | **The Next.js app.** Same tabs, but each one queries PostgreSQL through its own API route. | `localhost:3020`, and Vercel |
| `postage-inventory-v2/` | **A copy of the app** carrying server-side pagination and a cache that never blocks a reader. Not deployed. | `localhost:3021` |

The published dashboard is the deliverable the team actually uses. The apps are the
newer path; **v1 is the one that is deployed** — treat v2 as the staging ground, and read
[the v2 README](postage-inventory-v2/README.md) before assuming the two behave alike.

## Start here

**Taking this project over? Read [handover/postage_inventory_visibility_handover.md](handover/postage_inventory_visibility_handover.md) first** —
the five accesses you need, what runs on this machine, and the open work in priority order.

```bash
cp example.env .env          # then fill in the real values — see "Credentials" below
node postage-inventory/sql/smoke.mjs        # proves the database is reachable

cd postage-inventory && npm install && npm run dev      # http://localhost:3020
```

To see the published pipeline run end to end:

```bash
sql/refresh/refresh.sh       # ⚠️ this PUBLISHES to the hub. Never run it casually.
tail -40 logs/refresh.log
```

## The one rule

**Prove the output did not change.** Every row on both deliverables is derived through
business rules that took weeks to establish and are not re-derivable from the code alone
— a five-tier price match, a three-source movement fallback, a curated SKU classification.
A change that "looks equivalent" is not equivalent until it has been measured against the
previous output, field by field. The bar that has been met before: 64,535 field
comparisons across four sections with 0 differences.

`.claude/skills/postage-inventory/SKILL.md` carries the traps that have already cost days.
Read it before changing anything.

## Repository map

```
dashboard/inventory-dashboard.html   the published deliverable
  .backup-before-container-tab.html  a manual backup from 2026-09-03; nothing reads it

sql/refresh/                         the 2-hourly pipeline
  refresh.sh                         cron entry point — the 9 stages below
  query-equivalence.js               pre-flight: old vs new query form, same snapshot
  build.js                           runs all 10 extracts, writes out/*.json
  extract/*.js                       the 10 read-only extracts, one per tab/section
  raw-arrays.js                      reads the embedded arrays as they are ON DISK
  rules.js  daynum.js  db.js         classification rules · day numbers · the ONLY
                                     credential reader
  apply.js                           splices data into a temp copy, validates, swaps
                                     atomically, rolls back on failure
  out/                               generated every run, gitignored
  compare-*.js dryrun-classify.js random-check.js show-new-sku.js
  validate-sources.js derive-prefix-table.js prefix-table.json
                                     hand-run diagnostics. NOT on the live path — the
                                     live table is derived fresh in build.js

sql/build-shopify-comments.js        Shopify price + alt price + Comments (5-tier rule)
sql/product-history-parser.js        the four approved history types
sql/accessory-names.txt              hand-maintained SKU -> plain-English name

hub/publish.sh  push_to_hub.js       upsert the HTML into varman_aios.hub_pages
hub/verify.sh   verify_page.js       read it back and compare sha256
hub/rename_slug.js                   hand-run only

validation/                          17 validators; 4 gate every publish (see below)
postage-inventory/                   the Next.js app  (see its README)
postage-inventory-v2/                the pagination copy (see its README)

docs/performance/                    dated investigations, point-in-time (see docs/README.md)
evidence/                            54 numbered findings; later ones say what they supersede
data-maps/                           sheet <-> database field mappings
daily_logs/                          per-day work log; stops at 2026-09-08, see its README
_archive/                            nothing here runs (see its README)
documentation/                       one early discovery report
handover/postage_inventory_visibility_handover.{md,html}              access, ownership and open work for the next developer
capability/ closure/ prompts/ workflows/             empty scaffolding folders
logs/                                refresh.log and the live refresh.lock — gitignored
```

There is also a stray empty `.refresh.lock` in the project root, dated 2026-09-01. The
lock the pipeline actually uses is `logs/refresh.lock`; the root one is left over and
safe to delete.

## How the published dashboard is rebuilt

`sql/refresh/refresh.sh`, in order. Any stage failing before the swap means **nothing is
published** and the previous page stays up.

| # | Stage | Fails how |
|---|---|---|
| 1 | `query-equivalence.js` pre-flight | must print `QUERY-EQUIVALENCE: PASS`, else abort |
| 2 | `build.js` — one connection, 10 extracts → `out/*.json` | hard-fails if `_meta.json` is missing |
| 3 | writes `out/dashboard-skus.txt` | — |
| 4 | `sql/build-shopify-comments.js` with `LISTING`/`SKUFILE`/`OUTDIR` set | — |
| 5 | `apply.js` — splice into a `.tmp`, validate it, back up, atomic rename | rolls back |
| 6 | `validation/smoke-render.js` on the swapped file | restores the `.bak`, RESULT FAILED |
| 7 | `hub/publish.sh` | status `OK-NOPUBLISH`, no rollback |
| 8 | `hub/verify.sh` — sha256 of the published row vs local | status `OK-NOVERIFY` |
| 9 | row count for the RESULT log line | — |

`apply.js` splices **29 generated regions** (15 SKU arrays + 13 object blocks +
`INC_CONTAINER`) and two timestamp strings. Everything else in the HTML — the layout,
the CSS, the legend, the tab JavaScript — is hand-maintained in the file itself and
survives a refresh untouched. Floors that refuse a bad build: `FLOOR_ROWS = 5000`,
`FLOOR_BYTES = 2 MiB`, and the publish step refuses a file under 100 KB.

**Four validators gate every publish**, run by `apply.js` against the temp file:
`smoke-render.js`, `check-tabs-wired.js`, `check-tab-menu.js`, `check-recent-dispatch.js`.
The other 13 in `validation/` are run by hand.

> A validator that hard-codes a business value will **roll back the next cron run**. When
> you change a business value, change the check to read it from source. This has happened:
> `check-recent-dispatch.js` asserted a 3-day window and had to be taught to read
> `WINDOW_DAYS` out of the extract instead.

## Operational reality

**The refresh only runs while this machine is on.** `crontab -l` has
`0 */2 * * * .../sql/refresh/refresh.sh` under `CRON_TZ=Asia/Colombo`, so log timestamps
(UTC) land on `:30`. In practice runs appear only between 04:30 and 12:30 UTC — the
working day — and the 12:30 run is repeatedly cut off mid-flight (10, 14 and 15 September
all show a started run with no RESULT line) because the machine is shut down at 18:00
local. **A day with no runs is not a fault, and the published page can be a day old.**

Last verified good publish at the time of writing: **2026-09-15 10:36 UTC**, 6,189 rows,
13,316,218 bytes, sha256 verified against the hub.

A run takes **5–8 minutes**, almost all of it waiting on the database.

## Credentials

One gitignored `.env` at the repo root serves everything. Copy `example.env` and fill it
in; variable names are documented there.

* `LEDSONE_*` — the LEDSone database, read by `sql/refresh/db.js` and by the apps'
  `lib/pg-core.js`. The role is `tech_user`.
* `PG*` — the **hub** database. `hub/publish.sh` composes `HUB_DB_URL` from these five
  keys at run time, exports it for one command, and unsets it. It is never stored.

Two hazards worth knowing before you move anything:

1. `refresh.sh` and the hub scripts set `NODE_PATH` to
   **`/home/led-247/Returns-Reason-Hotspot-Report/scripts/node_modules`** — another
   project's folder — because this repo has no root `node_modules`. If that repo is
   deleted or moved, the refresh and the publish both break.
2. Both hub scripts fall back to **that same repo's `.env`** if this one is unreadable.

## The database

`169.58.91.229`, database `ledsone`, role `tech_user`, SSL required. Read-only in
practice: no CREATE on the `inventory` schema, so no tables, views or indexes can be
added — this has been asked for and declined.

**Connection limit 10 for the whole role**, shared with pgAdmin and the cron refresh.
That number is the single most operationally important fact in this project:

> Leaving **pgAdmin's Dashboard tab** open pins the role at 10/10 — it opens a fresh
> connection every 1–2 minutes — and every database-backed route on Vercel then returns
> **500 `too many connections for role "tech_user"`**. `/api/postage` keeps working,
> because it reads a Google Sheet. If the deployed app 500s, check this first.

The link is remote (~170 ms) and degrades intermittently: the same query has been measured
at 1,770 ms and, hours later, 23,948 ms, while server-side execution stayed at 150 ms.
**Never state a performance number that was not measured in the same session**, and
interleave before/after timings rather than taking them hours apart.

## Known issues and open work

**1. Dispatch status is missing for four carriers.** The external tracking sync that
fills `order_management.shipment_tracking_log` — *not in this repo, owned by another team*
— only ingests 13-character Royal Mail numbers. Measured over completed orders in the last
14 days:

| Carrier | Orders | Have a carrier status |
|---|---|---|
| Royal Mail | 3,778 | 3,561 (94%) |
| DHL | 1,484 | **0** |
| Evri | 1,159 | **0** |
| UPS | 182 | **0** |
| DPD | 160 | **0** |

Where a status does exist it agrees with its own last carrier event 14,057 times out of
14,458 (97%); the 320 disagreements are mostly delivered parcels still reading `Intransit`.
**Neither deliverable can fix this** — the fix belongs in the sync job.

**2. The two apps now disagree about that, and so does the dashboard.** The v1 app was
changed on 2026-09-15 (`4e346f3`) to stop inventing a status: where the log has no row it
now says **`No Carrier Data`**. The published dashboard still carries **2,621**
`"Label Created"` values it made up, and v2 still has the old fallback.

| | fallback when the tracking log has no row |
|---|---|
| `postage-inventory/app/api/recent-dispatch/route.js:159` | `No Carrier Data` ✅ |
| `postage-inventory-v2/app/api/recent-dispatch/route.js:185` | `Label Created` ❌ |
| `sql/refresh/extract/recent-dispatch.js:158` (the published dashboard) | `Label Created` ❌ |

Carrying the change across means editing the extract **and** the dashboard's own legend,
CSS and status-class function, then updating `validation/check-recent-dispatch.js`. It was
planned and not done.

**3. `INCOMING` is plan-dependent.** `SELECT DISTINCT` with no `ORDER BY`, read
last-write-wins, in the inventory route. `CL2RAG` has two pending containers and which one
surfaces depends on the query plan. The original app *and* the pipeline both carry it, so
the published dashboard shows an arbitrary one too. **Deliberately not fixed** — fixing it
changes 146 rows and needs its own decision.

**4. v2's boot warm-up calls the wrong port.** `instrumentation.js:60` defaults to
`PORT || 3020`, but v2 runs on 3021, so with `PORT` unset its warm-up requests hit v1.

**5. Daily logs stop at 2026-09-08** while work continued to 09-15. See
[daily_logs/README.md](daily_logs/README.md) for what happened in the gap.

## Documentation map

| Folder | Status |
|---|---|
| this README, `postage-inventory/README.md`, `postage-inventory-v2/README.md`, `.claude/skills/postage-inventory/SKILL.md`, `example.env` | **Living.** Kept in step with the code. Change them when you change behaviour. |
| `docs/performance/`, `evidence/`, `data-maps/`, `documentation/`, `daily_logs/` | **Historical.** Each is dated and true as of that date. Do not rewrite them — later documents say what they supersede. |
| `_archive/` | Dead code, kept as proof behind the evidence documents. |

Read `docs/README.md` before trusting a figure in `docs/performance/`.

## Verifying before you report done

```bash
for c in check-postage check-recent-dispatch check-pending-dispatch check-fixed-price \
         check-container-details check-csv-export check-first-paint check-day-numbers; do
  DASHBOARD=dashboard/inventory-dashboard.html node validation/$c.js
done
node validation/smoke-render.js      # sections rendering the wrong count : 0
node validation/verify-locks.js      # sha256 of every embedded dataset
node validation/diff-dashboard.js dashboard/inventory-dashboard.html.bak
```

For the app, verify in a real browser over CDP rather than trusting a route's JSON —
that is how "the search works" was distinguished from "the request fires but nothing
renders".

## Git

`origin` is `github.com/sarujanandigitweb-developer/POSTAGE-INVENTORY-VISIBILITY`, branch
`main`, currently in sync. Committed as `sarujanandigitweb-developer` — a repo-local
identity, set with `git config user.name`/`user.email`, not the machine's global one.

`dashboard/inventory-dashboard.html` shows as modified whenever a refresh has run since
the last commit. That is expected, not a dirty working tree to worry about.
