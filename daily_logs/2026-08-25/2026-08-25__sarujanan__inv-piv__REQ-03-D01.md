date: 2026-08-25
developer: sarujanan
project: Postage Inventory Visibility
project_code: INV-PIV
phase: Phase-03 — Self-Maintaining Classification & Catalogue Expansion
requirement_id: REQ-03
deliverable_id: D01
status: Completed — Shopify price fix validated but not applied; Wall Arm / Wall Scones ownership outstanding
evidence_location: /home/led-247/POSTAGE-INVENTORY-VISIBILITY/evidence/33–40, validation/, sql/, dashboard/inventory-dashboard.html
blos_keys_used:
  - population_source_sheet_sot_tab
  - population_source_sku_prefix_declared   (NEW — prefix-defined sections)
  - warehouse_unit_map
  - shelf_location_null_sentinels
  - container_arrived_only
  - container_incoming_not_arrived          (NEW)
  - shopify_price_site_uk
  - category_source_declared_by_sheet_only
hardcoded_thresholds:
  - pack detection regex = '[0-9A-Z]PK$'
  - bundle detection = SKU contains '+'
  - container placeholder names = UNASSIGN, UNASSIGNED, N/A, '-'
  - pagination page sizes = 15, 25, 100, 500, all   (default all)
  - warehouse ids = 1, 8, 6, 10, 7, 4, 32
  - category row one-line breakpoint = 1454px  (flex:1 1 112px x 12 + gaps)
  - proposed price primary store sub_source = 104   (NOT applied)
three_am_standard: TRUE
llm_queryable: TRUE
company_knowledge_candidate: TRUE
domain: Inventory — Postage & Warehouse — LEDSone MCP
User: Postage & Warehouse Team
Benefit status: Pass — 12 sections live, 5,661 SKUs, classification now maintains itself

---

## 1. SYSTEM STATE

At the start of the day the dashboard held **six categories, 1,805 SKUs**, all sourced from
Google Sheet SOT tabs and locked by SHA-256. Regression stood at **248 assertions**.

Known limitations carried in:

- Classification was a **hand-written map of six 2-character prefixes**. A SKU that first
  appeared tomorrow could only ever resolve to a main category, never to a type, and any new
  category meant editing the classifier by hand.
- Only **three** of the workbook's tabs were synced into `configurator.components_sot_skus`,
  so every further category had no in-database source of truth at all.
- The dashboard showed only **arrived** containers. Stock already paid for, produced or on a
  ship was invisible.
- 40.2% of rows had no Shopify price, 100% had no Received Warehouse, Received Date or History,
  and nobody had established whether those were extraction gaps or genuine absences.

## 2. WHAT CHANGED TODAY

**Classification became self-maintaining.** The 4-character type index is no longer written by
hand — it is **derived at load from each category's own validated rows**. A prefix becomes a
rule only where the validated data agrees on one type; where it disagrees, no rule is created
and the prefix is recorded as ambiguous. The index rebuilds itself when the extraction returns
new rows, so a SKU that first appears tomorrow classifies with **no code change**.

**A declared-prefix table was added and built from the registry itself.** Sections that have no
SOT tab declare their SKU prefix on each type. `PREFIX_RULES` is assembled from those
declarations at load and sorted longest-first, so **the prefix that decides which products are
fetched and the prefix that classifies them are the same string** and cannot drift apart.

**Six new sections were added, all prefix-defined:**

| Section | Types | SKUs | Basis |
|---|---:|---:|---|
| Lamp Spares | 29 | 1,420 | declared prefixes |
| Lighting | 5 | 562 | declared prefixes |
| Cosmetics | 4 | 124 | declared prefixes |
| Clothes | 9 | 177 | declared prefixes |
| Home Appliances | 19 | 705 | declared prefixes |
| Refurbished | 1 | 352 | declared prefixes |

**Two existing sections were extended without breaking their locks.** Lampshade gained 400
prefix-added SKUs across 3 new types, and LED Bulbs was **replaced by BULBS** — 5 types, 334
SKUs. In both cases the validated SOT array was left byte-identical on disk and the additions
were carried in a **separate array merged at load**.

