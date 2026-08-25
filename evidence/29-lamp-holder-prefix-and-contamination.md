# Evidence 29 — Lamp Holder prefix validation and contamination

**Date:** 2026-08-24 · SELECT-only.

## 1. `sku LIKE 'LH%'` is not the population

```sql
SELECT count(*) FROM inventory.products WHERE upper(sku) LIKE 'LH%';   -- 1060
```

| | Count |
|---|---|
| LH-prefixed products | **1,060** |
| Genuine sheet-declared lamp holders that resolve | **231** |
| **Contamination if the prefix were used** | **829 / 1,060 = 78.2%** |

Named false positives:

| SKU | Why it is not a lamp holder row |
|---|---|
| `LHBGE27BM+CGMLBM` | bundle: holder + cage |
| `LHBGE27BM3PK+CGMLBM3PK` | bundle of two 3-packs |
| `LHBPE27BM+CGMLAG` | bundle: holder + cage |
| `LHAHE27AM2PK`, `LHAHE27AM3PK` | multi-packs of one holder |
| `LHC1E27WH5PK` | pack; description is the placeholder `Combo Default Title.` |
| `LHLBB22BM`, `LHMTE27BM` | end-of-line, delisted |

Consistent with every earlier category: Ceiling Rose 94.6%, Lampshade 81.5%,
Pendant Lamp Holder 84.9%, **Lamp Holder 78.2%**. Prefix matching has now failed
on four consecutive categories.

`listings.shopify_listings.product_type` was tested as a fallback classifier and
rejected — for LH SKUs it returns **21 different free-text values**, the same SKU
can carry several, and they include `LAMPSHADE` (9), `Light Bulbs` (18), `Wall
Light` (1) and `Pendant Lighting` (2). It is a marketplace field, not a source of
truth.

## 2. Contamination *inside* the sheet's own 247 rows

| Kind | Rows | Detail |
|---|---|---|
| Unresolvable / corrupt | **15** | 13 `-IDE` + 2 malformed; images point at unrelated combos (evidence/28 §2) |
| Pack / combo | **5** | `LHC1E27WH3PK`, `LHC1E27WH5PK`, `LHC1E27WHAPK`, `LHC6E27WH5PK`, `LHC6E27WHAPK` |
| Cross-section duplicate | **1** | `PHXSH1PBRWH` — already in the LOCKED Pendant Lamp Holder section |
| Bundles (`+`) | 0 | |
| Duplicate SKUs | 0 | |
| **Total to exclude** | **21** | |

The 5 packs are independently disqualified by the database, not just by their
names:

```sql
SELECT sku, description, (SELECT count(*) FROM inventory.physical_product_stock s
       WHERE s.inventory=p.id) AS stock_rows
FROM inventory.products p WHERE upper(sku) IN (…the 5…);
```

| SKU | description | stock rows |
|---|---|---|
| LHC1E27WH3PK | `Combo Default Title.` | **0** |
| LHC1E27WH5PK | `Combo Default Title.` | **0** |
| LHC1E27WHAPK | `Combo Default Title.` | **0** |
| LHC6E27WH5PK | `Combo Default Title.` | **0** |
| LHC6E27WHAPK | `Combo Default Title.` | **0** |

Each would render as a row with a placeholder description and *Unavailable* in
all seven warehouses.

## 3. The resulting clean population

**247 − 15 corrupt − 5 pack/combo − 1 locked-elsewhere = 226 SKUs.**

Measured coverage for those 226:

| Field | Coverage |
|---|---|
| Resolves 1:1 in `inventory.products` | 226/226 (100%) |
| Description | 226/226 (100%) |
| Image (all on the Contabo CDN) | 226/226 (100%) |
| Stock row — UK Unit 3 (wh 1) | 226/226 (100%) |
| Stock row — UK Unit 4 (wh 8) | 226/226 (100%) |
| Stock row — UK Unit 18 (wh 6) | 226/226 (100%) |
| Stock row — Kronen (wh 10) | 226/226 (100%) |
| Stock row — Schmutter (wh 7) | 226/226 (100%) |
| Stock row — Canada (wh 4) | 226/226 (100%) |
| Stock row — US (wh 32) | 226/226 (100%) |
| UK Unit 3 shelf location | 223/226 (98.7%) |
| UK Shopify price | 220/226 (97.3%) |
| UK container (arrived orders) | 43/226 (19.0%) |
| DE container (arrived orders) | 12/226 (5.3%) |
| **End of line** | **68/226 (30.1%)** |

The population is clean and complete. **The population is not what blocks
implementation — the category logic is.** See `validation/lamp-holder-discovery.md`.
