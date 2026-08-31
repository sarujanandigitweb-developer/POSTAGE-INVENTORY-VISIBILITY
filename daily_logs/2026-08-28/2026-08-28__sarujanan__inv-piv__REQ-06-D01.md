---
date: 2026-08-28
developer: sarujanan
project: Postage Inventory Visibility
project_code: INV-PIV
phase: Phase-06 — History rebuilt, Received filled, 2-hourly refresh BUILT and running, SKU Fixed Price tab shipped
requirement_id: REQ-06
deliverable_id: D01
status: >-
  Shipped and published. The 2-hourly refresh is built, installed in cron and now
  publishes to the hub itself. One item is OPEN and awaiting a decision — Total SKUs
  shows 30,193 of 44,332 (see section 4c).
evidence_location: evidence/50–54, sql/refresh/, sql/refresh/extract/fixed-price.js, validation/check-fixed-price.js, hub/, _archive/, dashboard/inventory-dashboard.html
blos_keys_used:
  - history_four_types_only
  - history_field_to_warehouse_map          (NEW — Quantity=Unit 3, unit1=Unit 18, unit3=Unit 4)
  - received_from_supply_lines_only         (NEW)
  - container_date_proximity_not_a_key
  - shopify_channel_priority_ledsone_first  (NEW)
  - population_source_postgres_inventory_bool (APPLIED — the refresh reads Postgres, not the Sheet)
  - stock_band_low_1_to_10
  - fixed_price_uk_live_listings_only       (NEW — the rule that produces 30,193, see §4)
  - fixed_price_four_marketplaces_exist     (NEW — Wayfair and Temu have no source at all)
  - combo_name_composed_from_components     (NEW — products.title is a placeholder for combos)
  - fx_category_prefix_table                (NEW — display-only, does not touch CLASSIFY)
  - postage_band_cannot_cross_parent        (NEW — sheet merges are lost by CSV export)
hardcoded_thresholds:
  - low stock band = 1–10 units (cell colour AND header alert)
  - out of stock = total <= 0 across all eight warehouses
  - history carried per SKU per region = 12 most recent
  - Shopify channel order = LEDSone, Electricalsone, Vintagelite, BesBet, Dcvoltage, then non-UK
  - only UK channels may supply the £ price column
  - refresh interval = 2 hours; tag amber at 3 hours, red at 8
  - Postage sheet poll = 10 minutes; tag amber at 30 min, red at 60
  - passport image frame = 264×340px (35×45mm)
  - Fixed Price auto page size = fits the window, floor 12 rows, ceiling 24
  - Fixed Price prices held as INTEGER PENCE; dates as whole days since epoch
three_am_standard: TRUE
llm_queryable: TRUE
company_knowledge_candidate: TRUE
domain: Inventory — Postage & Warehouse — LEDSone Postgres
User: Postage & Warehouse Team
Benefit status: >-
  Pass — a third tab now prices 30,193 SKUs across four marketplaces in one view, and the
  whole dashboard refreshes and republishes itself every two hours unattended

---

## 1. SYSTEM STATE

Start of day: **5,852 SKUs**, history rebuilt the previous evening but its counts not yet
re-asserted, Received Warehouse and Received Date reading *Unavailable* on every row since
the dashboard was built, and the header claiming **"Extracted 2026-08-20"** — eight days
stale.

## 2. WHAT CHANGED TODAY

**History was rebuilt to the four types the team actually uses** — UK stock changes,
Supply, German Inventory, German Supply. Everything else in `product_history` (catalogue
edits, CSV location moves, `low inventory checkup`, order cancellations) is no longer
carried. 23,952 movements across 4,306 SKUs, down from 59,673 across 5,648, and the page
went **4.98 MB → 3.62 MB**.

**Supply lines now show a warehouse and a quantity.** They previously rendered no
warehouse at all — just raw text in Remarks. A supply line lists every field it touched,
most unchanged; the movement shown is now the **last one where the value actually moved**.

**Received Warehouse and Received Date were filled for the first time** — 3,222 UK and
1,175 German receipts, 1,254 containers matched by date proximity.

