date: 2026-08-26
developer: sarujanan
project: Postage Inventory Visibility
project_code: INV-PIV
phase: Phase-04 — Audit Trail, Live Sources & Correctness Repairs
requirement_id: REQ-04
deliverable_id: D01
status: Completed — From Location unrecorded at source; page weight now 4.7 MB
evidence_location: /home/led-247/POSTAGE-INVENTORY-VISIBILITY/evidence/41–46, validation/, sql/, dashboard/inventory-dashboard.html, hub/
blos_keys_used:
  - population_source_sheet_sot_tab
  - population_source_sku_prefix_declared
  - warehouse_unit_map                       (Unit 5 = warehouse 33, now PROVEN)
  - container_arrived_only
  - container_latest_by_order_date           (NEW — replaces max(container_name))
  - shopify_price_listing_data_channel_3     (NEW — replaces listings.shopify_listings)
  - stock_history_free_text_product_history  (NEW)
hardcoded_thresholds:
  - stock history carried per SKU per region = 12 most recent
  - Shopify store preference = ledsone (sub_source 104) first, then any UK store
  - Shopify price filter = which_channel 3, wrong_sku 0, market_place UK, price > 0
  - container placeholder names = UNASSIGN, UNASSIGNED, N/A, '-'
  - postage sheet = 1-4AnU5osx50_LRwwBPXwtVYWG_dk09psx8Jgsd3mYHI, gid 1966712240
  - postage table one-line breakpoint = min-width 118px per column (92px numeric)
  - publish timeout = 300s (hub/publish.sh)
three_am_standard: TRUE
llm_queryable: TRUE
company_knowledge_candidate: TRUE
domain: Inventory — Postage & Warehouse — LEDSone MCP + Google Sheets
User: Postage & Warehouse Team
Benefit status: Pass — stock history, live postage data and three data-correctness repairs delivered

---

## 1. SYSTEM STATE

At the start of the day the dashboard held **twelve sections, 5,661 SKUs**, classification
self-maintaining, regression at **783 assertions**. Three things were recorded as
permanently unavailable or unresolved:

- **Stock history** — evidence/41 had concluded, after six checks, that LEDSone held no
  stock-movement source of any kind. The History column rendered *Unavailable* on every row.
- **Shopify price** — a validated fix existed but was **not applied**; 37% of rows showed an
  ambiguous price range rather than a price.
- **Last Container** — 489 SKUs with an arrived container showed no container name,
  because more than one container existed and no rule was known to choose between them.

By the end of the day all three were resolved, and two of them were resolved because the
original conclusion was **wrong**.

## 2. WHAT CHANGED TODAY

**Stock history was found and delivered.** `inventory.product_history` — 6,316 rows, 30 MB
of newline-separated **free text**, back to 2020-12-07. 468,923 lines were classified and
84,424 stock-movement lines parsed into 85,180 movements. The History column became a
clickable button opening a dialog with the ten columns the specification defines.

**Shopify price was rebuilt on `public.listing_data`** (`which_channel = 3`,
`wrong_sku = 0`). Exact prices **1,222 → 3,302**; ambiguous ranges **2,100 → 18**.

**Last Container was re-resolved by `order_date`**, replacing a text maximum.

**A UK Unit 5 column was added** (warehouse 33), stock only.

**A second top-level view, Postage Information, was added** — the first part of this
dashboard that is not embedded data. It reads a Google Sheet live at view time.

**The regression suite grew from 783 to 1,121 assertions**, and now takes **176 seconds**.

**The dashboard was published to hub page 218 four times**, each verified from an
independent connection.

## 3. POSTGRESQL / MCP FINDING

**Finding 1 — `inventory.product_history` exists, and evidence/41 was wrong.** It holds
per-product stock history as prose. It has **no SKU column** (join `inventory_id →
products.id`) and its `source_created_at` / `source_updated_at` are rebuild timestamps, not
business dates — the real event dates are inside the text.

**Finding 2 — 81% of that table is not stock history.** Of 468,923 lines, **380,777** are
`Product was editted by <user> On <date>` catalogue edits, plus 2,717 product flags
(`outofstock`, `endofline`) and 1,426 order cancellations. Only **84,424** are stock
movements. Parsing the table naively would have produced a "history" dominated by
description edits.