**Incoming stock was added as its own dimension.** 488 SKUs have stock on the way; 414 of them
are in the dashboard. Stage is read from the order's own status flags — Shipped, Production
done, Confirmed, Ordered — and is **never mixed with the arrived-container columns**.

**Pagination was added** (15 / 25 / 100 / 500 / All, default All), display-only: it never
changes which rows match, so the counts, the breakdown and the CSV stay whole-result-set figures.

**The schema was reviewed against the three structure exports supplied by the team**, and every
blank column was traced to either a fixable extraction gap or a genuine absence (§3, §4).

**The regression harness grew from 248 to 783 assertions.**

## 3. POSTGRESQL / MCP FINDING

**Finding 1 — `Unassign` is a placeholder, not a container.** `suppliers.final_containers`
holds a row literally named `Unassign`, and **5 dashboard rows were displaying it as a real
shipment**. Now excluded at source and guarded at render.

**Finding 2 — Canada has 135 shelf locations the dashboard never fetched.** Per-warehouse
coverage over 1,001 SKUs: Unit 3 834, Unit 4 633, Schmutter 420, Kronen 143, **Canada 135**,
Unit 18 **0**, US **0**. Canada is genuinely missing data; Unit 18 and US are correctly omitted.

**Finding 3 — `product_bulk_location` is empty.** 0 populated rows across all seven warehouses
for all 1,001 SKUs. It is listed in the structure export but cannot fill any blank location.

**Finding 4 — `reserved_quantity` is populated and never shown.** Unit 3 118 rows, Unit 4 55,
Schmutter 54, Kronen 6, Canada 6, US 10. A picker seeing stock 30 cannot tell that 8 are
reserved.

**Finding 5 — there is no goods-receipt date anywhere in the database.** Every column matching
`receiv|arriv|grn|intake|delivered|landed|goods_in` was searched across all schemas. The only
hit is `suppliers.orders.status_arrived`, which is a **boolean**. `suppliers.invoices.invoice_date`
is the supplier's invoice date (populated for 2 of the 10 most recent containers) and
`final_containers.updated_at` is a row-touch timestamp. **Received Date is unavailable, not
un-extracted.**

**Finding 6 — the missing Shopify prices are bundle-only listings.** `listings.shopify_listings`
is the only price table. `mapped_sku` is 100% empty, parent rows carry `sku = NULL`, and of
28,608 distinct SKUs only 7,382 are real single products — the rest are bundle strings such as
`LSCO335DG+RPR44WH`. A fix was validated (exclude `price = 0`; prefer `sub_source = 104`, the
proven primary store at 49,789 transactions — 9× the next; fall back to any UK store), which
would take exact prices **204 → 597** and ranges **421 → 27**. **Not applied** — see §7.

**Finding 7 — the `LD` prefix is a strict SUPERSET of the synced bulb SOT.** 220 vs 218. The
two extra rows are real single bulbs the sync missed (`LDCWA60HE277`, `LDMT1852E274`). This is
the opposite of the usual prefix risk and is the only reason replacing a SOT-backed section
with a prefix was safe here.

**Finding 8 — MCP persists large results to disk.** Any result over roughly 100 KB is written
to a file and the path is returned. Parsing that file removes hand-transcription from the
extraction loop entirely. A result that lands just under the threshold can be forced over it
with a padding column.

## 4. GAP FOUND

**`Received Warehouse`, `Received Date` and `History` cannot be filled.** Not an oversight —
the database records only the container's region (`main_container` = UK | DE | US), which the
column grouping already conveys, and has no stock-movement table and no timestamp on
`physical_product_stock`. These stay *Unavailable* permanently unless the source system changes.

**`CTFP` (Pajamas Fem) is a declared type with 0 rows today.** The type was kept so the section
is ready when stock appears, rather than silently dropped.

**All 32 Incandescent Bulbs SKUs are end-of-line.** That is the true state of the range, so
they are shown as they are rather than filtered out.

**None of the 116 SKUs added to BULBS has an arrived-container record**, so Last Container is
*Unavailable* for all of them.

**Wall Arm and Lighting/Wall Scones may be one category under two names.** 180 of the 277 `WS`
SKUs are the entire Wall Arm section; the remaining 93 became Lighting → Wall Scones. They were
**not merged unilaterally** — the question was raised and left with the owner. This also blocks
giving Lighting a declared prefix, because Lighting's `WS` would collide with Wall Arm's `WS`.