**The Shopify price and Comments were rechecked** under a strict five-tier priority with
LEDSone first at every tier. Priced rows **3,417 → 4,428**; accessories now read in plain
words ("Combined with Universal Reducer Plate E27 to B22 (RPR44WH)").

**UI:** stock 1–10 in dark amber, header low/out-of-stock alerts that filter on click,
comment popover, passport-size image view, `-` instead of *Unavailable* in all four shelf
columns, and the Unavailable legend removed from the header.

**Handles (31 SKUs) moved from Home Appliances to Lamp Spares.**

**Published to hub page 218 and verified from an independent read** — 3,945,912
characters, sha256 matching the local file byte for byte.

**The automatic refresh was analysed, and the hardest part proven.** Not built yet.

## 3. POSTGRESQL FINDING

**Finding 1 — `inventory_bool` is the filter that separates products from placeholders.**
`inventory.products` holds 16,423 single SKUs. **10,188 of them are `ENC1…ENC10000`,
every one described `Combo Default Title.`, every one `inventory_bool = false`** — eBay
combo placeholders. The real catalogue is **6,234**. Without this filter a
"classify everything, unmatched to Other" refresh would put 10,188 phantom rows on the
dashboard. 479 of them even carry stock mirrored from their components, so a stock filter
would not have caught them.

**Finding 2 — Postgres has 380 real SKUs the dashboard has never shown**, and **zero**
dashboard SKUs are missing from Postgres. Lampshade +145, Pendant +84, Ceiling Rose +51,
Lamp Spares +36, Home Appliances +10.

**Finding 3 — the page cannot classify six of its own sections.** `classifySKU`
reproduces only **60.34%** of today's assignments, because the rules for Lamp Spares (29
types) and Lighting (5) only ever existed inside extraction SQL that was never saved into
the page. The rows themselves are the surviving record of those rules.

**Finding 4 — the warehouse names in the database are correct, except the one that
matters.** `inventory.warehouse` names 10 warehouses and the dashboard's headers are those
names, shortened. **Warehouse 33 has no row at all** — "UK Unit 5" is still a team
statement. Cross-checked live on `TPFHTWB12WH`: history says `unit5 changed from 0 to 48`,
stock says warehouse 33 = 48, every other warehouse zero.

**Finding 5 — three warehouses are unmapped**: France1 (3,298 units), Netherlands1
(4,912), Duisburg warehouse (675). Duisburg is German stock the German columns exclude.
Team decision: out of scope for now.

**Finding 6 — `inventory.product_pk` is the authoritative pack table**:
`A=10, L=11, G=12, B=15, H=16, C=20, I=24, S=25, D=30, E=50, J=75, M=80, F=100, K=150,
N=200, O=250, P=300, Q=500, R=1000`. The regex in use reads a single digit and `A` only —
it is blind to eighteen codes.

**Finding 7 — the SU code still has no key into `suppliers`.** Re-confirmed with the
refresh credentials: zero rows in `orders.order_id`, `final_containers.name` or
`containers.name` contain one, and `order_item_logs` carries no supply reference either.
The container match is date proximity and the UI says so on hover.

## 4. GAP FOUND

**Roughly one dashboard SKU in five is showing at least one wrong number today.** Four
random samples, 260 SKUs:

| seed | sampled | wrong | stock cells changed |
|---|---:|---:|---:|
| 20260827 | 60 | 10 (17%) | 2.9% |
| 7 | 80 | 19 (24%) | 4.1% |
| 991 | 80 | 23 (29%) | 4.4% |
| 55501 | 80 | 8 (10%) | 1.7% |

All of it stock; **no price drift in 260 SKUs**. `CL3TBM` shows Unit 3 = 400, actually
264. `LSOL220YB` shows 4, actually 1 — an amber cell that should be nearly red.

**A leading minus is still dropped on CSV-upload history lines** (evidence/49), 1.6% of
movements. Unchanged today; it belongs to a full re-extraction.