**Finding 3 — warehouse 33 IS UK Unit 5, and this is now proven.** 26 SKUs carry a
`Unit5(unit5) from … to …` line; **all 26 have a warehouse-33 row, and in all 26 the
quantity in the text equals the current warehouse-33 stock exactly**. Evidence/43 had
recorded the mapping as an inference and said so; it is now a database fact. The
`inventory.warehouse` master row for 33 is **still missing** and should still be created.

**Finding 4 — `public.listing_data` is the correct Shopify price source**, and it agrees
with the old one everywhere they overlap. Of 1,219 SKUs holding an exact price in both,
**all 1,219 match — maximum difference £0.00**. It is the same price with the ambiguity
removed, not a different price.

**Finding 5 — 41.4% of SKUs have no Shopify price because they are not on Shopify.** Of
2,341 unpriced SKUs, **2,245 (95.9%) have no Shopify listing in any market**. Refurbished
is 3.4% covered; the finished retail categories are 83–97%. The premise "all products have
a Shopify price" is true of the retail catalogue and false across the whole dashboard.

**Finding 6 — the `suppliers` schema is plural**, not `supplier`. `final_container_id`
exists on **both** `orders` and `order_items`; the per-line-item one is the correct join.

**Finding 7 — there is still no goods-receipt date.** `order_date` is when an order was
**placed**. "Last container" therefore means *most recently ordered*, not *most recently
landed*, and the UI says so rather than letting the column be misread.

## 4. GAP FOUND

**`From Location` is empty on every history row, and that is the source's state.** The
unit-to-unit transfer format exists in the log —
`[ <date> - Quantity 11 is increased in Unit2 from Unit1 by <user>. Old quantity of … ]` —
but occurs on **2 of 84,424 lines**, neither a dashboard SKU. Specification §8.3 lists
Unit-to-Unit Transfers **first**; the warehouse is not recording them in a form this log
captures. **This is the one item to raise with whoever owns the stock-update process.**

**Seven lines in 84,424 are unparsable, every one a typing error in the source** —
`unit2 value changed from 0 to Q`, ``to ` ``, `to FCBQ324RE`. Skipped rather than rendered
as a quantity.

**The postage sheet cannot mark its own headings.** A heading and a service-with-no-price
are the same shape: `SMART TRACK` and `Royal Mail Internal(prime label)` are both a lone
value in column A. No nesting is inferred, so the latter renders as a heading band. The
sheet marking its headings distinctly would resolve it.

**`Upcoming Stock` and `Price Details` tabs are empty** — 21 bytes and 0 bytes.

**Page weight is now 4.7 MB**, up from 1.55 MB. The history log is 3.0 MB of it. Dropping
the cap from 12 movements per region to 8 would recover roughly 1 MB.

## 5. VALIDATION RULE ADDED OR CHANGED

**Rule — a "does not exist" conclusion must state the SHAPE that was searched for**
```
Evidence/41 searched for a table shaped like an audit log: by name, by column
(stock_before / from_location / changed_by), by recency. product_history matches none of
those because it stores its record as PROSE.
THEREFORE: when concluding a source is absent, record WHAT WAS SEARCHED FOR, so the
conclusion can be re-opened when the shape assumption turns out to be wrong.
```

**Rule — free-text parsing must classify every line and count the residue**
```
FOR every line in the source:
  classify it into a known kind, OR count it as unrecognised
IF the unrecognised count is not reported THEN the parse is not trustworthy
Never let an unmatched line be silently dropped.
Result: 380,777 noise + 84,424 parsed + 7 unparsable = 100% accounted for.
```

**Rule — a field-tidying helper must not strip a character that carries meaning**
```
clean() stripped '-' from both ends and turned `from -1 to 30` into `1`.
5,967 movements had negative stock silently made positive.
Strip trailing punctuation only; never strip a leading sign.
Assert the negative count so the regression cannot return.
```

**Rule — any element the inline script looks up at load MUST be above the <script> tag**
```
An element authored below the script does not exist when the script runs.
getElementById returns null, .addEventListener throws, and the WHOLE script dies —
the page renders "Showing 0 of 0" with every dataset still present in the file.
The DOM stub MUST return null for an id absent from the markup above <script>.
```

**Rule — the `hidden` attribute must outrank every author display rule**
```
[hidden]{display:none} is a UA rule and loses to any class setting display.
.wrap{display:flex} therefore made `hidden` a no-op and rendered two views at once.
A global [hidden]{display:none !important} is required, and asserted.
```

**Rule — a publish is verified by an independent read, never by the writer's output**
```
publish.sh pipes through sed, which BLOCK-buffers: a successful publish showed nothing
for 15 minutes while the row had committed after one.
ALWAYS confirm id, byte/character count and updated_at with a separate SELECT.
Compare CHARACTERS, not bytes — length() on a text column counts characters, and a
289-byte difference was multi-byte UTF-8, not truncation.
```

**Rule — a live section embeds no fallback copy, and says why it failed**
```
IF a section reads a live source
THEN it holds NO embedded copy
     AND every failure state names the actual cause and what to do about it
