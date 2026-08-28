# Postage Inventory Visibility

A single-file dashboard, `dashboard/inventory-dashboard.html`, published to the Varman
AIOS hub (page 218). It refreshes itself from the LEDSone PostgreSQL database every two
hours via cron.

**If you only read one thing:** the live system is `sql/refresh/`. Everything under
`_archive/` is the historical record of how the dashboard reached its current state. No
archived file runs, and deleting the whole folder would not break the refresh — it is
kept because each script is the reproducible proof behind an `evidence/` document.

## The live system

```
dashboard/inventory-dashboard.html   THE DELIVERABLE. Everything else exists to produce it.

sql/refresh/                         the 2-hourly refresh
  refresh.sh                         cron entry point: pre-flight -> build -> price -> apply
  db.js                              the ONLY credential reader (reads the gitignored .env)
  raw-arrays.js                      reads the embedded arrays as they are ON DISK
  rules.js                           loads the page's own CLASSIFY / CATS / prefix rules
  extract/*.js                       read-only queries: products, stock, containers, history, price
  build.js                           assembles every data block into out/ as JSON
  apply.js                           validates a temp file, then swaps it in atomically
  query-equivalence.js               pre-flight: old query form vs new, against one snapshot
  prefix-table.json                  induced classification rules, 100% reproduction required

  compare-*.js, dryrun-classify.js, random-check.js, show-new-sku.js,
  validate-sources.js, derive-prefix-table.js
                                     diagnostics. Run by hand, never by refresh.sh.

sql/build-shopify-comments.js        price + Comments builder, called by refresh.sh
sql/product-history-parser.js        the four approved History types
sql/accessory-names.txt              hand-maintained: SKU -> plain-English accessory name
sql/live-skus.txt                    input for the refresh diagnostics above

validation/smoke-render.js           renders the page headless and counts every section
validation/diff-dashboard.js         proves a refresh changed ONLY the data blocks
validation/verify-locks.js           guards the locked sections

hub/                                 publish to the Varman AIOS hub
evidence/                            numbered findings, one per investigation
data-maps/                           field -> warehouse -> column mappings
daily_logs/                          per-day work log
```

## Generated, never committed

`logs/`, `sql/refresh/out/`, `dashboard/*.bak`, `sql/refresh/compare-*.json`, `.env`.
All are reproduced by the next run.

## The archive

| folder | what it holds |
|---|---|
| `_archive/apply-scripts/` | one-off scripts, each of which made one past change to the dashboard |
| `_archive/extraction-queries/` | the ad-hoc SQL used to discover and extract each section |
| `_archive/extracted-snapshots/` | the JSON/txt those scripts consumed, superseded by `sql/refresh/out/` |
| `_archive/one-off-checks/` | validation scripts written to verify a single past task |

One caveat: `sql/build-shopify-comments.js` defaults to `sql/dashboard-skus.txt` and
`sql/shopify-*.json` when run with no environment. Those defaults now live in
`_archive/extracted-snapshots/`. `refresh.sh` always sets `SKUFILE`, `LISTING` and
`OUTDIR`, so the live path is unaffected; a bare hand-run needs those variables set.

## Running it

```bash
sql/refresh/refresh.sh              # the whole pipeline, exactly as cron runs it
node validation/smoke-render.js     # row and section counts
node validation/diff-dashboard.js dashboard/inventory-dashboard.html.bak
tail -40 logs/refresh.log
crontab -l                          # 0 */2 * * * .../sql/refresh/refresh.sh
```
