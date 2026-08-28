# Evidence 51 — Postgres as the source of truth: the exact tables, fields and rules

**Date:** 2026-08-27 · Read-only. Nothing changed. Not committed, not pushed.
**Supersedes** the "a refresh cannot rebuild six sections" conclusion in evidence/50.

Instruction: Postgres is the authority; do not depend on the Google Sheet for SKU
membership; classify by the established prefix rules, longest prefix first; unmatched
goes to **Other**, never dropped; take warehouse names from the database.

## 1. You were right — Postgres has more, and I was wrong about one thing

Evidence/50 said `configurator.components_sot_skus` "has never carried a ceilingrose
tab". **It does.** Its three tabs are **lampshade 451, ceilingrose 332, bulb 218** —
1,001 rows, exactly the three populations. Only Pendant, Wall Arm and Lamp Holder are
absent from it. Corrected in place.

More importantly, the whole sheet-versus-database question turns out to be smaller than
it looked, once the right filter is applied.

## 2. THE COMPLETE SKU LIST — and the filter that was missing

`inventory.products` is the complete list. It has **no category column**; nor does any
other table in the database. The SKU prefix is the only category signal that exists.

```sql
SELECT DISTINCT ON (upper(sku)) upper(sku), id, description, title
FROM inventory.products
WHERE inventory_bool                       -- THE FILTER THAT WAS MISSING
  AND sku NOT LIKE '%+%'                   -- bundles
  AND sku !~ '[0-9A-Z]PK$'                 -- packs
  AND upper(sku) NOT LIKE '%DUMMY%'        -- CRSFDUMMYSKU, "Dummy SKU for eBay"
ORDER BY upper(sku);
```

| | count |
|---|---:|
| all single SKUs | 16,423 |
| **`inventory_bool = true`** | **6,234** |
| `inventory_bool = false` | 10,189 |

**The 10,189 excluded are not products.** 10,188 of them are `ENC1…ENC10000`, every one
described `Combo Default Title.`, every one `inventory_bool = false` — eBay combo
placeholders. Without this filter a "classify everything, unmatched to Other" rule would
put **10,188 phantom rows into Other** and drown the dashboard. 479 of them even carry
stock, mirrored from their components, so a stock filter would not have caught them.

Fields to use: `sku` (identity, upper-cased), `description` (the product name shown —
`title` is mostly the same or blank), `id` (joins to stock, images, history).

## 3. Dashboard vs Postgres — measured, not estimated

| | |
|---|---:|
| real SKUs in Postgres | **6,232** |
| on the dashboard | 5,852 |
| **in Postgres, missing from the dashboard** | **380** |
| on the dashboard but not in Postgres | **0** |

No phantom rows. The 380 missing, by prefix:

| prefix | missing | | prefix | missing |
|---|---:|---|---|---:|
| LS Lampshade | 144 | | AF Artificial Flowers | 6 |
| PH Pendant | 84 | | TE | 4 |
| CR Ceiling Rose | 51 | | LK / LO / RP | 3 each |
| CE Cable Tie | 27 | | CG/CP/DC/LA/LB/TH | 2 each |
| 35 | 12 | | long tail | 1 each |
| CF | 10 | | | |
| 50 | 7 | | | |

Wall Arm looks like a gap (278 `WS%` vs 180 shown) but is not: the rest are already on
the dashboard under **Lighting → Wall Scones**. `WS` is split across two sections, which
is the open duplicate-category question from evidence/38.

## 4. Classification — the rule, and why two characters is not enough

Longest declared prefix wins. The existing implementation already does this and is
correct; it just needs to be driven from the full Postgres list instead of the sheet.

**`CR` proves the point.** Its four 4-character prefixes are **CRFF, CRFL, CRSF, CRSP** —
and `CRSP` is not a ceiling rose:

```
CRSP112R48CH  = This is a 1.12-meter PVC three-core transparent cable…
CRSF20BM      = 2 cm - Black                     (a part, not a rose)
CRSFDUMMYSKU  = Dummy SKU for eBay               (excluded above)
CRSFM100BR    = 100 multi-layer covers
```

Only 5 of the 53 `CR%` extras describe a ceiling rose. Classifying `CR` on two characters
would file 48 cables and parts as ceiling roses.

Contrast `LS`: 116 of the 236 extras say "shade", and the rest are chandeliers, crystal
lights and pendant sets — the same family, which is why `LS_EXTRA` already carries 400 of
them. And `PH` at 79.9% / `WS` at 82.4% description match are clean enough to use.

The rule set to drive the refresh, all already defined and validated in the page:

* `CLASSIFY` — 10 two-character rules
* `SUB4` — 145 four-character rules derived from validated data, 15 ambiguous
* `PREFIX_RULES` — 33 declared prefixes, longest-match-first
* in-memory re-typings — Wall Arm 11→4, Bulbs series→attribute, Handles→Lamp Spares
* **Others** — already built, per section, keeping the source's own name in `osub`

**A 12th "Other" section is still needed** for a SKU matching no section at all, so a new
prefix appears rather than vanishing.