**52 SKUs have no prefix rule at all** — `3528 BLUE 10M STRIP LIGHT`,
`5050 WATER PROOF 5M RED STRIP`, `2 PIN CLIP TO CLIP`. Someone typed a product name into
the SKU field. They go to Other rather than being dropped.

## 4a. WHAT CHANGED AFTER 09:14 — this log originally stopped here

**The 2-hourly refresh was built, installed and proven.** `sql/refresh/` now holds the
whole pipeline: `db.js` (sole credential reader), `raw-arrays.js` (reads the embedded
arrays as they are ON DISK, before the page re-types them), `rules.js`, five read-only
extractors, `build.js`, and an atomic `apply.js`. `refresh.sh` runs under `flock`, and one
cron entry drives it: `0 */2 * * * .../sql/refresh/refresh.sh`. Sixteen OK runs are logged.

**The refresh now publishes to the hub itself.** Until today `refresh.sh` only rewrote the
local file — the hub page changed only when someone ran `publish.sh` by hand, so readers
saw the previous manual push while the data underneath moved every two hours. The publish
and an independent read-back verify are now the last two steps of the same run. A failure
there reports `OK-NOPUBLISH` / `OK-NOVERIFY` and never rolls the dashboard back, because at
that point the file on disk is already validated and installed — a failed push is a
distribution problem, not a data problem.

**Hub credentials moved into this project.** `publish.sh` and `verify.sh` were reading
`/home/led-247/Returns-Reason-Hotspot-Report/.env` — a sibling repo. If that repo were
moved or cleaned up, the scheduled publish would fail every two hours with no obvious
cause. Both now read this project's own gitignored `.env` (mode 600) and fall back to the
old path only if it is absent.

**A third tab shipped: SKU Fixed Price.** 30,193 SKUs (4,768 single, 25,425 combo) with
their fixed UK price on every marketplace the database holds, plus search, sort, a
category filter, window-fitting pagination and a price-coverage strip. Details in §4b and
evidence/54.

**The repository was reorganised.** 61 one-off files moved with `git mv` into `_archive/`
(`apply-scripts/` 14, `extracted-snapshots/` 27, `extraction-queries/` 8,
`one-off-checks/` 12). `README.md` now maps every live file to its job and states plainly
that nothing under `_archive/` runs. Generated artefacts (`logs/`, `sql/refresh/out/`,
`*.bak`, `compare-*.json`) are gitignored.

**The Postage Information header was corrected** — see §4c. It was misaligned for a
structural reason, not a styling one.

## 4b. THE SKU FIXED PRICE TAB — WHAT THE DATABASE ACTUALLY SUPPORTS

**Only four of the six requested marketplaces exist.** Every schema was searched.

| Marketplace | Source table | SKUs priced |
|---|---|---|
| Shopify | `listings.shopify_listings` | 16,671 |
| eBay | `listings.ebay_listings` | 21,972 |
| Amazon | `listings.amazon_listings` | 16,974 |
| B&Q | `listings.bandq_listings` | 3,981 |
| **Wayfair** | **none — no table, column or channel** | — |
| **Temu** | **none — no table, column or channel** | — |

The requirement's own mock-up showed Wayfair at 86% and Temu at 81.7%. Those numbers
cannot exist. Both columns render an explicit *no data source* and a validation check
asserts **no percentage is ever printed for them**. Correct brand logos are shown, because
having the right logo does not create data behind it.

**Combo names had to be derived.** `inventory.products.title` is the literal string
`Combo Default Title.` on **37,481 rows** — every combo, and 52 rows flagged *single*.
Shopify's combo titles are variant labels (`Green / Without Bulb`, `Pack 2`) and
`ebay_listings.title` is null throughout. Names are therefore composed from the SKU:
`A+B+C` joins its component titles; `12BO1002PK` becomes the base product plus `(2 Pack)`.
Letter pack codes decode through `inventory.product_pk`, so `…APK` correctly reads 10 Pack.
**24,481 of 30,193 (81.1%)** get a real name; the remaining 5,712 are almost all `ENC*`
eBay combo placeholders that carry no component information anywhere.

