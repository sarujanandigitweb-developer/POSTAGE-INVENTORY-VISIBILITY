---
date: 2026-09-03
developer: sarujanan
project: Postage Inventory Visibility
project_code: INV-PIV
phase: >-
  Phase-10 — Container Details and Recently Dispatched shipped; the postage sheet moved to a
  new workbook; a date bug found in seven places across both dashboards
requirement_id: REQ-10
deliverable_id: D01
status: >-
  Shipped and published. Eight cron runs: five OK, two REFUSED by the guards, one blocked by
  a stale query-equivalence snapshot. Three manual publishes to hub 218, each verified
  byte-for-byte. Three commits (11:21, 17:15, 17:15) plus 27 files still uncommitted.
evidence_location: >-
  git 838cf52, ae5d82e, 8c4c093; logs/refresh.log; sql/refresh/daynum.js,
  extract/recent-dispatch.js, extract/container-details.js; validation/check-postage.js,
  check-recent-dispatch.js, check-day-numbers.js; postage-inventory/lib/dates.js, lib/sheet.js
blos_keys_used:
  - open_order_is_status_not_shipped_flag
  - one_shipment_per_order
  - country_id_has_no_lookup
  - completion_has_no_timestamp_of_its_own      (NEW — three tiers are needed to date it)
  - market_place_is_a_country_not_a_channel     (NEW — the channel is sub_source -> source)
  - a_day_number_is_a_calendar_day              (NEW — never a divided timestamp)
  - a_badge_cannot_wrap                         (NEW — its column must fit it)
  - cell_rules_are_table_qualified              (NEW — a reused class inherits nothing)
hardcoded_thresholds:
  - dispatch window = 3 days; lookback guard = 90 days (oldest real case was 20)
  - turnaround tones = <=24h ok, <=72h warn, >72h bad
  - postage sheet cache = 60s server-side
  - badge column margin = 8px required, not a bare fit
three_am_standard: TRUE
llm_queryable: TRUE
company_knowledge_candidate: TRUE
domain: Inventory — Postage & Warehouse — LEDSone Postgres + two Google workbooks
User: Postage & Warehouse Team
Benefit status: >-
  Pass — the team can now see what has gone out as well as what is waiting, every container's
  manifest, and postage prices from the workbook that is actually maintained.

---

## 1. SYSTEM STATE

Start: five tabs on the published dashboard, one tab ported to the Next.js app. End: **six
top-level tabs with the two dispatch views grouped under one**, a new Recently Dispatched
tab carrying 2,290 orders, Postage reading **two** Google workbooks, and the Next.js app
grown to 8 API routes and 18 components.

## 2. WHAT CHANGED TODAY

**Container Details shipped** (`838cf52`) — 36 containers, 4,222 lines, 1,737,500 pieces,
with a per-container manifest dialog.

**Recently Dispatched shipped** — the complement of the queue: orders the team FINISHED in
the last 3 days, with turnaround, courier, tracking and carrier status.

**Pending Dispatch became Dispatch Queue**, its "All orders" SLA filter replaced by a
**Warehouse** filter, and the two dispatch views were folded under one top-level **Dispatch**
tab — seven tabs back to six.

**Postage Information moved to a new workbook.** Prices now come from the maintained book;
Dimensions, Contact Details, Box Sizes and Box Purchase History still exist only in the
original, so both are read.

**The Next.js app gained five tabs** — Postage, Fixed Price, Slow-Moving, Container Details,
and both dispatch views — plus the price column, which had been blank.

## 3. POSTGRESQL FINDING — A COMPLETED ORDER HAS NO COMPLETION TIME

`orders.status = 'Completed'` says an order is done and carries **no timestamp of its own**.
The obvious candidates each miss the same 18%:

| Source | Coverage of 6,104 recent completions |
|---|---|
| `order_info.shipped_time` | 4,702 — 77% |
| `shipment.shipment_created_at` | 5,015 — 82% |
| either of the two | 5,020 — 82% |

**The missing 18% is not random.** They are Amazon **Prime** and **Wayfair** orders: those
marketplaces ship the parcel themselves, so this system never creates a label and never
stamps a dispatch time. Their shipment row sits at status `New` with no tracking — but the
row's own audit column `shipment.updated_at` **is** written.

Completion is therefore read in three tiers: `shipped_time` → label time → audit time. Tier 3
is safe to trust: where tiers 1 and 3 both exist they agree **within 24 hours on 4,753 of
4,763 orders (99.8%)**, averaging 0.72 hours apart. With all three, **every one of the 17,051
completions in the last 30 days is dated — zero undated rows.**

