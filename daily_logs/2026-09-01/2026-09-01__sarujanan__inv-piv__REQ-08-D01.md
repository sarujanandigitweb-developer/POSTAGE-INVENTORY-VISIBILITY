---
date: 2026-09-01
developer: sarujanan
project: Postage Inventory Visibility
project_code: INV-PIV
phase: Phase-08 — Missing Shipments (Pending Dispatch) tab built; the whole dashboard made responsive
requirement_id: REQ-08
deliverable_id: D01
status: >-
  Shipped and published. A fifth tab is live on the same 2-hourly cron. Sixteen runs
  published, two were REFUSED by the guards and published nothing, two were skipped by the
  lock because cron was already running. Every refusal was correct — see section 6.
evidence_location: >-
  sql/refresh/extract/pending-dispatch.js, sql/refresh/query-equivalence.js,
  validation/check-pending-dispatch.js, check-tabs-wired.js, check-tab-menu.js,
  check-responsive.js, dashboard/inventory-dashboard.html, logs/refresh.log
blos_keys_used:
  - movement_is_sale_plus_combo_usage
  - cancelled_and_deleted_are_not_movement
  - zero_stock_kept_and_flagged
  - open_order_is_status_not_shipped_flag      (NEW — the shipped column is unusable, see §3)
  - one_shipment_per_order                     (NEW — an order can carry several parcels)
  - dispatch_sla_is_a_stated_assumption        (NEW — no SLA exists in the database)
  - country_id_has_no_lookup                   (NEW — city and postcode are shown instead)
  - line_level_fields_belong_in_a_dialog       (NEW — not in a one-row-per-order table)
hardcoded_thresholds:
  - dispatch SLA = 3 days (stated assumption; no SLA field exists anywhere)
  - order age bands = 0–1 Normal, 2–3 High, 4+ Critical
  - open statuses = Inprogress, New, Hold — and shipped <> 1
  - rows per page = Auto (window-fitting), floor raised 12 → 15 today, ceiling 24
  - header breakpoints = 1500px, 1060px, 720px, 480px (each measured, not guessed)
three_am_standard: TRUE
llm_queryable: TRUE
company_knowledge_candidate: TRUE
domain: Inventory — Postage & Warehouse — LEDSone Postgres
User: Postage & Warehouse Team
Benefit status: >-
  Pass — every paid-but-unshipped order is now on one screen, aged and prioritised, and the
  dashboard is usable on a laptop and a phone rather than a wide monitor only.

---

## 1. SYSTEM STATE

Start of day: four tabs, the 2-hourly cron publishing to the hub, and **no media query
anywhere in the page** — the dashboard was built for a wide monitor. End of day: five tabs,
four measured breakpoints, and a small-screen tab menu.

## 2. WHAT CHANGED TODAY

**A fifth tab shipped: Missing Shipments — Pending Dispatch.** Open orders that are paid but
not yet out of the door, longest wait first, with the ten mandatory columns Varmen approved
(*"mandatory mattum add pannunga"*), plus Marketplace, Ship To and Warehouse, and a per-order
dialog for everything line-level.

**The whole dashboard became responsive.** The header reflows at four measured widths, the
five tabs collapse to a menu below 720px, the pager shrinks its own page list, and the tab
bodies give their height back to the table.

**Product names became searchable** on the Pending Dispatch tab. Searching "pendant" had
returned 0 orders while 442 contained one.

**`query-equivalence.js` was made snapshot-safe** — see §6. It had begun failing the whole
refresh over live warehouse movement.

## 3. POSTGRESQL FINDING — `order_info.shipped` IS NOT THE OPEN/CLOSED SIGNAL

The obvious query for "not yet dispatched" is `shipped <> 1`. It returns **497,790 orders,
447,274 of them over a year old**, back to 2020. That is not a dispatch backlog.

**496,252 orders marked `Completed` carry `shipped = 0` or NULL** — the flag was never
backfilled on historical rows, and only 4,198 of them even have a `shipped_time`.

`orders.status` is the reliable signal. The genuinely open states are **Inprogress, New and
Hold** — about 1,250 orders, none older than roughly two weeks, which is what a real pending
queue looks like.

