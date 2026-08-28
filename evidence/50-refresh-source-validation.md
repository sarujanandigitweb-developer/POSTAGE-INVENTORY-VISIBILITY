# Evidence 50 — Validating every data source before wiring an automatic refresh

**Date:** 2026-08-27 · Read-only. Nothing changed. Not committed, not pushed.

Asked: analyse and validate the existing dashboard's data logic **before** building a
2-hourly cron refresh against the LEDSone database.

## 0. The credentials, and where they must never go

Stored in `.env` at the project root, `chmod 600`, and a `.gitignore` was created in the
same change — the repository had none. `sql/refresh/db.js` is the only file that reads
them, and it scrubs the password out of any driver error before it can reach a log.

**They must never enter `dashboard/inventory-dashboard.html`.** That file is published to
the Varman AIOS hub and is readable by anyone with the link. This is the single hardest
constraint on the design below.

Verified: `tech_user` connects, and is **read-only** —

```
inventory.products:  SELECT true | INSERT false | UPDATE false | DELETE false
PostgreSQL 18.4, database ledsone
```

All twelve tables the dashboard depends on return `SELECT ok`.

## 1. The architecture, and why "fetch live in the browser" is not available

The dashboard is a **single HTML file with its data embedded**, by three standing rules:
no external JS or CSS, the Inventory view makes **zero** network calls, and the fourteen
extracted datasets are hash-locked. Only the Postage Information tab is live, and it
reads a public Google Sheet over CORS.

A browser cannot open a Postgres connection, and putting these credentials in a page on a
public URL would publish them. **So "refresh" means: a scheduled job on this machine
re-runs every extraction and rewrites the embedded data.**

That is *not* the static snapshot the brief warns against. The datasets are regenerated
end to end from the database each run — no hand-maintained copy, no manual step. What the
reader sees is at most two hours old, and the page carries the timestamp of the run.

## 2. Where each column actually comes from

| Column group | Table(s) | Filter / rule |
|---|---|---|
| SKU population, 6 sections | `configurator.components_sot_skus` **+ the components Google Sheet** | see §3 — this is the weak point |
| SKU population, 6 sections | `inventory.products` | declared SKU prefix, `sku NOT LIKE '%+%' AND sku !~ '[0-9A-Z]PK$'` |
| Description, image | `inventory.products.description`, `inventory.product_images.image_url` | first image per product |
| Stock, 8 columns | `inventory.physical_product_stock` | warehouse id → column, see §4 |
| Shelf location | same table, `product_shelf_location` | `NULL` or `'-'` → a dash |
| Shopify price + Comments | `listings.shopify_listings` | `wrong_sku = 0`, `all_list = 1`, `price > 0`, channel priority, see §5 |
| History | `inventory.product_history` | four line types, see §6 |
| Received warehouse / date | `inventory.product_history` | the latest **receipt** line, see §7 |
| Container | `suppliers.order_items → orders → final_containers` | `status_arrived`, date proximity, see §8 |
| Incoming | same, `NOT status_arrived` | see §9 |
| End of line | `inventory.end_of_line_products` | used in reporting, not a column |

## 3. SKU → category. THE ONE THING A REFRESH CANNOT DO ALONE

Twelve sections, populated two different ways:

**Prefix-defined (6 sections, 3,443 SKUs)** — Lamp Spares, Lighting, Cosmetics, Clothes,
Home Appliances, Refurbished, plus the Lamp Holder 191 and the Lampshade/Bulbs extras.
A declared prefix list against `inventory.products`, longest-prefix-wins. **This
regenerates cleanly.**

**Sheet-defined (6 sections, 2,409 SKUs)** — Ceiling Rose 332, Lampshade 451, Pendant
Lamp Holder 398, Wall Arm 180, Bulbs 218, Lamp Holder 226. These came from the components
**Google Sheet**. `configurator.components_sot_skus` holds **1,001 rows across 3 tabs**.

> **CORRECTION (evidence/51).** I wrote here that the table "has never carried a
> ceilingrose tab". That is wrong. Its three tabs are **lampshade (451), ceilingrose
> (332), bulb (218)** — exactly the three populations. Only Pendant, Wall Arm and Lamp
> Holder are absent. The conclusion below, that a refresh cannot rebuild all six from the
> database, is also wrong: see evidence/51, which supersedes this section.

> **Therefore a database-only refresh cannot rebuild those six populations.** It can
> refresh every *attribute* of those SKUs — stock, price, history, containers — but the
> membership list must keep coming from the sheet, or those sections silently shrink.

The refresh must treat the six sheet populations as an input it re-reads, never as
something it re-derives. That is the single most dangerous thing to get wrong here.

Classification rules in the page and unchanged by any of this: `CLASSIFY` (10 two-char
rules), `SUB4` (145 derived 4-char rules, 15 ambiguous), `PREFIX_RULES` (33 declared
prefixes), `PREFIX_DEFINED`, and the in-memory re-typings (Wall Arm 11→4, Bulbs series →
attribute, Handles → Lamp Spares, the Others bucket).

## 4. Warehouse mapping — verified against live row counts

| id | column | dashboard header | live rows | live units |
|---:|---|---|---:|---:|
| 1 | `a` | UK Unit 3 | 7,920 | 935,754 |
| 8 | `b` | UK Unit 4 | 7,908 | 1,512,978 |
| 6 | `c` | UK Unit 18 | 7,915 | 378,958 |
| 33 | `u5` | UK Unit 5 | 2,650 | 534,520 |
| 10 | `k` | German Kronen | 7,908 | 89,295 |
| 7 | `m` | German Schmutter | 7,908 | 167,880 |
| 4 | `ca` | Canada | 6,511 | 57,337 |
| 32 | `us` | US | 6,486 | 50,564 |

