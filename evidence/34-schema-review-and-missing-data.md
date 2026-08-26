# Evidence 34 — Schema review: what is actually missing, and why

**Date:** 2026-08-25 · Read-only analysis against LEDSone MCP, driven by the three
database-structure exports supplied by the team. Not committed, not pushed.

## 1. Where the blanks actually are

Measured across all 1,805 embedded rows:

| Column | Filled | Blank |
|---|---:|---:|
| SKU, Description, Image | 1805 | **0%** |
| Stock — all 7 warehouses | 1805 | **0%** |
| Unit 3 location | 1594 | 11.7% |
| Schmutter location | 986 | 45.4% |
| Unit 4 location | 906 | 49.8% |
| Kronen location | 146 | 91.9% |
| Shopify price | 1079 | 40.2% |
| UK container | 277 | 84.7% |
| DE container | 117 | 93.5% |
| Received Warehouse / Received Date / History | 0 | **100% — never extracted** |

## 2. Each gap, checked against the schema

### 2.1 `Unassign` is not a container — **BUG, fixed**

`suppliers.final_containers` contains a placeholder row named **`Unassign`**.
**5 dashboard rows were displaying it as if it were a real shipment.**

Fixed at render: `Unassign` (and `Unassigned`, `N/A`, `-`) now show *Unavailable*
with the reason. The corrected query also excludes it at source.

### 2.2 Canada has shelf locations the dashboard never fetched — **recoverable**

Per-warehouse location coverage over 1,001 SOT SKUs:

| Warehouse | id | Shelf locations | Bulk locations |
|---|---:|---:|---:|
| UK Unit 3 | 1 | 834 | 0 |
| UK Unit 4 | 8 | 633 | 0 |
| Trossingen Schmutter | 7 | 420 | 0 |
| **Canada 1** | **4** | **135** | 0 |
| Trossingen Kronen | 10 | 143 | 0 |
| UK Unit 18 | 6 | **0** | 0 |
| US 1 | 32 | **0** | 0 |

**Canada has 135 shelf locations and the dashboard has no Canada location column.**
That is genuinely missing data. Unit 18 and US have none at all, so the dashboard
is correct to omit those.

### 2.3 `product_bulk_location` is empty — **not a route**

The structure export lists `product_bulk_location` on
`inventory.physical_product_stock`. Measured: **0 populated rows** across all seven
warehouses for all 1,001 SKUs. It cannot fill any blank location.

### 2.4 `reserved_quantity` is populated but never shown — **recoverable**

Unit 3: 118 rows · Unit 4: 55 · Schmutter: 54 · Kronen: 6 · Canada: 6 · US: 10.
A picker seeing stock 30 cannot currently tell that 8 are reserved.

### 2.5 Containers still on the way are invisible — **recoverable**

Of 1,001 SKUs: **416 have a container**, but the dashboard only shows the 362 that
have **arrived**.

| State | SKUs |
|---|---:|
| Arrived (currently shown) | 362 |
| **Shipped, not yet arrived** | **81** |
| **On order, not yet shipped** | **254** |

335 SKUs have incoming stock the warehouse team cannot see.

### 2.6 `products.title` is 100% populated — **recoverable**

`title` is the product's real name; `description` is the long marketplace blurb the
dashboard currently shows. Coverage: `title` 1001/1001, `description` 1001/1001,
`eng_description` only 411/1001.

## 3. What genuinely cannot be fixed

### 3.1 Received Date — no such data exists anywhere

Searched **every column and table in every schema** matching
`receiv|arriv|grn|intake|delivered|landed|goods_in`. The only inventory-related hit
is **`suppliers.orders.status_arrived`, which is a `boolean`** — not a date.

`suppliers.orders` has `order_date`, `confirmed_date`, `finished_date` and
`expected_completion_date` — **none of them is an arrival date**. There is no
`arrived_date`, no goods-receipt table and no GRN table.

Near-misses that were **rejected**:

| Candidate | Why rejected |
|---|---|
| `suppliers.invoices.invoice_date` | supplier's invoice date; populated for only **2 of the 10** most recent containers |
| `suppliers.invoices.ship_by_date` | a shipping deadline, not an arrival |
| `final_containers.updated_at` | a row-touch timestamp — one container shows 2026-08-24 simply because a field was edited |
| `suppliers.order_item_logs` | audits item fields only (`cbm`, `pcs`, `sku`, dimensions) — **no status or arrival events** |

**Received Date must stay Unavailable.** Filling it from any of the above would put
a wrong date in front of a warehouse team.

### 3.2 Received Warehouse — only the region exists

The database records `main_container` = `UK | DE | US` (and `GERMAN` on the older
`containers` table). That is the destination *region*, which the dashboard's column
grouping already shows. There is **no per-warehouse receipt record**, so this cannot
be filled with Unit 3 / Unit 4 / Unit 18.

### 3.3 History — no history tables exist

No price history and no stock history at SKU grain. Unchanged from evidence/05.

## 4. Corrected query

`sql/corrected-extraction-query.sql` — every change annotated against the numbered
finding that justifies it. New fields: `n` (title), `cal` (Canada location),
`ar`/`br`/`kr`/`mr` (reserved), `ic`/`is` (incoming container + stage). Excludes the
`Unassign` placeholder at source.

## 5. Applied now

The `Unassign` fix needs no re-extraction and is live — 433 assertions, 0 failures,
all six datasets byte-identical.

Everything else in §2 requires re-extracting all 1,805 rows and adding columns to
the table, which changes the UI layout. **Awaiting confirmation of the column set
before that runs.**