**Size was engineered, not accepted.** Plain names cost 4.63 MB. Names are interned into a
dictionary and each row stores indices (`5`, `[5,-10]` for a pack, `[5,9,2]` for a combo);
prices are integer pence; the four per-marketplace dates are interned as tuples — only
**212 distinct tuples** across 30,193 rows. Final block **2.16 MB**, page 6.08 MB.

## 4c. GAPS FOUND AFTER 09:14

**OPEN — Total SKUs shows 30,193 of 44,332.** `inventory.products` holds 44,332 distinct
SKUs (6,508 single, 37,824 combo — the reported 44,333 is one high). The extractor
iterates the *priced* lookup and drops anything without a live UK price, so 14,139 SKUs
never reach the page:

| Reason | SKUs |
|---|---:|
| never appear in any listing table | 10,515 |
| listed but no `price > 0` anywhere | 47 |
| priced, but filtered by the UK/live rules | 3,577 |
| — of those, priced only on a non-UK site | 3,302 |
| — of those, only an ended listing | 1,107 |

This contradicts the original requirement *"Display all available SKUs in one table."* A
product listed nowhere is exactly what a pricing dashboard should surface. **The price
coverage calculation is NOT the cause** — that is computed on the page for display only.
The fix (iterate the catalogue, add a "not listed anywhere" filter, correct the mislabelled
"Total SKUs" tile which currently shows the *filtered* count) is specified and **awaiting a
decision**, because it adds ~0.8 MB and requires rewriting an `apply.js` guard that
currently asserts every row carries a price.

**Postage header bands crossed their parents.** A CSV export of a merged sheet loses the
merge ranges — the label lands in the first cell and the rest come back empty. No Google
export preserves them: `gviz` returns 200 but strips every `colspan`, `pubhtml` is 401,
`export?format=html` is 400. The old rule spanned a label "until the next label on this
row", which knows nothing about the row above. `19% VAT RATE INCLUDED ONLY dhl` therefore
spanned **26 columns**, running out of the DHL block and across the entire
`Tracked (Small Parcels) 2-5kg*` region, which belongs to a different parent. Two rules now
bound every band — it cannot cross a boundary set by a shallower row, and it stops at its
last used column. That label now spans **4**, and every band nests inside its parent while
each header row still sums to exactly the 36-column width.

**`public.inv_products` no longer exists.** evidence/48–49 were built against it. Nothing
running depends on it, but that record now references a dropped table.

**`tech_user` hit its server-side connection limit** mid-afternoon with zero connections
held by this machine. The 05:03 run failed at the first gate and correctly published
nothing; the retry succeeded. Cron will occasionally log this and skip a cycle, which is
the safe behaviour — but it means the freshness tag can silently go stale. Raising
`rolconnlimit` or adding a connect retry in `db.js` is still open.


## 5. VALIDATION RULE ADDED OR CHANGED

**Rule — a rebuilt classifier must reproduce TODAY before it is allowed near tomorrow**
```
Applying the page's own classifySKU to the live catalogue reproduced 60.34% of the
current assignments. Shipping that would have moved 2,321 SKUs silently.
THEREFORE: derive the rule table BY INDUCTION from the rows that exist, and refuse to
write it unless it reproduces 100% of them. 471 rules, 5,852/5,852, zero wrong.
```

**Rule — a fallback must keep what the SKU DOES say**
```
LSBF3BWG is a lampshade; nothing in "LSBF" says which material. Sending it to a global
Other throws away the one fact the SKU carries.
Two tiers: exact prefix, then the SECTION from the 2-char table with that section's own
Others bucket. Global Other only for a SKU matching neither. 114 -> 52.
```

**Rule — a spot-check must model the real lookup, or it invents drift**
```
The first random check reported five "price -> none" rows. All five were WRONG: the
dashboard prices those rows from a COMBO listing and the checker looked up the bare SKU.
Compare a field only where you have reproduced how it was derived. Report what you
skipped, so a clean result cannot be mistaken for full coverage.
```

