# Postage Inventory Visibility - Handover

Project name: `postage_inventory_visibility` (project code `INV-PIV`). Folder: `/home/led-247/POSTAGE-INVENTORY-VISIBILITY`.
Developer leaving: Sarujanan (Git author `sarujanandigitweb-developer`). Re-verified against code, git and logs on 2026-10-05
(original handover written 2026-09-16; this version supersedes it and keeps its content, folded into the 13-section structure).

## 1. Project Overview

Stock, dispatch, container and postage visibility for the LEDSone Postage & Warehouse team, built on a **read-only** connection to the
LEDSone PostgreSQL database. Nothing in this project writes to that database (no INSERT/UPDATE/DELETE/DDL anywhere; the role cannot).
The only write target is the Varman AIOS hub table that holds the published page.

Three deliverables:

| Deliverable | What it is | Runs where |
|---|---|---|
| `dashboard/inventory-dashboard.html` | **The published, LIVE dashboard.** One ~13 MB HTML file, all data embedded as `const` arrays. Rebuilt every 2 hours by cron and upserted to the Varman AIOS hub as page **218**, slug `postage-inventory-visibility`. This is what the Postage & Warehouse team actually uses. | this machine's cron -> hub |
| `postage-inventory/` (**v1**) | Next.js 15 app, same tabs, each querying PostgreSQL via its own API route. **The deployed app** (Vercel). | `localhost:3020`, Vercel |
| `postage-inventory-v2/` (**v2**) | Copy of v1 with server-side pagination and a non-blocking stale-while-revalidate cache. **Not deployed.** | `localhost:3021` only |

**Which version is live:** the HTML dashboard (cron-built, hub page 218) is the working production deliverable (last publish verified
2026-10-05 04:36 UTC). Of the two apps, **v1 is live/deployed; v2 is staging only** (per `postage-inventory-v2/README.md`, the root README,
and the absence of any v2 deployment config; the Vercel project itself lives in the Vercel dashboard and could not be verified from this machine).

## 2. Final Status

| Item | Status |
|---|---|
| Published dashboard + 2-hourly refresh | Complete / running. Cron still firing as of 2026-10-05 (last RESULT OK 04:37 UTC, 6,239 rows, 13,568,836 bytes, sha256 verified against hub) |
| v1 app | Complete, deployed on Vercel (not verifiable locally) |
| v2 app | Staging; pagination done and measured; not promoted |
| Dispatch-status fix (`No Carrier Data`) | **Known limitation** - done in v1 only; dashboard and v2 still invent `Label Created` |
| Tracking data for DHL/Evri/DPD/UPS | **External dependency** - owned by another team, nothing in this repo can fix it |
| Daily logs | Lapsed after 2026-09-08 (work continued to 2026-09-15) |

Overall: **Complete with Known Limitations / External Dependency.**

## 3. Latest Updates

From `git log` (38 commits, HEAD `4e346f3`, in sync with `origin/main`, **last commit 2026-09-15**):

| Date | Commit | Change |
|---|---|---|
| 2026-09-15 | `4e346f3` | **Final change.** v1 `recent-dispatch` route stops inventing a status: where `shipment_tracking_log` has no row it now says `No Carrier Data` (was `Label Created`). Adds `.bdg.nodata` CSS rule in v1 `app/theme.css`, `RecentlyDispatchedTab.jsx` tweaks. Dashboard HTML refreshed. |
| 2026-09-11 | `936ca40`, `8f03feb` | v2: server-side pagination for the remaining tabs; cache that never blocks a reader (`lib/query.js`, `lib/dispatch-filter.js`, `lib/dataset.js`). Daily logs REQ-12/13 and SKILL.md updated. |
| 2026-09-10 | `43290e1`, `1310654` | `recent-dispatch.json` cache added; refactors. |
| 2026-09-07 | `1b0b42e`, `06c635e`, `3062970`, ... | Shared catalogue to cut product/image queries; accessory names + Shopify price handling; SKU classification + order export; performance evidence docs (`docs/performance/`). |
| 2026-09-04 | `ade4367`, `e4b2daf`, `acb8feb`, ... | Snapshots (17 built at `prebuild`); data-dir resolution fix for Vercel; history parser bundled; temporary `/api/_diag` route added (no longer present in the tree). |
| 2026-09-03 | `838cf52` | Container details tab. |
| 2026-09-01 | `520522e` | Next.js app initialised with PostgreSQL integration. |
| 2026-08-28 | `b6cfd4b`, `baa2817` | Refresh pipeline (`sql/refresh/`), SKU Fixed Price tab. |

