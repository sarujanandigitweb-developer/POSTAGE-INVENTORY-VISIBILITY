---
date: 2026-09-04
developer: sarujanan
project: Postage Inventory Visibility
project_code: INV-PIV
phase: >-
  Phase-11 — the Next.js app deployed to Vercel and made to work there; a cross-check against
  the published dashboard found five defects the app had been serving quietly
requirement_id: REQ-11
deliverable_id: D01
status: >-
  Deployed and serving. Six commits (11:33, 12:32, 15:45, 16:57, 17:13, 17:17). Four
  deployments before the app served /api/inventory at all. Three cron runs, all OK. Eight
  files still uncommitted — the dispatch dialogs, the Postage scroll fix and the CSS.
evidence_location: >-
  git 198f4cb, ade4367, a1d5623, e4b2daf, b7b348c, acb8feb; logs/refresh.log;
  postage-inventory/lib/history-parser-impl.js, lib/data-dir.js, lib/comment-label.js,
  lib/type-class.js, lib/export-order.js; components/DispatchDialog.jsx;
  scripts/export-classification.cjs; app/api/slow-moving/route.js; next.config.mjs
blos_keys_used:
  - country_id_has_no_lookup
  - cell_rules_are_table_qualified
  - a_badge_cannot_wrap
  - a_runtime_require_is_invisible_to_a_bundler   (NEW — createRequire is not traceable)
  - a_trace_listing_is_not_proof_of_loading       (NEW — .nft.json lists, it does not load)
  - process_cwd_is_not_the_app_root_when_deployed (NEW — the tracing root decides the layout)
  - a_listing_title_needs_site_and_wrong_sku      (NEW — or a variant option becomes the name)
  - a_shipping_address_arrives_two_days_late      (NEW — the field is pending, not missing)
hardcoded_thresholds:
  - category strip = one line >=1740px, 6+6 above 1000px, scrolling below
  - Price Comment label set = Combined / Pack / Standalone / Unlisted
  - image identity guard applies to comboproducts/ URLs only
  - snapshot build = 17 datasets, ~25 MB
three_am_standard: TRUE
llm_queryable: TRUE
company_knowledge_candidate: TRUE
domain: Inventory — Postage & Warehouse — LEDSone Postgres + two Google workbooks + Vercel
User: Postage & Warehouse Team
Benefit status: >-
  Partial — the hosted dashboard works instead of erroring and the Slow-Moving report now
  shows real product names, but the deployment still queries the database on every cold
  start because the build is not producing snapshots.

---

## 1. SYSTEM STATE

Start: the Next.js app ran locally only, and the one deployment attempt answered every
Inventory request with an error page. End: **the app is deployed and every page loads**, its
Slow-Moving data matches the published dashboard exactly, and four category filters that
appeared to work but returned nothing are fixed.

## 2. WHAT CHANGED TODAY

**The app was deployed to Vercel and made to work there.** Four deployments were needed
before `/api/inventory` returned anything but a 500.

**A cross-check against the published dashboard** compared filters, search, detail dialogs and
the underlying data. It found five defects the app had been serving without complaint.

**The Dispatch detail dialogs were rebuilt to the dashboard's format** — four named blocks in
the same order on both tabs, with Print, Export and copy buttons.

**Postage Information became reachable.** It was the only tab with no scroll region.

**Inventory got the dashboard's Type badge**, a smaller image zoom, table sizing from the
responsive tokens instead of fixed pixels, a three-tier category strip, and a Price Comment
column reduced to one word with the sentence behind a click. A favicon was added.

## 3. THE DEPLOYMENT — THREE FAULTS, EACH INVISIBLE LOCALLY

**A runtime require is invisible to a bundler.** `lib/history-parser.js` loaded the parser
with `createRequire(import.meta.url)`. That resolves at runtime, so webpack could not follow
it: the wrapper was left unbundled and its sibling `.cjs` was never copied beside it.

```
Error: Cannot find module './history-parser.cjs'
Require stack: /vercel/path0/postage-inventory/lib/history-parser.js
```

The import fails **before the route's own try/catch**, so Next answered with an HTML 500 —
which the browser reported as `Unexpected token '<', "<!DOCTYPE"... is not valid JSON`. Only
`/api/inventory` imports that parser, which is exactly why it was the one route failing.

**Two local checks said it was fine and both were worthless as evidence.** `next dev` resolves
from the real directory, so the require always succeeds locally; and the `.nft.json` trace
*listed* the `.cjs`, which says nothing about whether the deployed bundle can load it. The
parser is now plain ESM, statically re-exported, and verified byte-identical on samples
captured from the `.cjs` first.