**Rule — a freshness stamp must show AGE, not a date**
```
"Extracted 2026-08-20" sat on the page for eight days looking authoritative.
A date cannot say it has stopped. An age can: amber past 3 hours, red past 8, with
"refresh may have stopped" in the text. A dead scheduler must be visible on the screen.
```

**Rule — never let a foreign-currency figure into a column labelled in pounds**
```
167 rows were showing a Canadian or German price as "£31.49". A wrong number, not a
partial one. Those rows now show no price and name the store instead.
```

**Rule — take both lists BEFORE mutating either**
```
const HANDLES  = HAP_DATA.filter(r => r.f === 'ZHL');
HANDLES.forEach(r => { r.f = 'HL'; });        // mutates rows still inside HAP_DATA
const HAP_REST = HAP_DATA.filter(r => r.f !== 'ZHL');   // matches nothing now
filter() returns REFERENCES. 31 SKUs ended up in two sections at once and the total
silently went to 5,883. Assert that no SKU appears in two sections.
```

**Added after 09:14 —**

`validation/check-fixed-price.js` drives the page's OWN render, search, sort, filter and
paging code against the published data and asserts on the result. It caught three real
defects that would otherwise have shipped: a raw `&` in the B&Q header, the 52 products
flagged *single* carrying the combo placeholder title, and a lazy regex splitting
`12BO1002PK` as `12BO1 + 002PK`. It now also asserts that no coverage percentage is ever
printed for Wayfair or Temu, that no marketplace icon is fetched at runtime, that every
cell rule outranks the base table rule, and that the refresh details survive navigating
back to Inventory.

`apply.js` gained four guards for the new block — dictionary > 1,000 entries, ≥ 20,000
rows, every row carries a price, every name index resolves inside the dictionary — so a
collapse can never publish an empty third tab. *(The third of those must be rewritten as a
coverage floor if the §4c Total SKUs fix is approved.)*

## 6. FAILURE MODE OR EDGE CASE

- **`pkill -f test_lampshade` killed its own shell** — exit 144, for the second time in
  three days. It is already written down in the 2026-08-26 log and I did it again.
- **A greedy digit read `LDCWGU1036PK` as a "36 Pack"** — it is `LDCWGU103` + `6PK`. The
  same bug stripped the `5` off `LDGU10CW53PK`.
- **Complex kits leaked into the pack tier** — `LHNDE27BM` read "Sold as 2 Pack" for a
  four-item kit. 82 rows were in the wrong tier.
- **Aliasing put 31 SKUs in two sections at once** (see rule above).
- **A checker that returns `true`** — I wrote `chk('every matched container was ordered on
  or before the receipt date', rows.every(r => true))`. That is not a check. Replaced with
  one that reads the container source independently; 1,254 matches verified.
- **`sha256(html_content::bytea)`** fails on a text column; it needs
  `convert_to(html_content,'UTF8')`.
- **The suite crossed the session boundary five times** and was reported as "0 failures"
  when it had simply not finished. A count is only trustworthy next to `ALL PASS`.

**CSS specificity, twice.** `table.fxtab td` scores (0,1,2); a bare `.fxname` scores
(0,1,0). The base rule's `white-space:nowrap` and `text-align:left` therefore beat every
cell rule beneath it — the product name ran straight through the SKU Type and Shopify
columns and the prices were never right-aligned, despite rules saying otherwise. It only
*looked* correct earlier because a line-clamp was forcing a different layout mode. The same
class of bug appeared in the Postage header, where `.hsub th:first-child` (0,3,3) outranks
`.hban th` (0,2,3) and would have painted the banner's sticky cell the wrong colour. Both
are now scoped explicitly and asserted.

**`display:-webkit-box` on a `<td>`** removes the cell from table layout, so it no longer
shares the row's height or baseline and its border draws at its own height. That was the
ragged line under the Product Name column. The clamp belongs on an element *inside* the
cell.