**Latest working implementation:** cron pipeline `sql/refresh/refresh.sh` rebuilding `dashboard/inventory-dashboard.html` and publishing to hub page 218; v1 app on `:3020` / Vercel with the `No Carrier Data` fallback.

**Since the last commit (uncommitted, `git status` 2026-10-05):**
* `dashboard/inventory-dashboard.html` modified - expected, every cron refresh changes it (data-as-of 2026-10-05T04:36:50Z).
* Modified docs: `README.md`, `postage-inventory/README.md`, `postage-inventory-v2/README.md`, `.claude/skills/postage-inventory/SKILL.md`, `daily_logs/README.md`, `data-maps/ledsone-mcp-data-structure-map.md`.
* Untracked: `docs/README.md`, `example.env`, `handover/` (this file). **The 2026-09-16 documentation rewrite is not committed** - review and commit it.

## 4. Project Structure / Important Files

```
dashboard/inventory-dashboard.html   published deliverable (hand-maintained layout/CSS/JS + 29 generated data regions)
  .backup-before-container-tab.html  manual backup 2026-09-03; nothing reads it
  inventory-dashboard.html.bak       written by apply.js each run (rollback copy)
sql/refresh/                         2-hourly pipeline
  refresh.sh                         cron entry point (9 stages, flock lock at logs/refresh.lock)
  query-equivalence.js               pre-flight: old vs new query form
  build.js + extract/*.js            10 read-only extracts (stock, products, history, containers, container-details,
                                     price, fixed-price, slow-moving, recent-dispatch, pending-dispatch) -> out/*.json
  apply.js  raw-arrays.js            splice into temp copy, validate, backup, atomic swap, rollback
  rules.js  daynum.js  db.js         classification rules, day numbers, the ONLY credential reader
  compare-*.js, validate-sources.js, derive-prefix-table.js ...  hand-run diagnostics, not on live path
sql/build-shopify-comments.js        Shopify price + alt price + Comments (5-tier rule)
sql/product-history-parser.js        four approved history types
sql/accessory-names.txt              hand-maintained SKU -> plain-English name
hub/publish.sh push_to_hub.js        upsert HTML into varman_aios.hub_pages (page 218)
hub/verify.sh verify_page.js         read back, compare sha256
hub/rename_slug.js                   hand-run only
validation/                          validators + discovery notes; 4 gate every publish
postage-inventory/                   v1 Next.js app (app/api/{inventory,recent-dispatch,pending-dispatch,container-details,fixed-price,slow-moving,postage,meta}, components/, lib/, scripts/)
postage-inventory-v2/                v2 copy (adds lib/query.js, lib/dispatch-filter.js)
.claude/skills/postage-inventory/SKILL.md   accumulated list of traps - READ FIRST
docs/performance/  evidence/ (54 findings)  data-maps/  daily_logs/ (stops 2026-09-08)  documentation/   historical, dated
_archive/                            dead code, kept as proof
capability/ closure/ prompts/ workflows/   empty scaffolding
example.env                          credential template (variable names only)
```

## 5. Data Sources / Database Tables

