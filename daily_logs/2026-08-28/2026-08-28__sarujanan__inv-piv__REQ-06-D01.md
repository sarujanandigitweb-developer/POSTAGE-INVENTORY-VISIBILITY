---
date: 2026-08-28
developer: sarujanan
project: Postage Inventory Visibility
project_code: INV-PIV
phase: Phase-06 — History rebuilt to spec, Received columns filled, automatic refresh designed
requirement_id: REQ-06
deliverable_id: D01
status: Completed for the shipped work; the 2-hourly refresh is analysed and proven, not yet built
evidence_location: /home/led-247/POSTAGE-INVENTORY-VISIBILITY/evidence/50–51, sql/refresh/, validation/, hub/, dashboard/inventory-dashboard.html
blos_keys_used:
  - history_four_types_only
  - history_field_to_warehouse_map          (NEW — Quantity=Unit 3, unit1=Unit 18, unit3=Unit 4)
  - received_from_supply_lines_only         (NEW)
  - container_date_proximity_not_a_key
  - shopify_channel_priority_ledsone_first  (NEW)
  - population_source_postgres_inventory_bool (NEW — decided, not yet applied)
  - stock_band_low_1_to_10
hardcoded_thresholds:
  - low stock band = 1–10 units (cell colour AND header alert)
  - out of stock = total <= 0 across all eight warehouses
  - history carried per SKU per region = 12 most recent
  - Shopify channel order = LEDSone, Electricalsone, Vintagelite, BesBet, Dcvoltage, then non-UK
  - only UK channels may supply the £ price column
  - refresh interval = 2 hours; tag amber at 3 hours, red at 8
  - passport image frame = 264×340px (35×45mm)
three_am_standard: TRUE
llm_queryable: TRUE
company_knowledge_candidate: TRUE
domain: Inventory — Postage & Warehouse — LEDSone Postgres
User: Postage & Warehouse Team
Benefit status: Pass — two long-empty columns filled, history corrected, and stale data quantified

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

Published to hub **218**, verified by independent read at 3,945,912 characters.
Not committed, not pushed.

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
