# Evidence 53 — Current-state History audit

**Date:** 2026-08-28 · Read-only. **Nothing was rebuilt, nothing was changed.**

Audit only. No new table, no new parser, no new database object, no change to the
extraction logic. The existing implementation was driven through its own code paths and
observed.

## Phase 1 — Existing assets found

| Asset | Location |
|---|---|
| Dashboard | `dashboard/inventory-dashboard.html` |
| `HIST_RAW` | line 2009 — interned record, `d/a/l/p/r/c/s/t/h` |
| `STOCK_HISTORY` | line 2016, `decodeHistory()` — `sku -> region -> movements` |
| `HIST_TOTAL` | line 2036 — true count where it exceeds the 12 carried |
| `HIST_COLS` | line 1958 — ten columns, widths summing to 100 |
| `histBtn` / `histCell` | 2044 / 2060 — the clickable control |
| `histRowsHTML` | 2068 — the table body |
| `histCellHTML` | 2087 — per-cell rendering, blanks as a dash |
| `histElsewhere` | 2119 — names movements the open region does not show |
| `renderHist` / `openHist` / `closeHist` | 2137 / 2179 / 2180 |
| Dialog markup | line 554, `id="hmodal"` — **above** `<script>` |
| Parser | `sql/product-history-parser.js` — `parseLine()`, four types |
| Region rule | `sql/product-history-regions.js` |
| Extract / build / apply | `sql/build-stock-history.js`, `sql/apply-stock-history-v2.js` |
| Data | `sql/stock-history_data.json` |
| Prior validation | `validation/check-history-v2.js`, `sql/refresh/compare-history-received.js` |
| Prior evidence | `evidence/45`, `evidence/49`, `evidence/52` |
| New audit | `validation/audit-history.js` (read-only, added by this audit) |

## Phase 2 — UI, driven through the real code path

| Question | Result |
|---|---|
| Every row has a History control? | **Yes** — 5,852 UK + 5,852 German buttons |
| Actually clickable? | **Yes** — real `<button data-hs>` with `aria-expanded` |
| Opens the correct SKU? | **Yes** — 400/400 opened and identified correctly |
| Ever shows another SKU's history? | **No** — 0 mismatches |
| Closable? | **Yes** — `closeHist()` hides the dialog |
| SKU clearly identified? | **Yes** — `SKU: <b>…</b> · Region: <b>UK</b>` |
| Chronological? | **Yes** — 20/20 records newest-first |
| UK and German separated? | **Yes** — no German movement in a UK list, and none the other way |
| 12-per-region respected? | **Yes** — 20/20 within the cap |
| Existing design preserved? | **Yes** — Ceiling Rose still renders 332 rows, 0 missing element ids |

## Phase 3 — Display fields mapped to real properties

| UI column | Property | Populated |
|---|---|---|
| Date | `m.dt` | 23,952 (100%) |
| From Location | `m.fl` | **0** — see AMBER-1 |
| To Location | `m.tl` | 23,952 (100%) — Unit 3, Unit 4, Unit 18, Unit 5, Mark, German |
| Stock Before | `m.sb` | present where the source records one |
| Stock After | `m.sa` | present where the source records one |
| Qty | `m.qt` | computed, `after − before`, only when both are numeric |
| Action | `m.ac` | Goods received 11,204 · Stock change 11,366 · Manual correction 1,382 |
| Informed Person | `m.ip` | from `(<name> informed)` |
| Changed Person | `m.cp` | **23,952 (100%)** |
| Remarks | `m.rm` | 20,883 (87.2%) |
| Container Number | `m.cn` | 11,204 — rendered as a chip **inside** the Action cell, not a column |
| Warehouse | `m.tl` | the To Location column |

Two properties are carried but not rendered as columns: `m.tm` (time of day) and `m.sr`
(record source). Both ride in the tooltip of the Date and Action cells. **No field was
invented.**

## Phase 4 — The four types verified

| Source type | Movements |
|---|---:|
| UK stock changes (`inventory CSV`) | 11,366 |
| Supply | 8,247 |
| German Supply | 2,957 |
| German Inventory | 1,382 |
| **Total** | **23,952 across 4,306 SKUs** |

No fifth type is present. The field→warehouse map was re-tested on eight worked cases,
**8/8 correct**:

```
Unit3(Quantity)  203 -> 303   => Unit 3
Unit18(unit1)    300 -> 200   => Unit 18
Unit4(unit3)       5 -> 0     => Unit 4
Supply … Quantity changed from 15 to 215  => Unit 3, 15 -> 215   (the FINAL change)
germanInventory changed from 73 to 5      => German
German Inventory Changed from -10 to 0    => German   (capitalised variant)
German Supply … germanInventory Inventory changed from 2 to 102  => German
German Supply … - German Inventory changed from 9 to 209         => German
```

Both German wordings and both capitalisations are handled. Negative values survive:
**3,358** movements carry one. `Qty = after − before` holds on **23,952 / 23,952**.

## Phase 5 — Received logic

Unchanged and using the approved rule: the latest **`Supply` or `German Supply`** line
only; warehouse = the field that increased; date = the date on that line; supply code =
the `SU####` on that line; container = latest arrived container for the SKU in the
matching country ordered on or before that date.

No `updated_at` is used anywhere. No receipt is inferred from current stock.
`evidence/52` re-verified this at **11,704 / 11,704 SKU-region pairs identical**.

## Phase 6 — The limitation, stated plainly

**`inventory.physical_product_stock` carries no timestamp**, and **routine order picking
is never written to `inventory.product_history`.**

Proven while auditing: `CL3TBM`'s newest history line reads `Unit3 1818 -> 618`; the
dashboard holds 400 and the database holds 264. **Neither figure appears in the log.**

Therefore **`product_history` is not a complete physical stock audit trail.** It records
the four approved types only. The CSV-upload wording that carries USA, Canada and
Netherlands movements is excluded by deliberate scope, and 1,399 SKUs legitimately hold
both a UK and a German record.

## Phase 7 — Validation

`validation/audit-history.js`, using the page's own functions. It does not contradict
`sql/refresh/query-equivalence.js` or `evidence/52`; it observes the shipped UI.

Ten SKUs with both regions and with full 12-record histories were driven end to end:
**20 SKU/region records**, all chronological, all within the cap, all with date, action
and warehouse set, and the **rendered row count equal to the stored record in 20/20**.

## Phase 8 — Findings

### GREEN — working, no change required
Buttons, SKU identity, open/close, region separation, sorting, the 12-cap, Qty
arithmetic, the four types, the field→warehouse map, container chip, person, remarks,
and the existing dashboard regression. **18/18 automated checks PASS, 0 issues.**

### AMBER-1 — `From Location` is empty on every row
Not a bug. Unit-to-unit transfers occur on 2 of 84,424 source lines, neither a dashboard
SKU (evidence/45). The column is in spec 8.2 so it is rendered, and every cell shows the
quiet dash with *"Not recorded for this movement."* **Reviewer decision:** keep the
column, or drop it until the warehouse starts logging transfers.

### AMBER-2 — the dialog displays a completeness rule the data does not meet
The `<details>` block headed *"What must be recorded (spec 8.3)"* ends with:

> *Rule: every stock movement, without exception, writes one row. No stock change may
> occur without a corresponding audit record.*

That is the **requirement**, correctly labelled. But nothing beside it says the actual log
does not meet it, and Phase 6 forbids leaving that impression. **Reviewer decision:** add
one line stating the limitation. **No change made — this is a wording decision, not a
defect.**

### AMBER-3 — `HIST_OTHER` has an unreachable branch
`HIST_OTHER = { CA, US, NL, FR }` feeds `histElsewhere()`. The parser now emits only
`UK` and `DE`, so the Canada/USA/Netherlands/France names can never appear. The function
itself is **not** dead — it correctly reports the other region for the **1,399** SKUs
holding both. Harmless; it becomes live again if the CSV-upload types are ever restored.

### AMBER-4 — a code comment contradicts its own function
`histRowsHTML` is prefaced *"The SKU's complete recorded history, NOT filtered by
region"*, while the first line reads `histFor(sku, region)`. Left over from before the
UK/German split. Documentation only, no behavioural effect. **No change made.**

### RED — none
No wrong SKU, no wrong history, no wrong quantity, date, warehouse, no duplicate history,
no broken UI.

## Phase 9 — Action taken

No defect was found, so **the History logic was not modified**. The only artefact created
is `validation/audit-history.js`, which is read-only. The four AMBER items are reviewer
decisions and are recorded here, not acted on.

## VERDICT: **GREEN**

The History implementation is correct as built and matches the approved scope. The AMBER
items are known limitations and wording decisions, not defects.
