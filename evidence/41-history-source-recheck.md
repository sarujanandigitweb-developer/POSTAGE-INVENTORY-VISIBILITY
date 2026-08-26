# Evidence 41 — Stock history: re-check before building the History button

**Date:** 2026-08-26 · Read-only. Triggered by: "check whether the database maintainer
has added the history details." Not committed, not pushed.

## Verdict

**NOT ADDED.** There is still no stock-history or stock-movement source in LEDSone.
Six independent checks, all negative. The History button in spec §4.6 has nothing to open.

## What was checked, today

### 1. Table names, every schema

Searched `information_schema.tables` across all non-system schemas for
`hist|log|movement|audit|adjust|transfer|trail|journal|ledger|grn|receipt|stock_ch|track`.

| Hit | What it actually is |
|---|---|
| `suppliers.order_item_logs` | purchase-order line field edits (known since evidence/05) |
| `employee_management.logs` | HR/task change log — see check 5 |
| `listings.bandq_transfers` | B&Q catalogue file imports (`ean`, `import_status`, `file_url`) |
| `business_reports.amz_catalog_performance_data` | Amazon reporting |

**No stock history table.**

### 2. Column names — searched for the §8.2 fields directly

A new history table could have any name, so the distinctive field list from the spec was
searched instead: `stock_before|stock_after|old_stock|new_stock`,
`from_location|to_location|from_unit|to_unit|from_warehouse|to_warehouse`,
`informed|changed_person|changed_by|updated_by|performed_by`, `remark|movement|action_type`.

9 hits, **all unrelated**: accounting `transaction_type`, `amazon_campaigns.keywords.bid_updated_by`,
`employee_management.attendance.remark`, `staff.informed_leave_balance`,
postage-rate `source_updated_by`, `order_item_logs.change_by`, `order_items.remarks`.

**No before/after stock pair exists anywhere in the database.**

### 3. `inventory.physical_product_stock` — unchanged

```
inventory bigint, warehouse integer, quantity integer, reserved_quantity integer,
shelf_quantity integer, shelf_capacity integer,
product_shelf_location varchar, product_bulk_location varchar
```

**No timestamp, no user column, no before/after.** Not even a last-changed date. Identical
to evidence/05 and evidence/34.

### 4. Every table in the `inventory` schema

`end_of_line_products, local_inventory_current_stock_location_wise, physical_product_stock,
product_images, product_images_bk_20260813, product_mapping, product_pk, products, warehouse`

None is a history table. `local_inventory_current_stock_location_wise` is
`(inventory_id, warehouse_location, stock)` — a current-state snapshot with no date.

### 5. `employee_management.logs` — the one plausible generic audit trail

It has the right *shape* (`component_name, action, field_name, old_value, new_value,
made_by, created_at`), so its contents were checked rather than assumed. 15 component
types, ~48,000 rows:

`assigntask` 19,950 · `notes` 10,566 · `StaffLeave` 8,526 · `task` 7,486 · `staff` 1,280 ·
`status` · `Task` · `team` · `backup_staff` · `Team` · `assignteam` · `Staff` ·
`Department` · `department` · `AssignTask`

**Every one is HR or task management. Not one inventory or stock component.**

### 6. The 20 most recently created tables in the database

By descending `pg_class.oid`: B&Q listing tables (10), Amazon campaign tables (3),
customer-service message tables (4), business-report tables (2), and
`inventory.product_images_bk_20260813` — an image backup from 2026-08-13.

**Nothing stock-history related has been created recently.**

### 7. Independent confirmation from the second connector

A second Postgres connector (`postgres_2`) exposes a curated BI database with its own
documented business rules. Its stock table definition states, unprompted:

> **No historical snapshots** — current live stock only; no time-series stock queries are possible.
>
> Has `updated_at` … It is **not** a stock-history column; it only records when the row was
> last refreshed.
>
> **No warehouse-level detail exists anywhere in the database** — country granularity is the
> finest available.

That is a second, separately maintained system independently confirming the same absence —
and it is *coarser* than LEDSone, tracking only UK / Germany / US.

## What this means for spec §4.6 and §8

Every field in the §8.2 table structure is currently unavailable:

| §8.2 column | Source today |
|---|---|
| Date | **none** — `physical_product_stock` has no timestamp |
| From Location / To Location | **none** — no transfer record exists |
| Stock Before / Stock After | **none** — only the current value is stored |
| Qty | **none** — derived from before/after, neither of which exists |
| Action | **none** |
| Informed Person / Changed Person | **none** — stock rows carry no user |
| Remarks | **none** |

