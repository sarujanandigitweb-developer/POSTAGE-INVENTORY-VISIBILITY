# Evidence 28 — Lamp Holder: Sheet ↔ database comparison

**Date:** 2026-08-24 · All access SELECT-only via the LEDSone MCP.

## 1. There is no Lamp Holder SOT in the database

```sql
SELECT source_tab, count(*), count(*) FILTER (WHERE upper(sku) LIKE 'LH%'), max(synced_at)
FROM configurator.components_sot_skus GROUP BY 1;
```

| source_tab | skus | LH-prefixed | last sync |
|---|---|---|---|
| bulb | 218 | 0 | 2026-08-20 06:41:56 |
| ceilingrose | 332 | 0 | 2026-08-20 06:41:56 |
| lampshade | 451 | 0 | 2026-08-20 06:41:56 |

**No `lampholder` tab is synced, and not one LH SKU appears in
`components_sot_skus` under any tab.** Same position as Pendant Lamp Holder: the
configurator attributes (`fitting_type`, `product_subtype`, `hole_diameter_mm`, …)
that classify Ceiling Rose and Lampshade carry **no rows at all** for LH SKUs,
because there are no LH SOT SKU records for them to hang off.

`inventory.products` has no category, type, subtype, family or fitting column —
checked across `inventory`, `configurator`, `listings` and `suppliers` in
`information_schema.columns`.

## 2. Sheet → Database (all 247 sheet rows probed)

| Outcome | Rows |
|---|---|
| Resolve 1:1 in `inventory.products` | **232** |
| **Do not resolve** | **15** |

1:1 resolution is therefore **93.9%**, not 100%.

### The 15 unresolved rows are corrupt, not merely missing

13 end in `-IDE` and 2 are malformed `SKU- Product Name` strings. Neither form
exists in the catalogue:

```sql
SELECT sku FROM inventory.products WHERE upper(sku) LIKE '%-IDE';   -- 0 rows, entire catalogue
SELECT sku FROM inventory.products WHERE upper(sku) LIKE 'LHCE27%'; -- 0 rows
SELECT sku FROM inventory.products WHERE upper(sku) = 'LHNSE27';    -- 0 rows
```

A recovery attempt was made through their `IMG_LINK` image ids. **Every one of the
15 points at an unrelated combo/bundle product:**

| Sheet SKU_ID | Image | The product that image actually belongs to |
|---|---|---|
| LHC1E27WH-IDE | 10597.jpg | `WCFRHE+RPR44WH` (wall cage combo) |
| LHC1E27WH3PK-IDE | 10598.jpg | `WCRTBR+RPR44WH` |
| LHC1E27WH5PK-IDE | 10599.jpg | `WCBKHE+RPR44WH` |
| LHC1E27WHAPK-IDE | 10600.jpg | `CRSF100CO2PK+WSSS70CO2PK+LSTF40CO2PK` |
| LHCE27- Lamp Holder | 7710.jpg | `CRSF2003BC+PHSH1PBRYB3PK+WCDCBC3PK` |
| LHNSE27- Fully Earthed… | 7813.jpg | `PLBXBM+PCBI500TP+PCBITB+PCPTPH+LSDO210RR` |
| LHNSE27SN-IDE | 7814.jpg | `PLBXBM+PCBI600TP+PCBITB+PCPTPH+LSDO210RR` |
| LHNSE27WH-IDE | 7815.jpg | `PLBXBM+PCBI50TP+PCBITB+PCPTPH+LSLT360BT` |
| LHNSE27YB-IDE | 7816.jpg | `PLBXBM+PCBI75TP+PCBITB+PCPTPH+LSLT360BT` |
| LHNSE27CH-IDE | 7817.jpg | `PLBXBM+PCBI100TP+PCBITB+PCPTPH+LSLT360BT` |
| LHNSE27RO-IDE | 7818.jpg | `PLBXBM+PCBI200TP+PCBITB+PCPTPH+LSLT360BT` |
| LHNSE27CO-IDE | 7819.jpg | `PLBXBM+PCBI300TP+PCBITB+PCPTPH+LSLT360BT` |
| LHNSE27GB-IDE | 7820.jpg | `PLBXBM+PCBI400TP+PCBITB+PCPTPH+LSLT360BT` |
| LHNSE27BY-IDE | 7821.jpg | `PLBXBM+PCBI500TP+PCBITB+PCPTPH+LSLT360BT` |
| LHSHE27BY-IDE | 11202.jpg | `CTBOP2L+CTBOP3L+CTBOP8L` |

The `-IDE` rows are also **not** copies of their base rows — every one differs
from its base in the image and in other columns. They cannot be repaired from
inside the sheet, and repairing them from the image would attach a wall-cage or
pendant-bundle photograph to a lamp holder.

**These 15 rows are excluded. They are a sheet defect to be fixed at source.**

## 3. Database → Sheet (all 1,060 LH-prefixed products probed)

| Bucket | Products | Examples |
|---|---|---|
| pack / combo (`…PK`) | **539** | LHAHE27AM2PK, LHAHE27AM3PK, LHAHE27BM2PK |
| **single, active, absent from the sheet** | **157** | LHGU10SK, LHETBM, LHCTOBM, LHHGE27BM, LHF3HT40BM |
| bundle (`+`) | 100 | LHBGE27BM+CGMLBM, LHBPE27BM+CGMLAG |
| end of line, absent from the sheet | 33 | LHLBB22BM, LHLTE27RE, LHMTE27BM |
| **on the sheet and resolving** | **231** | |
| **Total LH-prefixed** | **1,060** | |

The 157 are not junk. Sampled descriptions: *"GU10 Bulb Holder Downlight Base
Connector"*, *"E27 ES Bulb Holder Batten Lamp Fitting Threaded 20mm Conduit"*,
*"External thread aluminum lamp holder"*, *"16*400MM internal thread iron
pipe-Floor lamp holder"*, *"Black hanging E27 lamp holder"*. They are **live,
non-EOL lamp holders that the sheet simply does not list** — including whole
families (GU10, batten, floor-lamp, external-thread) and colour variants of
families the sheet does list (LHCTOBM/CH/RO/SN/WH alongside the sheet's
LHCTOCO/FG/YB).

## 4. The freshness problem, both ways

| | Count | Share |
|---|---|---|
| Sheet SKUs that are **end of line** | **68 / 231** | **29.4%** |
| Live catalogue lamp holders **missing from the sheet** | **157** | — |

For comparison, on the tabs that are synced: Ceiling Rose 39/332 = 11.7% EOL,
Lampshade 11/451 = 2.4%. This tab is the outlier by a wide margin.

A section built from this sheet would show the Postage & Warehouse team 68 dead
SKUs while hiding 157 live ones.

## 5. Cross-section collision with a LOCKED section

Sheet row 249 is **`PHXSH1PBRWH`** — a `PH` SKU on the Lamp Holder tab. It
resolves (product id 40741, *"E27 lamp Holder with LED Housing & 1 meter of 0.75
sq mm two…"*), **and it is already embedded in the locked Pendant Lamp Holder
dataset** (verified against `sql/pendant-lamp-holder_data.json`).

Including it here would create a duplicate dashboard record across two sections.
**Excluded.**