## 5. WAREHOUSE NAMES — you asked me to check this carefully. Here is the answer

`inventory.warehouse` (`warehouse`, `warehouse_name`, `warehouse_location`):

| id | Postgres name | location | dashboard header | verdict |
|---:|---|---|---|---|
| 1 | UK Unit3 | UK | UK — Unit 3 | matches |
| 6 | UK Unit18 | UK | UK — Unit 18 | matches |
| 8 | UK Unit4 | UK | UK — Unit 4 | matches |
| 4 | Canada1 | Canada | Canada | matches |
| 32 | US1 | US | US | matches |
| 7 | Trossingen schmutter str | Germany | German — Schmutter | abbreviated |
| 10 | Trossingen kronen str | Germany | German — Kronen | abbreviated |
| **33** | **NO ROW** | — | **UK — Unit 5** | **not in the database** |
| **2** | **France1** | France | **not shown** | **3,298 units invisible** |
| **3** | **Netherlands1** | Netherlands | **not shown** | **4,912 units invisible** |
| **5** | **Duisburg warehouse** | Germany | **not shown** | **675 units invisible** |

Three findings:

1. **The dashboard's names are not wrong** — they are the Postgres names, shortened. No
   stale or mis-mapped name was found.
2. **Warehouse 33 has no row in `inventory.warehouse`.** The one name the team cares most
   about is the one the database cannot supply. "UK Unit 5" remains a team statement,
   proven only by the history text (evidence/45). A refresh that took names from the
   database alone would leave this column **unnamed**.
3. **Three warehouses are missing from the dashboard entirely** — France, Netherlands and
   Duisburg, 8,885 units between them. Duisburg is German stock the German columns do not
   include.

So: take names from `inventory.warehouse` on every run, keep a single declared override
for 33 until its row exists, and add the three missing warehouses if the team wants them.

## 6. A correction to the Shopify pack logic — `inventory.product_pk` exists

I decoded pack suffixes by inference (single digit, `A` = 10, confirmed from listing
titles). **The database has the authoritative table**:

```
1=1  2=2  3=3  4=4  5=5  6=6  7=7  8=8  9=9  A=10  L=11  G=12  B=15  H=16
C=20  I=24  S=25  D=30  E=50  J=75  M=80  F=100  K=150  N=200  O=250
P=300  Q=500  R=1000
```

My rule was right about `A=10` and right to reject two digits, but **incomplete**: it
cannot read `L`, `G`, `B`, `H`, `C`, `I`, `S`, `D`, `E`, `J`, `M`, `F`, `K`, `N`, `O`,
`P`, `Q`, `R`. The refresh must join `inventory.product_pk` instead of using a regex.

## 7. The attribute data is in Postgres too

`configurator.components_sot_attributes` defines **~400 attributes** including
`product_type`, `product_subtype`, `material_primary`, `shade_shape`, `fitting_type`,
`mount_type`, `bulb_series`, `stock_count`, with values in
`components_sot_attribute_values`. For the 1,001 lampshade / ceilingrose / bulb SKUs the
Level-1 material, Level-2 shape and fitting attributes can come from the database rather
than the sheet.

Pendant, Wall Arm and Lamp Holder have no rows there, so their `Mount Type` and `Subtype`
attributes have no database source and would read *Unavailable* — as Lamp Holder's
already does for the 191 added by prefix.

## 8. The refresh population rule, stated exactly

```
POPULATION  inventory.products WHERE inventory_bool
                               AND sku NOT LIKE '%+%'
                               AND sku !~ '[0-9A-Z]PK$'
                               AND upper(sku) NOT LIKE '%DUMMY%'
CATEGORY    longest declared prefix wins (PREFIX_RULES -> SUB4 -> CLASSIFY)
UNMATCHED   -> section "Other", never dropped
ATTRIBUTES  configurator.components_sot_* where present, else Unavailable
STOCK       inventory.physical_product_stock, warehouse id -> column
WH NAMES    inventory.warehouse, + one declared override for 33
PRICE       listings.shopify_listings, wrong_sku=0 AND all_list=1 AND price>0,
            5 tiers, LEDSone-first, packs via inventory.product_pk
HISTORY     inventory.product_history, the four line types, field->warehouse map
RECEIVED    latest Supply / German Supply line; warehouse = the field that increased
CONTAINER   suppliers.order_items -> orders -> final_containers, status_arrived,
            latest order_date <= received date   (DATE PROXIMITY, not a key)
INCOMING    the same join, NOT status_arrived
```

Expected result: **6,232 rows**, up from 5,852.

## 9. Three things I need decided before building

1. **The 380 new SKUs change six section counts** — Lampshade +144, Pendant +84, Ceiling
   Rose +51 and so on. Every hash-locked dataset is replaced by a generated one, so the
   fourteen locks stop meaning what they mean today. Is that accepted?
2. **Warehouse 33.** Keep the declared "UK Unit 5" override, or show the id until a row
   exists in `inventory.warehouse`? A database-only rule leaves the column unnamed.
3. **France, Netherlands and Duisburg** — 8,885 units, three real warehouses, no columns.
   Add them, or keep them out?