**A duplicate type-name collision was found and merged.** `Glass` + `Glass Shade` → **Glass
Shades**; `Crystal Glass` + `Crystal Shades` → **Crystal Shades**. The merge is applied in
memory so the locked array stays byte-identical.

## 5. VALIDATION RULE ADDED OR CHANGED

**Rule — the 4-character type index is DERIVED, never typed**
```
FOR each category that is not prefix-defined:
  FOR each 4-char SKU prefix in its validated rows:
    IF every row with that prefix carries the SAME family code
    THEN create a rule  prefix -> that type
    ELSE record the prefix as AMBIGUOUS and create NO rule
Never hand-write a rule the data does not support.
```

**Rule — a prefix-defined section is excluded from the derived index**
```
IF a section's types are defined by a declared SKU prefix (no SOT tab)
THEN it contributes NO rules to the 4-character index
     AND every one of its rows is flagged x:1
Rationale: its family codes are labels, not 4-char SKU prefixes. Including Lamp
Spares alone inflated the index from 181 rules to 467; Lampshade's extras from
181 to 273 — in both cases indexing labels as if they were prefixes.
```

**Rule — classification order**
```
1  derived 4-char rule            (validated data wins)
2  ambiguous 4-char prefix        -> main category certain, type = "Other"
3  declared prefix, LONGEST FIRST (CTKMP before CTMP; AFW before AP)
4  two-character rule
5  otherwise unclassified — never guessed
```

**Rule — a declared prefix must be collision-checked before use**
```
BEFORE adding a prefix-defined section:
  compare its full candidate SKU list against EVERY SKU already embedded
  IF any SKU appears in both THEN stop and resolve ownership
Two-character prefixes are the dangerous case: 14 of the 33 added today were
2 characters. Measured result: zero collisions.
```

**Rule — a bundle is detected by SKU SHAPE, never by description**
```
bundle  IF sku LIKE '%+%'  OR  sku ~ '[0-9A-Z]PK$'
The description is NOT a bundle test. 'Combo Default Title.' appears on real
single products (LDST64E278 = ST64 E27 8W) whose description was clobbered by a
Shopify bundle title.
```

**Rule — extending a locked section**
```
IF a locked section gains rows or changes type names
THEN the locked array on disk MUST stay byte-identical
     AND additions go in a SEPARATE array merged at load
     AND renames/re-typing are applied IN MEMORY at load
     AND the lock is re-verified after the change
```

**Rule — replacing a SOT population with a prefix**
```
BEFORE replacing a SOT-backed population with a SKU prefix:
  compute both directions of the difference
  IF the prefix set is a strict SUPERSET of the SOT set THEN it is safe
  ELSE list every SKU that would be LOST and get a decision
```

**Rule — incoming stock is never mixed with arrived stock**
```
Arrived   = orders.status_arrived        -> the existing Last Container columns
Incoming  = NOT orders.status_arrived    -> its own Incoming Container / Stage columns
Stage comes from the order's own flags; where a SKU has several open orders the
most recent order_date wins. Placeholder container names are excluded from both.
```

**Rule — pagination is display-only**
```
Paging changes WHICH ROWS ARE DRAWN and nothing else.
"Showing N of M", the type breakdown and the CSV export always describe the whole
filtered result set, never the current page.
```

## 6. FAILURE MODE OR EDGE CASE

- **A description-based bundle filter dropped two real products.** Excluding
  `description ILIKE '%combo%'` removed `LDST64E278` and `LDDMST64E276` — genuine single bulbs
  whose description column holds a bundle title. Caught only because the SOT/prefix difference
  was computed **in both directions**; a one-way check would have shown "218 = 218" and passed.
- **Injecting a dataset after its first reference.** `SPR_DATA` was inserted below the `CATS`
  registry that referenced it → *used before initialization*. Data blocks must be lifted above
  the registry.
- **The derived index silently absorbed the wrong rows twice** (181 → 467 with Lamp Spares,
  181 → 273 with the Lampshade extras) before the `x:1` row flag was introduced. The symptom
  was two unrelated synthetic tests failing — the count itself looked plausible.