**A second finding: `orders.market_place` is a COUNTRY id, not a sales channel.** Its lookup
lists Australia, Germany, UK, US. The Marketplace column on the Dispatch Queue has therefore
been showing a country all along. The real channel is `sub_source → source` —
Amazon / eBay / Shopify / B&Q / Wayfair — and it resolves for **100%** of these orders.

## 4. GAP FOUND — A DAY NUMBER IS A CALENDAR DAY, NOT A DIVIDED TIMESTAMP

Spot-checking a dispatched order against the database, `302-1704723-1976346` read **1 Sep**
where the record says **31 Aug**.

`Math.round(ms / 86400000)` pushes every **afternoon** timestamp onto the next date. That was
**44% of the Dispatch Queue** and 38% of the dispatch rows.

`Math.floor` looks like the fix and is **also wrong**: these are `timestamp without time zone`
columns, node-postgres builds the Date from the stored wall clock in the process's timezone,
and this host runs **UTC+5:30** — so anything stored before 05:30 slides back a day. In the
Next.js app that hit **100% of Amazon rows, 99.9% of eBay and 83% of Shopify** on the Fixed
Price "Last Updated" column.

The correct conversion reads the calendar fields back out. Both dashboards now route every
date through one place — `sql/refresh/daynum.js` and `postage-inventory/lib/dates.js` — and
**seven call sites** were fixed: pending-dispatch, recent-dispatch, slow-moving and
fixed-price in the pipeline; fixed-price, pending-dispatch and slow-moving in the app.

**A guard that guards nothing.** The obvious data check — *"the gap between the two dates must
match the turnaround"* — was written, tested against the ORIGINAL broken data, and **passed on
all 2,228 rows**. Both dates shift by the same rule, so the difference stays plausible. The
check was thrown away and replaced with a source-level one, with that measurement recorded in
`validation/check-day-numbers.js` so nobody rebuilds the useless version.

## 5. VALIDATION RULE ADDED OR CHANGED

Three new validators — **13 → 16**:

- **`check-recent-dispatch.js`** — drives the tab's filters, dialog and CSV through the page's
  own code; asserts the day bands partition the window and that every class the cells use is
  **styled for that table**.
- **`check-postage.js`** — parses both workbooks from fixtures; `POSTAGE_LIVE=1` re-reads the
  real sheets and compares.
- **`check-day-numbers.js`** — unit-tests the date conversion on the two edge cases and
  forbids any extract from hand-rolling a day number.

`apply.js` now gates on `check-recent-dispatch` before publishing.

Four existing validators were found to be **frozen to numbers rather than facts** and rewritten
to derive: `check-responsive` (a hardcoded `>=1010` breakpoint that had outlived two
relabellings, wrongly passing a seven-tab strip then wrongly failing a six-tab one),
`check-container-details` (hardcoded column composition), `check-tabs-wired` (a hand-kept wrap
map), `check-first-paint` (knew four panels of seven).

## 6. FAILURE MODE OR EDGE CASE

**A class that is styled for another table inherits nothing.** Cell rules here are
deliberately table-qualified (`table.pdtab td.pd-sku`). The new tab reused those class names
and got **only** the shared base — `white-space:nowrap` with no overflow rule — so every long
value painted over the column beside it. Nothing errored. In the Next.js app it was worse:
**no table had a `<colgroup>` at all**, so `table-layout:fixed` split the width equally
between the columns and all five tables overflowed.

**A badge cannot wrap out of trouble.** `Awaiting Courier Collection` is a ~188px nowrap badge
that had been sitting in a **144px** column on 120 Dispatch Queue rows, painting over Days
Pending. Found by measuring, not by looking. The check now demands **8px of margin**, because
a column sized to the exact prediction overflows the moment the estimate is a shade low.

**Removing three columns broke the fourth.** `table-layout:fixed` hands leftover width to
every column **equally**, so dropping Cartons/CBM/Suppliers took the declared total from 1444
to 1056 and inflated all nine survivors by 82px each — leaving the Manifest button adrift in a
186px cell. The reported symptom was "the button is misaligned"; the cause was the column.

**A raw text scan missed a heading that the parser finds.** `4. Contact Details` is quoted in
the legacy CSV, so a `grep` for headings skipped it and folded its 28 rows into postage
Dimensions. I reported five sections to the user when there are six — corrected, and the
28-row table was carried over rather than lost.

**Two self-inflicted outages.** `next build` writes to the same `.next` directory a running
dev server is using; I diagnosed that, then **did it again** minutes later. And a `pkill -f`
matched its own shell (exit 144) — the exact trap this repo's own `refresh.sh` documents in a
comment.