**A second finding, on the requirement's own assumption.** Image 2 of the brief lists eight
columns as *"not available now"*. **Seven of the eight are available today:**

| Column | Coverage of the pending orders |
|---|---|
| Marketplace, Customer Country, Warehouse | 100% |
| Product Name, Quantity | 99% |
| Courier | 93% |
| Stock Available | 34% |
| **Tracking Number** | **0% — correct, nothing has shipped yet** |

## 4. GAP FOUND

**No dispatch SLA exists anywhere in the database.** Every `*_due` / `ship_by` column belongs
to eBay returns or supplier invoices. The 3-day threshold is the requirement's own age band,
held in one named constant, and **the tab says so on screen** rather than presenting it as
fact.

**`shipping_address.country_id` has no lookup table.** The names are only inferable from
postcode shapes. Guessing a destination country on a shipping dashboard is exactly the kind
of invention that sends a parcel to the wrong place, so the column shows the real **city and
postcode** instead, and the gap is reported rather than filled.

**A count challenge, answered exactly.** Grouping `orders` by status gives 1,294 open orders
against the tab's 1,246. The 48 difference is not drift: they are orders whose status has not
been closed but which have **already shipped** — all 48 carry a `shipped_time`, a tracking
number and a `Completed` shipment row. They belong in "not yet closed" but not on a packing
list.

## 5. VALIDATION RULE ADDED OR CHANGED

`validation/check-pending-dispatch.js` drives the page's own render, filters, sorting and
dialog, then re-runs the defining query and compares row counts.

Three new validators, each written because an existing one had missed a real defect:

- **`check-tabs-wired.js`** — **clicks** every tab button. Written after Pending Dispatch
  shipped with markup, a view, a renderer and a first-paint entry but *no click handler*.
  Every other check called `setView()` directly and sailed past it.
- **`check-tab-menu.js`** — the same, for the small-screen menu.
- **`check-responsive.js`** — asserts the media queries exist and that each one actually
  overrides the desktop rule it needs to.

`apply.js` now **gates on the tab and menu checks**, so a control with markup but no wiring
can never be published again.

## 6. FAILURE MODE OR EDGE CASE

**Two runs refused to publish. Both refusals were correct.**

1. **`*** no duplicate order id`** — an order can carry **more than one shipment row**. Order
   `LSFR1632` had a cancelled label and its live replacement, so a plain `LEFT JOIN` produced
   1,244 rows for 1,243 orders. Fixed with a `LATERAL` that picks one shipment: a live label
   beats a cancelled one, most recent wins after that.
2. **Query equivalence "failed"** — and it had not. That check ran the old and new query
   forms as **two separate statements against live data**, and Kronen was picking between
   them: **201 of 49,448 cells differed, all in that one column, by 1–4 units**. A genuine
   warehouse movement was being reported as a broken query and it blocked the whole run.
   Both forms now read inside one `REPEATABLE READ` transaction — 49,448/49,448 identical.

**Three CSS failures, none of which throws an error or breaks a render test:**

| Failure | What it looked like |
|---|---|
| Invented class names (`hbox`, `hhead`, `hsub`, `hx`, `hbody`) | The dialog rendered as bare text over the table — five classes, zero CSS rules |
| Specificity loss — `table.fxtab td` beats `.fxname` | Product names ran through their neighbours; prices never right-aligned |
| Class collision — `.pdlines` on both a `<span>` and a `<table>` | `display:block` stopped the table laying out as a table |

Each is now covered by a check, and each check was verified by reintroducing the bug on a
copy and watching it fail.

**A temporal-dead-zone ordering trap, twice.** The tab-restore code calls `setView()`, which
calls into blocks declared further down the file. Both the auto-refresh block and the menu
block had to be moved *above* the restore. Caught by `check-tab-memory.js` both times.

## 7. DECISIONS MADE TODAY