**A bad slice index prepended ~2,000 characters above the doctype**, corrupting the file.
Caught on the next render check and repaired in place; the protected-region hashes
confirmed nothing was lost.

**A verification that verified nothing.** A protected-region diff printed "all identical"
while actually comparing two empty files — the scratchpad had been cleared and both runs
had errored. Reported as a pass for a moment before being caught and re-run properly. A
check that cannot fail is worse than no check.

## 7. DECISIONS MADE TODAY

- **Postgres is the source of truth for SKU membership**, replacing the Google Sheet. The
  sheet is stale in both directions and Postgres has 380 more real SKUs.
- **Only the four history types are carried.** Canada, USA and Netherlands movements are
  lost with the CSV-upload wording; raised, not silently dropped.
- **A combo price is shown, but never a foreign-currency one.**
- **The price badge lost its value tiers** — one light blue badge. Colouring a price by
  value read as a stock warning; that meaning belongs to the header alerts.
- **The refresh will not publish** unless the smoke test passes and the row count moves
  less than a set threshold.
- **France, Netherlands and Duisburg stay out** for now, mapping left ready.
- **Warehouse 33 keeps a declared override** until its row exists, with a reminder logged
  on every run.

**Taken after 09:14 —**

| Decision | Why |
|---|---|
| Wayfair and Temu show *no data source*, never a number | The mock-up's 86% / 81.7% cannot exist; inventing them on a pricing dashboard is worse than a gap |
| Marketplace logos inlined, not linked to a CDN | A CDN can fail or change; the page is published to a hub where a broken logo is just a gap |
| `PH` → Pendant Lamp Holder, not Lighting | It is the dedicated category and it matches `CLASSIFY`, so a SKU reads the same on both tabs |
| `WS` → Lighting on this tab, per the supplied list | **Flagged conflict:** `CLASSIFY` calls `WS` Wall Arm, so it differs across tabs. Awaiting a ruling |
| Fixed Price opens on **Single**, 12 rows, auto-fit | Combos are 84% of rows and were burying the products people price |
| The Fixed Price category filter is display-only | It must not touch `CLASSIFY` / `classifySKU`, which the Inventory tab owns |
| The hub publish never rolls the dashboard back | By then the local file is validated; a failed push is distribution, not data |
| Total SKUs fix NOT applied | It changes the deliverable's scope and size; that is the user's call, not mine |

## 8. COMPANY KNOWLEDGE EXTRACT

1. **A boolean column can be the difference between 6,234 products and 16,423 rows.**
   Find the flag that separates real records from placeholders before counting anything.
2. **Code that classifies your data may not be able to classify your data.** The page
   reproduces 60% of its own assignments; the rest lived in SQL nobody saved.
3. **Derive a rule table by induction and refuse to ship it below 100% reproduction.**
4. **A fallback should preserve partial knowledge**, not discard it. Section-known,
   type-unknown is a real state and deserves its own bucket.
5. **A spot-check that does not model the real lookup manufactures drift.** Say what you
   did not compare.
6. **Freshness must be an age, not a date.** A date cannot tell you it has stopped.
7. **Currency is part of a number.** A euro in a pound column is wrong, not partial.
8. **`filter()` returns references — take every list before mutating any of them.**
9. **An assertion that returns `true` is worse than no assertion**: it reports success.
10. **The same mistake twice means the log is not being read.** `pkill -f` matched its own
    shell again.

## 9. LLM STANDARD CHECK

| Check | Result |
|---|---|
| Terminology consistent with 2026-08-20 → 27 | TRUE |
| Business rules stated as executable IF/THEN | TRUE |
| Assumptions documented (Unit 5 override, date proximity, combo pricing) | TRUE |
| Edge cases documented (ENC placeholders, greedy digits, aliasing, currency) | TRUE |
| Evidence referenced by path | TRUE — evidence/50–51, sql/refresh/, validation/ |
| Another developer can continue independently | TRUE — `sql/refresh/` carries the connection, the validation, the derived rule table and the drift check |
| LLM queryable | TRUE |
| Hardcoded thresholds surfaced for BLOS governance | TRUE — see metadata block |