- **A blanket `sed` over-matched.** Changing `split(',').length === 25` to `27` for Lampshade
  also rewrote the Ceiling Rose assertion. Column-count edits must be anchored per section.
- **An edit anchor matched twice.** `attr: { key: 'mt', label: 'Mount Type' }` exists on both
  Pendant Lamp Holder and Lamp Holder. Every automated edit now asserts `count == 1` before
  substituting.
- **`buildCSV` reads the ACTIVE category.** A Ceiling Rose CSV assertion ran while Lampshade
  was active and produced the wrong column count. CSV assertions must follow a `choose()`.
- **`DISTINCT` is not implemented for window functions** in this PostgreSQL — rewritten as a
  `GROUP BY` CTE. **`wrong_sku` is `smallint`, not boolean** — `IS TRUE` fails; use `= 1`.
- **A `<select>` is as wide as its widest option.** Wall Arm's "Double Wall/Ceiling Spotlight
  Arm" alone widened its column to the 190px cap and pushed the twelfth category onto a second
  row. Fixed with `flex:1 1 112px; min-width:0`.
- **Redesigning a working control to solve a sizing problem was rejected.** The category row
  was rebuilt as pills plus one shared dropdown; the team's response was that the previous UI
  was correct and only needed to be smaller. **Reverted, then re-solved with CSS only.**
  Changing a control the team already knows is a cost, not a neutral act.

## 7. DECISIONS MADE TODAY

- **Derived the type index from the data instead of hand-writing it**, and created **no rule at
  all** for the 20 prefixes where the validated data disagrees — rather than picking the
  majority type.
- **Declared prefixes on the registry rather than in a second table**, so the extraction and the
  classifier read the same string.
- **Kept the ten LED Bulbs banner series** when that section was replaced, moving them to a
  *Series* attribute instead of discarding them. The section was renamed but nothing the sheet
  declared was lost.
- **Kept the sheet's `Bags` grouping** for four Home Appliances types as a *Group* attribute
  rather than flattening it away.
- **Did not apply the validated Shopify price fix.** It changes the price shown on every
  section, and applying it in the same day as six new sections would have made a price
  regression indistinguishable from a section bug. It is documented and ready.
- **Did not merge Wall Arm into Lighting/Wall Scones.** They may be one category under two
  names; that is the owner's call, and 180 SOT-backed SKUs are at stake.
- **Kept `Handles`/`HL` under Home Appliances** where the team put it, after confirming
  `SPR_DATA` holds no `HL` SKU — so there is no double-count.
- **Left Lamp Spares and Lighting without declared prefixes.** A new `CG…` or `TP…` SKU is
  still unclassified, exactly as before. Adding them is a one-line edit but Lighting's `WS`
  collides with Wall Arm's `WS`, so it waits on the ownership decision.
- **Reverted the category-row redesign on request** and solved the space problem with CSS only.

## 8. COMPANY KNOWLEDGE EXTRACT

1. **Derive classification rules from validated data; do not write them.** A derived index
   maintains itself as the extraction grows, and it can *refuse* to produce a rule. 145 rules
   were derived and 15 prefixes were left deliberately unresolved.
2. **Where the data disagrees, produce no rule.** An ambiguous prefix still yields a certain
   main category and an honest `"Other"` type. Guessing the majority would be wrong on the
   minority silently.
3. **Let the same string drive extraction and classification.** Two lists of prefixes will
   drift; one list read by both cannot.
4. **Longest prefix wins, always.** `CTKMP` before `CTMP`, `AFW` before `AP`. Without it,
   children's pyjamas quietly become adult pyjamas.
5. **Collision-check every SKU before adding a prefix-defined section**, and treat
   two-character prefixes as guilty until measured. 14 of 33 added today were 2 characters;
   all 1,358 SKUs were checked against the 4,303 already embedded.
6. **Compute the difference in BOTH directions when swapping a population.** "218 = 218" hid
   two lost products and two missing ones.
7. **Never test for a bundle using the description.** `Combo Default Title.` sits on real
   single products. SKU shape is the only reliable signal.
8. **A locked dataset can be extended without being touched** — put additions in a separate
   array and apply renames in memory at load. Ten locks survived a day that added 3,856 SKUs
   and renamed a whole section.