* **LEDSone PostgreSQL** (`ledsone` DB, role `tech_user`, SSL required, read-only; **connection limit 10 for the whole role**, shared with pgAdmin and cron). Env: `LEDSONE_HOST/PORT/DB/USER/PASSWORD/SSLMODE` in the repo-root `.env` (git-ignored). Read by `sql/refresh/db.js` and the apps' `lib/pg-core.js`. No CREATE on the `inventory` schema, so no tables/views/indexes can be added (asked and declined).
* Tables used (from code): `inventory.products`, `inventory.physical_product_stock`, `inventory.product_history`, `inventory.warehouse`, `inventory.product_images`, `inventory.product_pk`; `order_management.order_item_info`, `orders`, `order_info`, `order_combo`, `shipment`, `carrier_service`, `sub_source`, `source`, `market_place`, `shipment_tracking_log`. (`smoke.mjs` checks 22 tables.)
* **Varman AIOS hub database** - `varman_aios.hub_pages`, page 218. Env `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD` in the same `.env`; `hub/publish.sh` composes a URL at run time and unsets it.
* **Google Sheets** (three Postage Information workbooks, ids in `postage-inventory/lib/sheet.js`) - read live by `/api/postage` (Postage tab). Works even when the DB is down.
* `order_management.shipment_tracking_log` is filled by an **external tracking sync, not in this repo, owned by another team** (team not named in docs).
* Dead files: `data/price.json`, `price-alt.json`, `price-comments.json` (written by the sync script, read by nothing; price derived live).

## 6. Current Workflow / Architecture

`refresh.sh` stages (any failure before the swap = nothing published, previous page stays up):
1. `query-equivalence.js` pre-flight must print `QUERY-EQUIVALENCE: PASS`
2. `build.js` - one connection, 10 extracts -> `out/*.json` (hard-fails if `_meta.json` missing)
3. writes `out/dashboard-skus.txt`
4. `sql/build-shopify-comments.js`
5. `apply.js` - splice 29 generated regions (15 SKU arrays + 13 object blocks + `INC_CONTAINER`) and two timestamps into a `.tmp`, validate, back up to `.bak`, atomic rename; rollback on failure. Floors: `FLOOR_ROWS=5000`, `FLOOR_BYTES=2 MiB`; publish refuses < 100 KB.
6. `validation/smoke-render.js` on the swapped file (restores `.bak` on failure)
7. `hub/publish.sh` (`OK-NOPUBLISH` if it fails, no rollback)
8. `hub/verify.sh` sha256 compare (`OK-NOVERIFY`)
9. row count -> `RESULT` line in `logs/refresh.log`

Only generated regions change on refresh; layout, CSS, legend and tab JS are hand-maintained inside the HTML.

Business rules (not re-derivable from code; measured against previous output before every change): five-tier Shopify price match (LEDSone channel first, then other UK listings), three-source movement fallback, curated SKU classification (`rules.js`; prefix table derived fresh in `build.js`), marketplace precedence, recent-dispatch window `WINDOW_DAYS` (validator reads it from the extract), dispatch status = carrier status from the tracking log, `Dispatched - No Tracking` when no tracking number.

Apps: each tab calls an API route -> `lib/dataset.js` (TTL cache, `LEDSONE_DATA_TTL` read once at module load) -> `lib/pg-core.js` (pool max 1 on Vercel/Lambda, 3 elsewhere). v1 `prebuild` runs `sync-data` and builds 17 snapshots (`data/snapshots/`, gitignored). v2 adds server-side page/sort/filter (`lib/query.js`), page sizes 25/50/100/250, stale-while-revalidate cache and keep-warm sweep.