| Decision | Why |
|---|---|
| Open = `orders.status IN (Inprogress, New, Hold)` AND `shipped <> 1` | The shipped flag alone returns 497,790 rows going back to 2020 |
| One row per **order**, not per line | Days Pending, Priority and SLA are order properties; orders average 1.12 lines |
| Line-level fields go in a **dialog**, not columns | 105 orders have several lines and one has 16; as a column that is a list in a cell |
| Only 3 extra columns inline (Marketplace, Ship To, Warehouse) | 18 columns would force constant sideways scrolling to read one order |
| Tracking Number stays in the dialog | Empty on 1,245 of 1,246 rows by nature — a column of dashes helps nobody |
| Minimum rows per page 12 → 15, on **all** tabs | A 15-row minimum on one tab and 12 on the others is an inconsistency someone reports as a bug |
| Below 720px, a menu replaces the tab strip | Five tabs never fit; a scrolling strip is fiddly, a menu is honest |

## 8. COMPANY KNOWLEDGE EXTRACT

- **`order_info.shipped` cannot be used to decide whether an order is open.** Half a million
  Completed orders carry `shipped = 0` or NULL. Use `orders.status`.
- **An order can have several shipment rows** — a cancelled label and its replacement, or one
  per parcel. Any join to `shipment` must pick one deliberately.
- **`order_item_info.order_id` joins `orders.id`**, not `orders.order_id`, which is the
  marketplace reference string.
- **No dispatch SLA and no country lookup exist** in the database.
- **48 orders at any time are shipped but not status-closed** — real, and correctly excluded
  from a packing list.

## 9. LLM STANDARD CHECK

Every figure here is reproducible from `logs/refresh.log`, the extractor under
`sql/refresh/extract/pending-dispatch.js`, or a query against the LEDSone database. The two
count challenges raised today were both reproduced exactly before being explained.

## RESULT

| | Start of day | End of day |
|---|---|---|
| Tabs | 4 | **5 — Pending Dispatch added** |
| Open orders listed | 0 | **946 at the last run** (2 past the 3-day SLA) |
| Media queries in the page | **0** | **4 measured breakpoints** |
| Small-screen tabs | overflowed | **menu in the top-right corner** |
| Pager on a narrow window | full page list | **adapts: 7 → 5 → 1 → arrows only** |
| Product-name search | not possible | **442 orders findable by "pendant"** |
| Validators | 6 | **9**, two of them gating the publish |
| Page size | 10.24 MB | **10.16 MB** |

Runs on 2026-09-01: **18 total — 16 OK, 2 refused to publish, 3 unattended cron, 2 skipped
by the lock.** Published to hub **218** and verified byte-for-byte on every OK run.
Not committed, not pushed.

**Carried into 2 September:**
1. **Total SKUs on Fixed Price still shows 30,221 of 44,332** — analysed on 28 Aug, fix specified, still awaiting a decision.
2. **`WS` category conflict** — Lighting on Fixed Price, Wall Arm on Inventory. Needs a ruling.
3. **38 combo images name the wrong SKU** in `inventory.product_images` — fix at source; the dashboard suppresses them.
4. **`country_id` lookup** — if a mapping exists, Customer Country can show a real name.
5. **`tech_user` connection limit** — still unraised; a cron run occasionally fails on it.
6. **`CRON_TZ=Asia/Colombo`** — the 2-hourly job fires at :30 past even UTC hours. Pin to UTC if that is confusing.

## BLOS GOVERNANCE NOTE

| Value | Where it lives now | Why it must be governed |
|---|---|---|
| Open = status Inprogress/New/Hold AND shipped <> 1 | `sql/refresh/extract/pending-dispatch.js` | The alternative returns 497,790 rows and is not a queue |
| One shipment per order, live label over cancelled | same | A plain join silently duplicates orders; the guard caught it |
| SLA = 3 days, stated on screen as an assumption | same + the tab footer | No SLA exists in the database; it must never read as fact |
| City and postcode instead of a country name | same | `country_id` has no lookup; a guessed country misroutes a parcel |
| Line-level fields live in the dialog | dashboard, `pdOpen()` | An order with 16 lines cannot be a row |
| Both query forms read one snapshot | `sql/refresh/query-equivalence.js` | Otherwise live picking blocks the refresh as a "query fault" |
| Every tab control must be click-tested | `check-tabs-wired.js`, `check-tab-menu.js`, gated in `apply.js` | A control with markup but no handler passes every other test |