Warehouses **2, 3, 5** exist and are **not** on the dashboard (3,298 / 4,912 / 675 units).
They were never mapped. Worth a decision separately from this work.

`inventory.warehouse` **still has no row for 33** — the Unit 5 name remains a team
statement, proven only by the history text (evidence/45).

## 5. Shopify price and Comments — the rule as implemented

`listings.shopify_listings`, `wrong_sku = 0 AND all_list = 1 AND price > 0`, SKU resolved
as `upper(COALESCE(NULLIF(mapped_sku,''), sku))`. Then, in strict order:

1. exact SKU · 2. combo with exactly one `+` · 3. pack (`<SKU>NPK`, one digit or `A`=10) ·
4. larger combo · 5. nothing.

**Channel priority at every tier**, LEDSone first:

| channel | live SKUs | site |
|---|---:|---|
| LEDSone | 14,571 | UK |
| LEDSone DE | 10,287 | Germany |
| Vintagelite | 7,998 | UK |
| LED Sone FR | 4,680 | France |
| Electricalsone | 3,348 | UK |
| Relicelectrical | 2,279 | Canada |
| BesBet | 1,098 | UK |
| LEDSone US | 1,089 | US |
| Dcvoltage / dcvoltage | 768 / 273 | UK — same store, two casings |

Only the five UK channels reach the price column; a euro or Canadian figure is never
rendered as `£`.

## 6. History — four types, and the mapping that matters

`inventory.product_history`, 468,923 lines, of which the four types the team uses are:

| type | live lines |
|---|---:|
| UK stock changes | 11,110 |
| Supply | 12,739 |
| German Supply | 3,137 |
| German Inventory | 3,236 |

(The four do not simply sum: a `German Supply` line also contains the words
`German Inventory changed from`, so a naive total double-counts 1,667 lines.)

**The warehouse is named by the FIELD, not the label:** `Quantity`→Unit 3,
`unit1`→Unit 18, `unit3`→Unit 4, `unit2`→Mark, `unit5`→Unit 5. Verified on all 13,454
labelled segments. A Supply line carries the field with no label at all, which is why
this mapping is load-bearing.

## 7. Received warehouse / date

The latest **receipt** line for the SKU — `Supply` or `German Supply` only. A
`UK stock changes … via inventory CSV` line is a recount, not a receipt, and is excluded.
Warehouse = the field that increased; date = the date on that line.

Read from the **full** history, not the embedded 12-per-region record, or a SKU with a
busy recent recount history loses its receipt.

## 8. Container — date proximity, and it is not a key

Latest arrived container for the SKU, matching country, ordered on or before the receipt
date. Live: **2,695 arrived rows, 1,281 SKUs, 22 container names**.

**Re-confirmed today with the refresh credentials: `SELECT count(*) FROM suppliers.orders
WHERE order_id ILIKE '%SU%'` returns 0.** The `SU####` supply code has no counterpart in
`suppliers`, so this is proximity, not a join. The UI says so on hover.

## 9. Drift measured today — the case for refreshing at all

| | embedded | live | |
|---|---:|---:|---|
| dashboard rows | 5,852 | 5,852 | stable |
| Lamp Holder `LH%` singles | 417 | 417 | stable |
| **Unit 5 non-zero rows** | **286** | **315** | **+29 since extraction** |
| **Incoming SKUs** | **488** | **874** | **+386, and 14 → 20 containers** |
| SKUs with history | 4,306 | — | recomputed each run |
| SKUs with a receipt | 3,253 | — | recomputed each run |

Unit 5 and Incoming have both moved materially in seven days. This is exactly what a
2-hourly refresh is for.

## 10. What I propose to build

```
sql/refresh/
  db.js               connection, credentials, redaction     [written, read-only]
  validate-sources.js this validation                        [written, read-only]
  extract/*.js        one module per dataset, each a pure query -> JSON
  build.js            applies the SAME logic modules the dashboard uses
  apply.js            rewrites ONLY the data blocks in the HTML
  refresh.sh          lock, run, validate, publish, verify, log
```

Non-negotiables for the implementation:

1. **Credentials never touch `dashboard/`.** Asserted in the run, not just intended.
2. **The six sheet populations are re-read, never re-derived.**
3. **The run validates before it publishes.** `smoke-render.js` must pass — all 5,852
   rows rendering — or the refresh keeps the previous file and exits non-zero.
4. **A refresh that would change the row count by more than a set threshold stops and
   reports** rather than quietly publishing a half-empty dashboard.
5. **One run at a time**, via a lock file; a 2-hourly cron must never overlap a long run.
6. **The page states when it was refreshed**, so a stalled cron is visible on screen
   rather than silently serving old numbers.

## 11. Open questions before I build

1. **The six sheet-defined populations.** Re-read the Google Sheet each run, or freeze
   them and refresh only their attributes? The sheet is already known to be stale in both
   directions for Lamp Holder (evidence/48).
2. **Warehouses 2, 3 and 5** are unmapped, 8,885 units. In or out?
3. **Publish on every run, or only when something changed?** Publishing unchanged bytes
   costs nothing but makes `updated_at` meaningless as a change signal.