§8.3 "Goods Received from Container" additionally needs a received date, which
evidence/34 §3.1 established does not exist — `suppliers.orders.status_arrived` is a
**boolean**, and `invoice_date` / `updated_at` were both rejected as substitutes.

**The spec describes a system that must begin recording movements. It is not a reporting
gap over data that already exists.** `physical_product_stock` is overwritten in place: when
a quantity changes, the previous value is gone.

## Recommendation

Do not build the History button against the current database — it would open an empty panel
on every SKU, which reads as "this SKU has never moved" rather than "we do not record this".

The blocking item is a **write-side change owned by whoever maintains the stock-update
process**: an append-only movement table written inside the same transaction as every stock
update. Until one row exists, the panel has nothing to show.

---

# Part 2 — Stock History dialog built against the specification

**Decision (2026-08-26):** build the UI now, ahead of the source, so the record
structure is fixed, reviewable and agreed before anyone writes the logging code.
The dialog doubles as the written specification handed to whoever maintains the
stock-update process.

## Form factor

Spec §4.6 allows either an inline expansion or a popup form. The first build used the
inline expansion; on review the team asked for the **popup**, so the panel was rebuilt
as a centred modal dialog titled **Stock History**, with the SKU and Region named
beneath it and the movement table below that.

The dialog lives **outside** the inventory table. That matters for two reasons: it
survives every re-render without needing to be re-opened, and it is never clipped by
the table's horizontal scroll — an inline panel inside a 25-column scrolling table is
partly off-screen the moment the reader has scrolled right to reach the History button.

Closes on the **×**, on the backdrop, and on **Escape**. Opening a different SKU or
region replaces the dialog rather than stacking.

## Columns rendered

Spec §8.2's ten columns, **in the order the specification lists them**:

`Date · From Location · To Location · Stock Before · Stock After · Qty · Action ·
Informed Person · Changed Person · Remarks`

`Stock Before`, `Stock After` and `Qty` render right-aligned with tabular figures.
A blank field renders *Unavailable*, never an empty cell — the project rule.

**Container Number is recorded but not displayed.** §8.2 does not list it as a column
and the agreed dialog format does not show it, but §8.4 guarantees it on every record
and §8.3's *Goods Received from Container* needs it. It is therefore kept in the stored
record shape (`cn`) and left out of the table. If the team wants it visible it is a
one-line change.

## Movement types shown

All six from §8.3 are listed under a collapsed *What must be recorded* disclosure:
Unit-to-Unit Transfer · Manual Stock Correction · Stock Increase · Stock Decrease ·
Goods Received from Container · Warehouse Change — followed by the §8.3 rule verbatim:
*every stock movement, without exception, writes one row; no stock change may occur
without a corresponding audit record.*

## The empty state is the important part

The dialog must **never** render an empty table. An empty table reads as *"this SKU has
never moved"*, which is false and worse than saying nothing. Instead the column headers
render — so the format can be reviewed — above a single amber **GAP** row:

> GAP — no verified PostgreSQL stock-movement history source is available for this SKU.

Beneath the table, a smaller note carries the reason: that
`inventory.physical_product_stock` stores only the current quantity, with no timestamp,
no user and no before/after values, and is overwritten in place so the previous value is
gone; that this was re-checked against LEDSone on 2026-08-26 (Part 1 above); and that the
dialog fills automatically once every stock update writes one row into an append-only
movement table **in the same transaction as the stock change**. That note disappears as
soon as real rows exist.

The button's tooltip carries the same reason when a SKU has no movements, so the reader
learns why on hover rather than after clicking. That reuses `NA_REASON.hist` — the exact
string the cell used to display — so nothing was lost in the change.

## How it fills

```js
const STOCK_HISTORY = {};   // sku -> [ {dt,fl,tl,sb,sa,qt,ac,ip,cp,rm,cn,rg} ], newest first
```

Empty today. `rg` is the region the movement happened in, so the UK and German dialogs
stay separate. Populating this object is the **only** change needed when the source
exists — the button already shows a movement count, the table already renders rows, and
both were proven with a fixture in the harness.

## Validation

`node validation/test_lampshade.js` → **ALL PASS — 828 passed, 0 failed**
(783 before; +45 assertions). Phase 34 asserts:

- the cell is a button in both regions, keyed `sku|region`, with no inline panel row
- the dialog opens, names the SKU and region, and closes on the button, the ×, the
  backdrop and Escape — but **not** on a click inside the dialog
- opening a different SKU or region replaces it rather than stacking
- it lives outside the table, so the inventory row count is untouched
- §8.2's ten columns appear in the specified order; the three quantities are numeric
- all six §8.3 movement types and the no-exception rule are shown
- the empty state is a GAP row carrying the agreed wording, spanning all ten columns,
  and **never** contains the words "never moved" or "no movement history"
- with a fixture injected: rows render, regions stay separate, numeric cells are
  right-aligned, a blank field renders *Unavailable*, the button shows a count, the
  explanatory note disappears, and a different SKU is unaffected
- Reset closes the dialog; CSV stays 25 columns — History is a control, not data
- buttons render for every section, all 14 dataset locks byte-identical

## Layout corrections after review

Two things were wrong on first render and were fixed:

**The table had its own horizontal scrollbar.** Ten `nowrap` columns in a 1120px dialog
overflowed, so the reader had to scroll sideways inside a dialog — the exact problem the
dialog was meant to avoid. Fixed properly rather than by hiding the bar: the dialog is
now `min(1360px, 100% - 48px)`, the table is `table-layout:fixed`, and each column
declares its width on its own definition (`HIST_COLS[n][3]`, summing to 100%), emitted as
a `<colgroup>`. Long text now wraps inside its cell instead of pushing the table sideways,
so the table can never gain a scrollbar. `.hmscroll` is `overflow:hidden`.

**The dialog was flush against the top of the page.** It opened at `56px`, level with the
page header, which read as an overlay pinned to the chrome rather than a dialog. Now
`padding:13vh` — `align-items:flex-start` with a viewport-relative offset, deliberately
not `align-items:center`, which clips the top of a dialog once its content overflows.

Header casing was also corrected: `.htab th` inherited `text-transform:uppercase` from the
inventory table, rendering `FROM LOCATION`. It is now explicitly `none`, matching the
agreed format's title case.

## Still blocked on

The append-only movement table itself. Nothing in the UI can create one: the dashboard
is read-only and single-file. The write must happen inside the stock-update process.

---

# Part 3 — Load failure after the dialog was added, and the harness gap that hid it

**Reported:** the page refreshed to an empty table — `Showing 0 of 0 SKUs`, no category
dropdowns, headers only.

## Cause

The dialog markup was appended **after** `</script>`. The script binds its close
handlers at load:

```js
$('hmx').addEventListener('click', closeHist);
```

An element authored below the script does not exist when the script runs, so
`getElementById` returned `null`, `.addEventListener` threw, and **the entire inline
script died before `buildCats()` or the first `render()`**. Every dataset was still in
the file; nothing had rendered.

**Fix:** the dialog is now authored immediately above `<script>`.

## Why 828 assertions passed anyway

The harness stub resolved every id, always:

```js
getElementById: id => els[id] || mkEl(id),      // never null
```

A browser returns `null` for an id that is absent — or that appears below the script
looking it up. The stub manufactured an element instead, so the crash was
**unreproducible in the harness**. This is the harness's most serious miss to date: it
was not a wrong assertion, it was a whole class of failure the stub could not express.

## Fix to the harness

The markup is now the authority, checked **before** the pre-built element map:

```js
const DOM_IDS = new Set();   // every id="..." occurring ABOVE <script>
getElementById: id => {
  if (!DOM_IDS.has(id)){ missing.push(id); return null; }   // exactly what a browser does
  return els[id] || (els[id] = mkEl(id));
}
```

Order matters: checking `els[id]` first would let a pre-registered id hide the very bug
this guards against — which is what happened on the first attempt at this fix.

New **Phase 0 — the page actually loads in a browser** asserts that every id the script
looks up exists above the `<script>` tag, that the dialog is authored before the script
that binds it, that rows rendered at load, that the category row was built, and that the
header does not read `0 of 0`.

**Verified by re-injecting the bug:** the harness now fails with the real browser error,
`TypeError: Cannot read properties of null (reading 'addEventListener')`, instead of
passing.

`node validation/test_lampshade.js` → **ALL PASS — 833 passed, 0 failed**.

## Rule added

```
Any element the inline script looks up at load MUST be authored above the <script> tag.
The DOM stub must return null for every id not present in that markup — a stub that
always returns an element cannot reproduce a load-time crash, and will report a green
suite for a page that renders nothing.
```
