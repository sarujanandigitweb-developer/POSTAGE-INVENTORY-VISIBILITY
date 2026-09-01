---
date: 2026-08-31
developer: sarujanan
project: Postage Inventory Visibility
project_code: INV-PIV
phase: Phase-07 — Slow-Moving Products & Components tab built; movement logic corrected three times; tab memory and responsive layout added
requirement_id: REQ-07
deliverable_id: D01
status: >-
  Shipped and published. A fourth tab is live and rides the same 2-hourly cron. Twenty-three
  runs published, three were REFUSED by the guards and published nothing — each refusal was
  correct and is recorded in section 6.
evidence_location: >-
  sql/refresh/extract/slow-moving.js, sql/refresh/extract/fixed-price.js,
  validation/check-slow-moving.js, check-tab-memory.js, check-first-paint.js,
  check-csv-export.js, dashboard/inventory-dashboard.html, logs/refresh.log
blos_keys_used:
  - fixed_price_uk_live_listings_only
  - fixed_price_four_marketplaces_exist
  - combo_name_composed_from_components
  - slow_moving_over_90_days                  (NEW — 91–180 Medium, 181–365 High, 365+ Critical)
  - movement_is_sale_plus_combo_usage         (NEW — three sources, not one; see §3)
  - cancelled_and_deleted_are_not_movement    (NEW — Refunded IS movement, the item shipped)
  - zero_stock_kept_and_flagged               (NEW — never dropped from the report)
  - name_priority_uk_listing_then_order_line  (NEW)
  - image_reference_never_a_copy              (NEW — filename for the standard host only)
  - ph_is_a_person_who_owns_a_category        (NEW — staff.ph_categories)
hardcoded_thresholds:
  - slow-moving threshold = more than 90 days without movement
  - priority bands = 91–180 Medium, 181–365 High, over 365 Critical
  - a SKU with no stock AND no sale ever is excluded as a dormant catalogue entry
  - auto page size = fits the window, floor 12 rows, ceiling 24   (raised to 15 on 1 Sep)
  - refresh interval = 2 hours; cron runs on Asia/Colombo, so :30 past even UTC hours
three_am_standard: TRUE
llm_queryable: TRUE
company_knowledge_candidate: TRUE
domain: Inventory — Postage & Warehouse — LEDSone Postgres
User: Postage & Warehouse Team
Benefit status: >-
  Pass — 2,477 SKUs holding 1.25M units of stock that has not moved in over 90 days are now
  listed, prioritised and owned. The first version of that number was 3,751 and was wrong.

---

## 1. SYSTEM STATE

Start of day: three tabs (Inventory, Postage Information, SKU Fixed Price), the 2-hourly
cron running and publishing to the hub, and the dashboard at **6.05 MB**. End of day: four
tabs and **10.24 MB**.

## 2. WHAT CHANGED TODAY

**A fourth tab shipped: Slow-Moving Products & Components.** 16,490 rows — 2,477 holding
stock and 14,013 flagged as holding none — with search, priority / stock / item-type / PH
filters, sorting, pagination and CSV export, refreshed by the same cron as everything else.

**The dashboard remembers which tab you were on.** A reload used to drop you back on
Inventory. It now restores the tab, and does it in a tiny script *ahead* of the 10 MB data
script so the correct tab is the first thing painted rather than flicking into view.

**CSV export became tab-aware.** It exported the Ceiling Rose inventory from every tab,
under a filename with a hardcoded date. Each tab now exports its own rows and columns.

**The Postage Information header was corrected** and its table given its own scroll box, so
the horizontal scrollbar is reachable without scrolling to the bottom of a 38-row table.

## 3. POSTGRESQL FINDING — THE DATABASE IS FOUR TIMES LARGER THAN THIS PROJECT ASSUMED

This project had been working with five schemas. There are **twenty**. Two of them changed
what the dashboard can answer:

**`order_management`** — 1.19M order lines, 1.10M orders. This gives a **real last-sale
date**, which `inventory.product_history` never could: that table records only manual
recounts and supply receipts, never routine picking. The join is
`order_item_info.order_id → orders.id`, **not** `orders.order_id`, which is the marketplace
reference string.