**`process.cwd()` is not the app root once deployed.** Next copies traced files into a
function laid out relative to its inferred **tracing root**; with the app in a subfolder of a
larger repo that root can be the repository root, so files land under
`<bundle>/postage-inventory/data/` while the function's cwd is `<bundle>`. `lib/data-dir.js`
now finds the directory rather than assuming it. Pinning `outputFileTracingRoot` looks like
the obvious fix and **fails the build outright** at "Collecting build traces" — a note in
`next.config.mjs` records that so nobody tries it again.

**Data files are not traced at all without being asked for.** Every data path is built at
runtime, so the tracer sees no reference; `outputFileTracingIncludes` was added, and verified
in the build output rather than assumed — 22 data files per route.

**A diagnostic that could never have worked.** To settle the above I added `/api/_diag` to
make the function report its own filesystem. An underscore-prefixed folder is a **private
folder** in the App Router and is never routed; it 404'd. The Vercel runtime log answered it
instead — and should have been asked for far sooner than the fourth deployment.

## 4. GAP FOUND — A LISTING TITLE NEEDS BOTH ITS GUARDS

Slow-Moving product names were foreign-language variant fragments: `Schwarz / Ja`,
`Argent brossé / Non`, `Typ 8`. The route's title queries were missing **both** guards the
refresh pipeline applies:

- **`site='UK'`** — without it a German or French listing wins the name, and those titles are
  variant **options**, not product names.
- **`COALESCE(wrong_sku,0)=0`** — a listing flagged `wrong_sku` has a known-bad SKU mapping.
  Taking its title puts a different product's name against this SKU.

`bandq_listings` was missing from the chain entirely, so eBay was promoted into B&Q's slot;
images came from one source where the dashboard uses five; and the **miscaptioned-combo
guard** was absent, including on the catalogue's own images, which the dashboard does guard.

| On the same 16,444 SKUs | dashboard | before | after |
|---|---|---|---|
| names that differ | — | 7,170 | **0** |
| images that differ | — | 3,085 | **0** |
| no product name | 524 | 4,759 | **524** |
| no image | 138 | 3,189 | **138** |

**A second gap, in the export rather than the app.** `scripts/export-classification.cjs`
matched a family entry of **exactly three** array elements. The four newest sections —
Cosmetics, Clothes, Home Appliances and **Refurbished** — write a fourth, the SKU prefix. No
match, no error, **zero families** for exactly those four; their dropdowns offered nothing but
"All …". 32 families restored. The same run caught the app trailing the dashboard by two SKUs
(Ceiling Rose 383→384, Lighting 563→564).

## 5. VALIDATION — WHAT THE CROSS-CHECK PROVED CLEAN

Not everything suspected was a defect, and saying so matters as much as the finds:

- **Container Details** — 36 of 36 containers, **every one of 17 fields identical**, and the
  default date order matches row for row.
- **Fixed Price** — 30,242 rows both sides, **every marketplace price matching on every SKU**.
- **Recent Dispatch dates** — a 100% "difference" that was two representations of one value;
  all 2,791 shared orders agree once the dashboard's day number is converted to ISO.
- **Pending Dispatch** — SQL, statuses and status-mapping byte-identical; the 13 differing
  orders had genuinely progressed between the cron run and the snapshot.
- **Line-SKU search** — looked like a gap; `r.k` already contains every line SKU, 0 of 28
  multi-line orders missing one.

Still open from the cross-check: the Fixed Price category and sort filters, the Dispatch
payment filter, cross-filtered option counts, the "(not recorded)" warehouse bucket (35 of 387
pending orders unreachable), and Inventory search coverage.

## 6. FAILURE MODE OR EDGE CASE

**Ship To is pending, not missing.** 44% of the Dispatch Queue shows no address. The app and
the dashboard build it with identical SQL and differ on **0** of 2,851 shared orders. The
database says why:

| Order age | Orders | No shipping_address row |
|---|---|---|
| today | 15 | 15 (100%) |
| 1 day | 665 | 644 (97%) |
| 2 days | 591 | 6 (1%) |
| 3+ days | — | 0 (0%) |

`customers.shipping_address` is written about **two days** after the order. `billing_address`
has the **identical** lag, so there is nothing to fall back to — and filling Ship To from a
billing address would risk showing a packer the wrong destination.

**One table with no scroll region.** `PostageTab` was the only tab not wrapping its content in
`.scroll`, and it sits in `.card.grow`, which is `overflow:hidden`. Postage Prices renders
**eleven** stacked tables and Box Sizes five, so everything past the first was clipped with no
way to reach it. Not a scrollbar in the wrong place — a section you could not get to.

**A pager that worked out its own page size.** Container Details sliced with a measured row
height while the pager estimated from the window, so one table read "21 of 36" at the top and
"1–15 of 36" at the bottom. The same audit found `Number('auto')` → `NaN` emptying the
Inventory table one menu click away.