Schedule (this laptop's crontab, verified 2026-10-05):
```
CRON_TZ=Asia/Colombo
0 */2 * * * /home/led-247/POSTAGE-INVENTORY-VISIBILITY/sql/refresh/refresh.sh
```
Real runs land at :30 UTC between ~04:30 and 12:30 UTC; the machine is shut down at 18:00 local, so the last run is often cut off. A day with no runs is normal and the page may be up to a day stale.

## 7. How to Run

```bash
cd /home/led-247/POSTAGE-INVENTORY-VISIBILITY
cp example.env .env                      # fill LEDSONE_* and PG* (real values from the DBA/Varmen and DWC)
node postage-inventory/sql/smoke.mjs     # proves DB + 22 tables

cd postage-inventory && npm install && npm run dev        # v1 http://localhost:3020
cd ../postage-inventory-v2 && npm install && npm run dev  # v2 http://localhost:3021
npm run build && npm start                                # production mode (3020 / 3021)
```
Pipeline (WARNING: publishes to the hub - never run casually): `sql/refresh/refresh.sh`; log: `tail -40 logs/refresh.log`.
There is no root `node_modules`; the pipeline uses `NODE_PATH=/home/led-247/Returns-Reason-Hotspot-Report/scripts/node_modules`.

## 8. Refresh / Deployment Process

* **Dashboard:** automatic every 2 hours via cron (above). Manual: `sql/refresh/refresh.sh` (publishes!). Hub steps: `hub/publish.sh`, `hub/verify.sh`. A run takes 5-8 minutes (DB latency ~170 ms, intermittently much worse).
* **v1 app:** deployed to Vercel from `postage-inventory/`. No `vercel.json`, Dockerfile or CI in the repo; project settings (including the five `LEDSONE_*` env vars) live in the Vercel dashboard. Vercel account owner: **Not documented / could not verify**.
* **v2:** local only, no deployment.
* **Git:** `origin` = `github.com/sarujanandigitweb-developer/POSTAGE-INVENTORY-VISIBILITY`, branch `main`, repo-local git identity. `.cache/` folders of both apps are tracked, so cache JSON appears in commits.
* If moving to a server: change the cron line, both `NODE_PATH`s, and the hub scripts' fallback `.env` path.

## 9. Validation Completed

* Equivalence standard met earlier: 64,535 field comparisons across four sections, 0 differences.
* `query-equivalence.js` runs as pre-flight every cron cycle (evidence 52).
* Four validators gate every publish (run by `apply.js`): `smoke-render.js`, `check-tabs-wired.js`, `check-tab-menu.js`, `check-recent-dispatch.js`.
* Hand-run: `check-postage`, `check-pending-dispatch`, `check-fixed-price`, `check-container-details`, `check-csv-export`, `check-first-paint`, `check-day-numbers`, `check-slow-moving`, `check-responsive`, `check-table-height`, `check-tab-memory`, `verify-locks.js`, `diff-dashboard.js`.

```bash
for c in check-postage check-recent-dispatch check-pending-dispatch check-fixed-price \
         check-container-details check-csv-export check-first-paint check-day-numbers; do
  DASHBOARD=dashboard/inventory-dashboard.html node validation/$c.js
done
node validation/smoke-render.js; node validation/verify-locks.js
node validation/diff-dashboard.js dashboard/inventory-dashboard.html.bak
```
* Log evidence (2026-10-05): 117 RESULT lines, latest OK with hub sha256 "VERIFIED"; 12 `RESULT FAILED`, all pre-flight "query equivalence did not pass" (nothing published, designed behaviour).
* Rule: a validator that hard-codes a business value will roll back the next cron run; make checks read values from source.
* No committed automated test suite exists for v2.

## 10. Known Issues / Dependencies

1. **Dispatch status inconsistency.** v1 `postage-inventory/app/api/recent-dispatch/route.js:159` gives `No Carrier Data`; v2 `route.js:185` and `sql/refresh/extract/recent-dispatch.js:158` (published dashboard, 2,621 values) still give `Label Created`. Fix = edit the extract + the dashboard's legend, CSS and `rdStCls` + update `validation/check-recent-dispatch.js`; v2 also lacks v1's `.bdg.nodata` CSS rule. Planned, not done.
2. **External tracking sync** (other team): DHL, Evri, DPD, UPS have 0 rows in `shipment_tracking_log`; only 13-char Royal Mail numbers are ingested (94% RM coverage); ~2-3% of existing statuses contradict their last event.
3. `INCOMING` is plan-dependent (`SELECT DISTINCT` without `ORDER BY`, last-write-wins; e.g. `CL2RAG`). Deliberately unfixed; the fix changes 146 rows and needs a business decision.
4. v2 `instrumentation.js:60` warm-up defaults to port 3020 while v2 runs on 3021 (hits v1 if `PORT` unset). v2 `package.json` name is still `postage-inventory`.
5. **Cross-project dependency:** `NODE_PATH` and the fallback `.env` point at `/home/led-247/Returns-Reason-Hotspot-Report` (present today). If moved or deleted, refresh and publish break.
6. **Laptop-hosted cron:** no refresh while the machine is off.
7. DB connection limit 10: an open pgAdmin Dashboard tab makes every Vercel DB route return 500 `too many connections for role "tech_user"` (`/api/postage` still works).
8. Stray empty `.refresh.lock` in the project root (2026-09-01, safe to delete); the live lock is `logs/refresh.lock`.
9. Credentials live only in the git-ignored `.env` (mode 600); no hard-coded secrets found in tracked scripts (pattern grep). Rotate credentials on handover.
10. Daily logs stop 2026-09-08. Documentation changes are uncommitted (section 3).

External dependencies: LEDSone PostgreSQL, Varman AIOS hub DB, Vercel, GitHub, three Google Sheets, the tracking-sync team.

## 11. Backup Person / Owner

* Backup developer: **Not documented.**
* Documented owners/contacts (from the original handover): assigned by **Varmen**; DB access via the DBA / Varmen; hub `PG*` access via **DWC**; Vercel via "the account owner" (not named); Google Sheets via the Postage & Warehouse team; tracking sync owned by "another team" (not named).
* Users: LEDSone Postage & Warehouse team.

## 12. Troubleshooting

| Symptom | Check / fix |
|---|---|
| Dashboard looks stale | `grep RESULT logs/refresh.log \| tail -10`; the machine may have been off. `SKIPPED - a refresh is already running` = lock held (`logs/refresh.lock`, flock). |
| `RESULT FAILED ... query equivalence did not pass` | Pre-flight refused; previous page is still live (not an outage). Read that run's head in `logs/refresh.log` for the section that DIFFERS. |
| `OK-NOPUBLISH` / `OK-NOVERIFY` | Hub step failed; check `PG*` in `.env`, run `hub/verify.sh`. |
| Vercel DB routes all 500 | Close pgAdmin Dashboard tabs (connection limit 10). |
| `__webpack_modules__[moduleId] is not a function` | `npm run build` ran during `next dev`; stop dev, `rm -rf .next`. |
| Cache seems broken | `LEDSONE_DATA_TTL` is read once at start; check dev server env: `tr '\0' '\n' < /proc/<pid>/environ \| grep LEDSONE`. |
| Refresh cannot find modules | Returns-Reason-Hotspot-Report `scripts/node_modules` missing; give this repo its own and edit `NODE_PATH`. |
| User says "SKU X status wrong" | Check what the database says for that row first, then each deliverable; they can legitimately disagree (Known Issue 1). |
| Never | run `pkill -f` (killed its own shell twice); run `refresh.sh` casually. |

## 13. Final Handover Notes

* Read `.claude/skills/postage-inventory/SKILL.md` and the root README before the first change. Prove output unchanged field by field before shipping.
* Suggested order: (1) carry the `No Carrier Data` fix to the extract/dashboard/v2; (2) escalate the tracking sync to its owners; (3) decide whether v2 replaces v1; (4) give the repo its own `node_modules`; (5) decide on `INCOMING`; (6) commit the pending documentation.
* Obtain the five accesses before day one: LEDSone DB, hub DB, Vercel, GitHub, Google Sheets. None are in git.
* Weekly: write the daily log (format in `daily_logs/README.md`).
* Handover file status: the existing `handover/HANDOVER.md` was verified against code, git and logs and updated; it was renamed to this canonical file (README references fixed).