**`staff.ph_categories`** — answers what PH means. It is a **person who owns a category**:
77 categories across 30 people, every one resolvable to a name. `ph_category_products.ref_id`
is never a SKU — it is an Amazon ASIN (`source_id 1`), an eBay item id (`2`) or a B&Q EAN
(`16`), each resolved through its own listing table.

## 4. GAP FOUND — THE FIRST VERSION OF THIS REPORT WAS WRONG

Shipped at 04:16 with **3,751 rows**. It was corrected to **2,477** the same morning after
the figure was challenged. Three defects, all in what counts as *movement*:

| Defect | Effect |
|---|---|
| No order-status filter | 10,445 Cancelled and 879 Deleted orders counted as movement |
| `order_combo` never read | 2.0M rows of component usage inside sold combos invisible |
| Ad-hoc `A+B+C` order lines not split | 48% of order-line SKUs are not catalogue SKUs at all |

**1,259 of the 3,751 rows were not slow-moving.** They sell steadily as combo components.
**858 of them were labelled "Never sold."** A further 530 rows carried the wrong idle count
and therefore the wrong priority band.

The worst case: **`MBEX3245BM`, 71,080 units, reported as never sold — it had sold 34 days
earlier**, inside combos. Mail bags almost never sell alone.

A second challenge asked why the tab showed 2,477 when `orders` grouped by status gives
1,294 open orders, or 15,368 SKUs unsold for 90+ days. Both were reproduced exactly and the
difference explained in §7 — neither number was wrong, they answer different questions.

## 5. VALIDATION RULE ADDED OR CHANGED

`validation/check-slow-moving.js` drives the page's own render, search, sort, filter and
paging code and asserts on the result. It grew to cover the three movement sources, the
zero-stock flag, name coverage, image identity and the PH filters.

Three more were written today:

- **`check-tab-memory.js`** — boots the page once per stored tab value, including a missing
  and a corrupt one, and checks where it lands *and that the restored view built its data*.
- **`check-first-paint.js`** — runs only the early restore script and asserts which panel is
  visible at first paint, before the data script parses.
- **`check-csv-export.js`** — drives the real `downloadCSV()` on each tab and checks the
  filename, columns and row count against what that tab is showing.

`apply.js` gained guards for the new block: at least 1,000 rows, the zero-stock flag must
match the quantity, no duplicate SKU, correct sort order, and — after the §4 corrections —
all three movement sources and the status rule must be present in the extractor source.

## 6. FAILURE MODE OR EDGE CASE

**Three runs refused to publish. Every refusal was correct.**

1. **`*** every row actually holds stock — 14030 rows hold none`** — the zero-stock change
   altered the contract and the old guard caught it. Guard updated, not removed.
2. **`*** sorted Critical first, longest idle first`** — same change, the sort key had gained
   a stock dimension.
3. **Query equivalence failed at the pre-flight** after a second `<script>` was added to the
   page: six tools located the data block with `indexOf('<script>')` and began slicing from
   the wrong one. All six fixed to `lastIndexOf`.

**A date-boundary bug worth remembering.** The dashboard showed 3,741 rows against the
database's 3,751. Differencing raw timestamps loses a day whenever a sale happened in the
afternoon, so rows sitting exactly on the 91-day boundary fell out. Postgres compares
`::date`; the extractor now normalises to UTC midnight. Ten rows, silently wrong.

**A test that inspected only what was on screen.** A check claimed never-sold rows rendered
correctly while looking at just the 12 visible rows. Rewritten to seek one out and render it.

**Images: 79 slow-moving and 73 Fixed Price images were served over `http://`.** The hub
page is https, so every one would have been blocked as mixed content and shown as a broken
thumbnail. Same host, same file — only the scheme was wrong.

## 7. DECISIONS MADE TODAY