Google refuses CORS for Origin: null, so a file:// page can NEVER fetch the sheet.
The message must say that rather than blaming the sheet's sharing or the network.
```

**Rule — never choose a "latest" record by sorting its NAME**
```
max(container_name) is a TEXT maximum: 'Container 9' > 'Container 16'.
Sort by the date field the business uses (o.order_date DESC).
IF that date is not the one the column name implies THEN say so in the UI.
```

## 6. FAILURE MODE OR EDGE CASE

- **An element authored after `</script>` killed the entire page.** The Stock History
  dialog was appended before `</body>`, below the script that binds its close handler.
  `Showing 0 of 0 SKUs`, no category row, every dataset intact in the file. **The harness
  passed 828 assertions against it**, because the stub's `getElementById` never returned
  null.
- **CSS specificity made `hidden` a no-op.** `.wrap{display:flex}` and
  `.pgwrap{display:flex}` outrank `[hidden]{display:none}`, so Inventory and Postage
  rendered simultaneously. **955 assertions passed** against it — the stub sets a JS
  property and has no styling. The same blind spot, twice, in one day.
- **`gviz/tq` silently loses data.** 281 rows against `/export`'s 352, with 30-column
  international pricing rows collapsed to a single cell. The same failure shape as the
  Drive read that returned 17 of 451 SKUs on 2026-08-20.
- **Google refuses CORS for `Origin: null`.** Measured: `/export` returns **no**
  `access-control-allow-origin` on its redirect hop for a null origin, and the browser
  checks CORS on every hop. A `file://` page can never fetch the sheet, and no client-side
  change works around it. My earlier CORS check used `https://example.com` — a real check
  of the wrong origin.
- **`width:100%` plus `overflow-wrap:anywhere` destroyed a 43-column table.** Each rule is
  correct alone; together they gave every heading one character per line.
- **A whitespace mismatch rolled back a whole edit batch.** The script writes only after
  every substitution succeeds, so one bad anchor silently reverted six good edits. Twice.
- **A block-range replacement deleted a live function.** Replacing everything between two
  anchors removed `pgFilter`, which sat inside the range.
- **A Python heredoc terminated early** on `"""` inside a CSV test string
  (`'a,"say ""hi""",c'`). Shell heredocs with a quoted delimiter avoid it.
- **The suite crossed the 2-minute command timeout** and looked like a hang. It is 176
  seconds of real work. The expected runtime is now recorded beside the expected count.

## 7. DECISIONS MADE TODAY

- **Re-opened a closed "does not exist" finding** rather than defending it, and recorded in
  evidence/45 exactly why evidence/41 missed the table.
- **Excluded 380,777 catalogue-edit lines** from the history rather than showing a movement
  log dominated by description edits.
- **Capped history at 12 movements per SKU per region, not per SKU.** Capping across
  regions would let a busy UK history crowd out the German one entirely, showing an empty
  German dialog for a SKU that has German movements.
- **Split UK and German histories on request, and added a footer naming what is not shown.**
  1,220 SKUs have Canada/USA/Netherlands/France movements that a strict split would hide.
- **Reverted a UI redesign on request** — the category row went back to twelve dropdowns,
  and the sizing problem was solved with CSS only.
- **Did not reproduce the sheet's per-carrier colour scheme.** One hue at two depths plus a
  left rule at each group's first column carries the same grouping and survives dark mode.
- **Kept `Unavailable` in the stock table but replaced it with a quiet dash in the history
  dialog**, where 40.5% of cells are legitimately blank and the chip buried the real values.
- **Made "absent = 0" for Unit 5** on the team's ruling that the warehouse is two weeks old,
  which is the opposite of the rule every other column follows — and documented why.
- **Did not apply the price fix by re-extraction.** A separate lookup merged at load kept
  all fourteen dataset locks byte-identical.

## 8. COMPANY KNOWLEDGE EXTRACT

1. **A "source does not exist" finding is only as strong as the SHAPE that was searched
   for.** `product_history` was invisible to a search for audit-log names and columns
   because it stores prose. Record the shape, so the conclusion can be re-opened.