9. **`Unassign` is a placeholder in `final_containers`**, not a shipment. Any container join
   must exclude `UNASSIGN`, `UNASSIGNED`, `N/A` and `-`.
10. **There is no goods-receipt date in LEDSone.** Stop looking; `status_arrived` is a boolean.
    Record it as unavailable rather than substituting the invoice date or `updated_at`.
11. **`listings.shopify_listings` is the only price source, and most of its rows are bundles.**
    Of 28,608 distinct SKUs only 7,382 are single products; `mapped_sku` is entirely empty.
12. **MCP writes large results to disk.** Parse the file instead of transcribing; pad a
    borderline result to force persistence. This removed the single slowest step in extraction.
13. **A `<select>` sizes to its widest option.** One long option name can break a whole layout;
    `min-width:0` plus a flex basis is the fix.
14. **Do not redesign a control the team already knows in order to solve a sizing problem.**
    Fix the size. A familiar UI has value that a better-looking one has to *beat*, not match.

## 9. LLM STANDARD CHECK

| Check | Result |
|---|---|
| Terminology consistent with 2026-08-20 / 2026-08-24 (population, grain, Unavailable, locked section) | TRUE |
| Business rules stated as executable IF/THEN | TRUE |
| Assumptions documented (prefix-defined = declared, not derived; EOL retained; nothing merged unilaterally) | TRUE |
| Edge cases documented (combo description, index pollution, select sizing, UI revert) | TRUE |
| Evidence referenced by path | TRUE — evidence/33–40, validation/, sql/ |
| Another developer can continue independently | TRUE — every extraction query is saved in `sql/`, the harness reproduces every count, the lock file proves what was untouched |
| LLM queryable | TRUE |
| Hardcoded thresholds surfaced for BLOS governance | TRUE — see metadata block |

## RESULT

| Section | Types | SKUs | Basis |
|---|---:|---:|---|
| Ceiling Rose | 3 | 332 | SOT tab (locked) |
| Pendant Lamp Holder | 0 | 398 | SOT tab — Mount Type as attribute |
| Lampshade | 8 | 851 | SOT tab 451 + 400 prefix-added |
| Wall Arm | 11 | 180 | SOT tab |
| Lamp Holder | 0 | 226 | SOT tab — Mount Type as attribute |
| Bulbs | 5 | 334 | SOT tab 218 + 116 prefix-added |
| Lamp Spares | 29 | 1,420 | declared prefixes |
| Lighting | 5 | 562 | declared prefixes |
| Cosmetics | 4 | 124 | declared prefixes |
| Clothes | 9 | 177 | declared prefixes |
| Home Appliances | 19 | 705 | declared prefixes |
| Refurbished | 1 | 352 | declared prefixes |
| **Total** | **94** | **5,661** | **12 sections, 0 GAP chips** |

Classifier: **145 derived 4-char rules** (15 prefixes deliberately left ambiguous),
**33 declared prefixes**, **10 two-character rules**, 0 SKU arrays, 0 SKU→category dictionaries.

Regression: **783 assertions, 0 failures** (248 at start of day). All **14** embedded datasets
hashed in `validation/locked-sections-lock.txt`; the **10** that existed before today verified
**byte-identical** after every change. Not committed, not pushed.

## BLOS GOVERNANCE NOTE

New values that should move out of code and into BLOS tables:

| Value | Where it lives now | Why it must be governed |
|---|---|---|
| The 33 declared SKU prefixes and their type names | the dashboard registry (`fams`) | This IS the catalogue taxonomy for six sections; it belongs to the business, not to a file |
| `UNASSIGN` / `UNASSIGNED` / `N/A` / `-` as "not a container" | extraction SQL and render guard | A new placeholder name silently becomes a real shipment again |
| Order-status → stage names (Shipped / Production done / Confirmed / Ordered) | extraction SQL | The labels the warehouse reads are defined in a CASE expression |
| `sub_source = 104` as "the primary UK store" | proposed price query, not yet applied | A store id embedded in a query decides which price the team quotes |
| `x:1` = "this row is prefix-added, keep it out of the derived index" | data rows and the index builder | An undocumented flag that changes classification behaviour |
| "Prefix-defined sections declare; SOT sections derive" | project convention | The rule that keeps the two population mechanisms from contaminating each other |