| Decision | Why |
|---|---|
| Population = holds stock AND has not moved in 90+ days | The tab asks for Required Action and Action Quantity; you cannot act on a SKU holding nothing |
| Zero-stock rows kept and **flagged**, not dropped | Hiding 14,013 rows hides the fact; the default view still shows only the 2,477 that are actionable |
| A SKU with no stock **and** no sale ever is excluded | A dormant catalogue entry is neither a stock problem nor a sales signal |
| Refunded orders count as movement | The item physically left the shelf; the refund is a separate later event |
| Names: UK listing title first, then the order line | `products.title` is `Combo Default Title.` on 37,481 rows |
| An image naming a different SKU is not shown | 38 of 156 combo images point at another product; a wrong photo on a disposal report is worse than none |
| Six workflow columns render as "—" | Required Action, Action Quantity, Assigned Person, Target Date, Status and Team Notes exist **nowhere** in the database |

## 8. COMPANY KNOWLEDGE EXTRACT

- **Stock leaves the shelf three ways**, and only one of them is a line on an order: a direct
  sale, usage inside a sold combo (`order_combo`, 2.0M rows), and a component named inside an
  ad-hoc `A+B+C` order line. Read one source and a fifth of the report is wrong.
- **`inventory.product_history` cannot answer "when did this last move."** It logs manual
  recounts and supply receipts only.
- **PH = a person who owns a category**, joined by marketplace reference, not by SKU.
- **`shipping_address.country_id` has no lookup table** anywhere in the database.
- **48% of order-line SKUs are not in `inventory.products`** — they are ad-hoc combos written
  straight into the line.

## 9. LLM STANDARD CHECK

Every figure in this log is reproducible from `logs/refresh.log`, the extractors under
`sql/refresh/extract/`, or a query against the LEDSone database. No number here was carried
over from a previous day without being re-measured.

## RESULT

| | Start of day | End of day |
|---|---|---|
| Tabs | 3 | **4 — Slow-Moving Stock added** |
| Slow-moving SKUs listed | 0 | **16,490** (2,477 holding stock, 1.25M units) |
| Item names on that tab | — | **15,966 of 16,490 (96.8%)** |
| Images on that tab | — | **16,350 of 16,490 (99.2%)**, references only |
| Reload behaviour | always Inventory | **restores your tab, painted first** |
| CSV export | Inventory only, hardcoded date | **per tab, data's own date** |
| Page size | 6.05 MB | **10.24 MB** |

Runs on 2026-08-31: **27 total — 23 OK, 3 refused to publish, 4 unattended cron**
(04:30, 06:30, 08:30, 10:30 UTC; `CRON_TZ=Asia/Colombo` puts the 2-hourly job at :30 past
even UTC hours). Published to hub **218** and verified byte-for-byte on every OK run.
Not committed, not pushed.

**Carried into 1 September:**
1. Total SKUs on Fixed Price still shows 30,214 of 44,332 — analysed, fix specified, awaiting a decision.
2. `WS` category conflict — Lighting on Fixed Price, Wall Arm on Inventory.
3. 38 combo images in `inventory.product_images` name the wrong SKU — needs fixing at source.
4. `tech_user` connection limit still unraised.
5. 524 slow-moving rows have no name anywhere — almost all `ENC*` eBay placeholders.

## BLOS GOVERNANCE NOTE

| Value | Where it lives now | Why it must be governed |
|---|---|---|
| Movement = direct sale + combo usage + ad-hoc combo line | `sql/refresh/extract/slow-moving.js` | Omitting one source put 1,259 actively-selling SKUs on a disposal report |
| Cancelled and Deleted excluded, Refunded kept | same, guarded in `apply.js` | Decides whether stock that never left counts as having moved |
| 90-day threshold and the three priority bands | same | No slow-moving rule exists in the database; this is the interim rule from the requirement |
| Zero-stock rows flagged, not dropped | same + `check-slow-moving.js` | The difference between a 2,477-row action list and a 16,490-row audit |
| Name priority: UK listing, then order line | same | `products.title` is a placeholder for every combo |
| An image must be a reference, never a copy | same | Keeps a 10 MB page from becoming a 400 MB one |
| PH resolution via ASIN / item id / EAN | same | `ref_id` is never a SKU; a direct join silently returns nothing |