**A regression I introduced and then had to unpick.** `node:fs` in `instrumentation.js` — Next
compiles that file for the edge runtime too, and the module build failure took every page to a
500. Neither a `NEXT_RUNTIME` guard nor moving the code to its own module prevents it; the
import must be marked ignorable for the bundler.

**Three wrong diagnoses, each costing a deployment.** I claimed Vercel had not built the
pushed commit (it had — I read a cached page and so fetched the old stylesheet); then that the
data was merely at a different path (it was not being found at all); then relied on a
diagnostic route that could not route. The log was the evidence all along.

## 7. DECISIONS MADE TODAY

| Decision | Why |
|---|---|
| Find the data directory rather than assume it | The deployed layout is decided by a tracing root we do not control |
| Parser as static ESM, not a required `.cjs` | A runtime require cannot be bundled, and a trace listing is not proof it loads |
| Price Comment as one word, sentence behind a click | The column cost a sentence's width for a field secondary to every other on the row |
| Type as the dashboard's badge, capped and wrapping | A 43-character value was setting a 270px column and pushing warehouses off screen |
| One scroll region on Postage, tables sized to content | Two nested scrollbars on eleven tables is worse than the clipping it replaces |
| Ship To stays a dash | The address does not exist yet; billing has the same lag and a wrong destination is worse than none |
| Category strip: one line, then 6+6, then scrolling | Twelve readable filters need a 2283px window; below that, honesty beats truncation |

## 8. COMPANY KNOWLEDGE EXTRACT

- **A runtime `require` is invisible to a bundler.** `createRequire(import.meta.url)` resolves
  at runtime; webpack cannot follow it and the target is not shipped.
- **A `.nft.json` trace listing a file is not proof the function can load it.** Only running
  the built app in the deployed layout proves that.
- **`process.cwd()` is not the app root in a deployed function** when the app is a subfolder of
  a larger repo.
- **An underscore-prefixed folder in the App Router is private and never routed.**
- **A listing title needs `site='UK'` AND `wrong_sku=0`.** Without them the name becomes a
  foreign variant option or another product's title.
- **`customers.shipping_address` lags the order by about two days**, and `billing_address`
  lags identically.
- **`shipping_address.country_id` still has no lookup table.** Confirmed again today.

## 9. LLM STANDARD CHECK

Every figure is reproducible: the Slow-Moving before/after counts by diffing the app's API
against the dashboard's embedded `SLOW_MOVING` block on shared SKUs; the family counts by
parsing `CATS` out of the published page; the Ship To lag from a `GROUP BY` on order age
against `customers.shipping_address` and `billing_address`; the deployment failure from the
Vercel runtime log; the fix verified by running the production build from the parent directory
with the database pointed at `127.0.0.1:1` — every endpoint served, **zero connection
attempts, zero module errors**.

## RESULT

| | Start of day | End of day |
|---|---|---|
| App deployed and serving | no | **yes, every page loads** |
| Slow-Moving names differing from the dashboard | 7,170 | **0** |
| Slow-Moving images differing | 3,085 | **0** |
| Category sections with no families | 4 | **0** |
| Postage tables reachable | 1 of 11 | **11 of 11** |
| Dispatch dialog facts (queue) | 6 | **14, in four named blocks** |
| Tables whose pager agreed with itself | 5 of 6 | **6 of 6** |
| Next.js components | 18 | **20** |

Cron runs on 2026-09-04: **three, all OK**, 6,183 rows each, published to hub 218.

**Carried into 5 September:**
1. **Eight files uncommitted** — the dispatch dialogs, the Postage scroll fix, the CSS.
2. **The deployment still queries the database on every cold start** — the build is not
   producing snapshots, and the `snapshot(s)` line from the Vercel build log is needed to say
   why. Likely the builders cannot reach the database; the fallback is to commit the snapshots.
3. Five cross-check findings still open (§5).
4. The temporary `/api/_diag` route has been removed, but the question it was meant to answer
   — what the deployed function actually sees — was answered by the log, not by us.
5. The six items carried out of REQ-08 remain open.

## BLOS GOVERNANCE NOTE

| Value | Where it lives now | Why it must be governed |
|---|---|---|
| Parser reached by static import | `postage-inventory/lib/history-parser-impl.js` | A runtime require is not bundled and fails only once deployed |
| Data directory found, not assumed | `postage-inventory/lib/data-dir.js` | The deployed layout is set by a tracing root we do not control |
| Listing titles need site and wrong_sku | `app/api/slow-moving/route.js` | Without them 7,170 names were a foreign variant option |
| Family entries may carry a fourth element | `scripts/export-classification.cjs` | A three-element pattern silently emptied four sections |
| Ship To lag is a database fact | this log, §6 | It reads as a defect and is not one; billing cannot substitute |
| One scroll region per tab | `postage-inventory/app/theme.css` | `.card.grow` is overflow:hidden; a tab without one is clipped |