## 7. DECISIONS MADE TODAY

| Decision | Why |
|---|---|
| Completion dated by three tiers, not one | One source misses 18%, and that 18% is entirely Prime and Wayfair |
| Turnaround in **hours**, not days | A same-day dispatch must read "6h", not round away to "0 days" |
| "Label Created" carries **no** colour | It is 80% of rows; colouring the ordinary case leaves nothing for exceptions |
| Marketplace gets a dot, not a tone | It is an identity, not a severity — Amazon in amber reads as a warning about Amazon |
| Prices from the new workbook, the other four tables from the old | Each table read from wherever it is actually current |
| The legacy copies of the two price tables are NOT taken | Two sources for one number can disagree |
| Dispatched came **off** the Recently Dispatched table | Too many columns; it stays in the filter, the sort, the dialog and the CSV |
| Six columns with no data render as "—", not omitted | An absent column looks like an oversight; "—" says the database has no answer |

## 8. COMPANY KNOWLEDGE EXTRACT

- **A Completed order carries no completion timestamp.** Three tiers are needed, and the
  third is what covers marketplace-shipped orders.
- **`orders.market_place` is a country, not a channel.** The channel is `sub_source → source`.
- **A day number must come from the calendar fields**, never from dividing a timestamp —
  rounding moves afternoons, flooring moves early mornings on a +05:30 host.
- **A data-level invariant cannot catch a systematic date shift**; that was measured, not
  assumed.
- **Cell rules are table-qualified here.** A reused class name inherits nothing, and a fixed
  table with no `<colgroup>` divides its width equally and overflows.
- **`shipping_address.country_id` still has no lookup table** — ids run past 360 and match
  nothing. Confirmed again today.

## 9. LLM STANDARD CHECK

Every figure is reproducible: the coverage percentages and the 99.8% tier agreement from
queries against `order_management`; the run outcomes from `logs/refresh.log`; the row counts
from the embedded blocks; the 996/996 price agreement from the Next.js API against the
published page's own `SHOPIFY_PRICE` block. The useless-guard result in §4 was produced by
running the discarded check against the original broken data.

## RESULT

| | Start of day | End of day |
|---|---|---|
| Tabs on the published page | 5 | **6, with two grouped under Dispatch** |
| Recently Dispatched | none | **2,290 orders, 1,708 within 24h** |
| Container Details | none | **36 containers, 1,737,500 pieces** |
| Postage sections | 1 workbook | **6 sections from 2 workbooks** |
| Date call sites with the bug | 7 | **0** |
| Validators | 13 | **16**, three gating the publish |
| Next.js API routes | 1 | **8** |
| Next.js tables with column widths | 0 of 5 | **5 of 5** |
| Page size | 11.25 MB | **12.22 MB** |

Runs on 2026-09-03: **8 — five OK, two refused, one blocked on query equivalence.** Three
manual publishes to hub **218**, verified byte-for-byte each time; last sha `27a6c58abf0aa39f`.

**Carried into 4 September:**
1. **27 files uncommitted**, including the whole Recently Dispatched tab and the Postage rework.
2. The **990px tab-strip breakpoint** and the Dispatch sub-strip were sized by arithmetic, not
   measured in a browser.
3. Next.js **Container Details** still shows Cartons/CBM/Suppliers and lacks the badge set.
4. Sortable column headers and the "Fit width" toggle are not ported to the Next.js app.
5. The six items carried out of REQ-08 remain open — Total SKUs 30,221 vs 44,332, the `WS`
   category conflict, 38 miscaptioned combo images, `country_id`, the `tech_user` limit,
   and `CRON_TZ`.

## BLOS GOVERNANCE NOTE

| Value | Where it lives now | Why it must be governed |
|---|---|---|
| Completion = shipped_time → label → audit | `sql/refresh/extract/recent-dispatch.js` | One source silently drops every Prime and Wayfair order |
| Channel = sub_source → source | same | `market_place` is a country; the column has been mislabelled |
| Day numbers via one helper | `sql/refresh/daynum.js`, `postage-inventory/lib/dates.js` | Seven call sites had it wrong two different ways |
| A badge's column must fit it, with margin | `validation/check-recent-dispatch.js` | 120 rows were overflowing silently before it was measured |
| min-width = the exact sum of the columns | both dashboards' checks | Removing columns inflates the rest and strands the controls |
| Prices from the current workbook only | `postage-inventory/lib/sheet.js`, dashboard `PG_TABS` | The legacy book holds rival copies of the same two tables |