## RESULT

| | Before today | After today |
|---|---|---|
| History movements | 59,673 / 5,648 SKUs | **23,952 / 4,306**, four types only |
| Supply lines showing a warehouse | none | **all of them** |
| Received Warehouse / Date | *Unavailable* on every row | **3,222 UK + 1,175 German** |
| Shopify priced rows | 3,417 | **4,428** |
| Lamp Spares / Home Appliances | 1,420 / 705 | **1,451 / 674** |
| Page size | 4.98 MB | **3.95 MB** |
| Header freshness | "Extracted 2026-08-20" | **live age, amber at 3h, red at 8h** |
| Known stale rows | unmeasured | **~1 in 5**, measured over 260 SKUs |

**End-of-day figures (the table above was written at 09:14; these supersede it):**

| | Start of day | End of day |
|---|---|---|
| Tabs | 2 | **3 — SKU Fixed Price added** |
| SKUs priced across marketplaces | 0 | **30,193** (4,768 single, 25,425 combo) |
| Marketplaces compared in one view | 1 (Shopify only) | **4 — Shopify, eBay, Amazon, B&Q** |
| Refresh | manual | **cron `0 */2 * * *`, 16 OK runs logged** |
| Hub publish | manual only | **the last step of every scheduled run** |
| Hub credentials | a sibling repo's `.env` | **this project's own gitignored `.env`** |
| Repo root clutter | 61 one-off files loose | **moved to `_archive/`, README maps what is live** |
| Page size | 3.95 MB | **6.08 MB** (Fixed Price block 2.16 MB) |
| Postage header bands | crossing their parents (26-col span) | **nested correctly (4-col span)** |

Published to hub **218** at 11:58 UTC, verified by independent read-back:
6,362,556 characters, sha256 `8cd2c69d30b869e4…`, byte-for-byte identical to the local file.
Not committed, not pushed.

**Carried into tomorrow:**
1. **Total SKUs 30,193 vs 44,332** — analysed in §4c, fix specified, awaiting a decision.
2. **`WS` category conflict** — Lighting here, Wall Arm on Inventory. Needs a ruling.
3. **`tech_user` connection limit** — raise `rolconnlimit` or add a connect retry in `db.js`.
4. **52 unplaced SKUs** on the Inventory tab still need a home.
5. **`CRON_TZ`** is inherited, not pinned to UTC.

## BLOS GOVERNANCE NOTE

| Value | Where it lives now | Why it must be governed |
|---|---|---|
| `inventory_bool` as the product filter | `sql/refresh/` | It decides whether the catalogue is 6,234 or 16,423 |
| The 471-rule derived prefix table | `sql/refresh/prefix-table.json` | It is now the only complete record of the classification rules |
| Quantity=Unit 3, unit1=Unit 18, unit3=Unit 4 | `sql/product-history-parser.js` | A Supply line carries the field with no label; this mapping is load-bearing |
| LEDSone-first channel order | `sql/build-shopify-comments.js` | It decides which store's price the team quotes |
| UK-only channels may supply the £ column | same | Prevents a euro figure being read as pounds |
| Warehouse 33 = UK Unit 5 | declared override | The database still has no row |
| Refresh interval and staleness thresholds | dashboard + cron | They decide when the team is told the data is old |
| Fixed Price = live UK listings only | `sql/refresh/extract/fixed-price.js` | This single rule is why the tab shows 30,193 and not 44,332 |
| Wayfair and Temu have no source | same + `validation/check-fixed-price.js` | Must never be filled with a plausible-looking number |
| `Combo Default Title.` is a placeholder | same | 37,481 rows carry it; treating it as a name would mislabel every combo |
| The FX category prefix table | dashboard, `FX_CATS` | Display-only; it must never be confused with `CLASSIFY` |
| A header band cannot cross its parent | dashboard, `pgSpanCells` | CSV loses sheet merges; this rule reconstructs them |
| Hub credentials | this project's `.env` (mode 600, gitignored) | Never in the repo, the dashboard, or the logs |