2. **Most of an audit log may not be audit data.** 81% of `product_history` is catalogue
   edits. Classify and count every line before believing any total.
3. **A DOM stub models the script, not the browser.** Two whole classes of bug passed a
   green suite in one day: a null `getElementById`, and CSS specificity beating `hidden`.
   Assert the *markup* and the *CSS*, not only the behaviour.
4. **`gviz/tq` silently truncates Google Sheets. Use `/export?format=csv`.** Both send CORS
   headers; only one returns the true grid.
5. **Google refuses CORS for `Origin: null`.** Anything fetching a sheet must be served
   over http(s); a file on disk can never do it. Test with the origin the team actually uses.
6. **Never pick "the latest" by sorting a name.** `'Container 9' > 'Container 16'`.
7. **A tidying helper that strips characters can corrupt data silently.** Stripping `-`
   turned 5,967 negative stock values positive. Assert the count of the thing that broke.
8. **`order_date` is not a receipt date.** LEDSone has no goods-receipt date at all. If a
   column is named "Last Container", say which date decided it.
9. **Verify a publish with an independent read.** `sed` block-buffers, so a successful
   publish can look like a 15-minute hang. Compare characters, not bytes — `length()` on a
   text column counts characters.
10. **The separate-lookup pattern scales.** Six major data additions in one day —
    stock history, Shopify price, Unit 5, last container — and all fourteen embedded
    datasets stayed byte-identical.
11. **A blank is not always missing data.** In a movement log a blank field is normal;
    rendering 40.5% of cells as an "Unavailable" chip buried the values that were there.
12. **When a user rejects a redesign, fix the original instead of defending the new one.**

## 9. LLM STANDARD CHECK

| Check | Result |
|---|---|
| Terminology consistent with 2026-08-20/24/25 (population, grain, Unavailable, locked section) | TRUE |
| Business rules stated as executable IF/THEN | TRUE |
| Assumptions documented (order_date ≠ receipt date; Unit 5 absent = 0; no heading nesting) | TRUE |
| Edge cases documented (null origin, script order, CSS specificity, text max, sign stripping) | TRUE |
| Evidence referenced by path | TRUE — evidence/41–46, validation/, sql/ |
| Another developer can continue independently | TRUE — every extraction query in `sql/`, the parser rules in evidence/45, the lock file proves what was untouched |
| LLM queryable | TRUE |
| Hardcoded thresholds surfaced for BLOS governance | TRUE — see metadata block |

## RESULT

| Column | Before today | After today |
|---|---|---|
| Stock history | *Unavailable* on every row | **58,542 movements**, 5,480 SKUs, UK/German separate |
| Shopify exact price | 1,222 | **3,302** |
| Shopify ambiguous range | 2,100 | **18** |
| Last Container named | 549 of 1,038 | **1,038 of 1,038** |
| UK warehouse columns | 3 | **4** (Unit 5 added) |
| Top-level views | 1 | **2** (Postage Information, live) |
| Regression assertions | 783 | **1,121** |
| Page size | 1.55 MB | **4.7 MB** |

**Warehouse 33 = UK Unit 5 is now proven**, not inferred — 26 of 26 quantity matches.

Regression: **1,121 assertions, 0 failures, 176 seconds.** All fourteen embedded datasets
verified **byte-identical** after every change. Published to hub page **218**, verified from
an independent connection at 4,702,946 characters. Not committed, not pushed.

## BLOS GOVERNANCE NOTE

New values that should move out of code and into BLOS tables:

| Value | Where it lives now | Why it must be governed |
|---|---|---|
| The line-shape rules that classify `product_history` | the parser in `sql/`, applied offline | These decide what counts as a stock movement; a new log format silently becomes noise |
| "12 most recent per SKU per region" | the history extract | A display cap that determines what a picker can and cannot see |
| `sub_source = 104` = the primary UK Shopify store | the price extract | A store id decides which price the team quotes |
| `order_date DESC` = "the last container" | the container extract | A business rule about which shipment is current, and it is NOT an arrival date |
| Unit 5 = warehouse 33 | dashboard comment + evidence/43 | Proven, but `inventory.warehouse` still has no row for 33 — the database cannot confirm the name |
| "Absent = 0" for Unit 5 only | the Unit 5 merge | The opposite of the rule every other column follows, valid only while the warehouse is new |
| Postage sheet id + gid | dashboard constants | The live section breaks if the sheet is moved or its sharing is restricted |
