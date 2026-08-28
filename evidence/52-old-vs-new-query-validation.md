# Evidence 52 — Old vs new queries: are they safe to replace the old ones?

**Date:** 2026-08-28 · Read-only throughout. Nothing changed, nothing published.

Asked: run the new queries, compare with the existing data, quantify the match, and
decide whether each difference is a **real database change** or a **fault in the new
query**.

## The method, and why the obvious one does not work

My first attempt corroborated stock changes against `inventory.product_history` and found
**94.6% uncorroborated** — which looked alarming until I read one case properly.

`CL3TBM`'s newest history line is `Unit3 1818 -> 618`. The dashboard holds **400** and the
database holds **264**. Neither figure appears in the log at all.

**Routine order picking is never written to `product_history`.** Only manual recounts and
supply receipts are. So history cannot corroborate a stock movement, and
`physical_product_stock` carries no timestamp. That test was wrong, not the data.

The test that does work: **run the OLD query form and the NEW query form against the same
database in the same session and diff the results.** Any difference is the query. No
difference means every difference against the dashboard is drift in the data.

---

## PART 1 — Are the new queries correct?

| Dataset | Old form vs new form | Verdict |
|---|---|---|
| **Stock** | **46,816 / 46,816 cells identical (100.0000%)** | correct |
| **Containers** | **2,686 / 2,686 rows identical (100.0000%)** | correct |
| **History** | **4,306 / 4,306 SKUs identical (100.00%)**, 29,876 movements re-parsed | correct |
| **Received** | **11,704 / 11,704 SKU-region pairs identical (100.00%)** | correct |
| **Shopify price** | 1,866 / 3,437 identical (54.29%) | **changed on purpose** |

### The stock test in detail

The old extraction used eight correlated sub-selects keyed on `products.id`; the new one
reads the table once and joins in memory. Different SQL, same answer on **every one of
46,816 cells**. Nothing in the stock path has changed meaning.

### The price difference is the rule change, and it is the one that was asked for

1,571 prices (45.7%) differ because the old form took `min(price)` across `site='UK'` —
the **cheapest** UK store — and the new one takes **LEDSone first**:

| SKU | cheapest UK | LEDSone |
|---|---:|---:|
| 12ASIP20100 | 9.89 | **10.69** |
| 12ASIP20150 | 12.89 | **13.59** |
| 12BO48 | 6.99 | **11.29** |

Every one is higher, which is the expected direction: the old query was quoting
Vintagelite and Electricalsone prices for products LEDSone also sells.

**The safety check that matters: 0 SKUs lose a price under the new rule.** No row goes
from priced to unpriced. The change adds accuracy, it does not remove data.

---

## PART 2 — How much has the data actually moved?

Comparing what the dashboard holds against what the (now-proven) queries return:

| Dataset | Compared | Identical | Match | Changed | Added | Removed |
|---|---:|---:|---:|---:|---:|---:|
| SKU records | 5,852 | 5,852 | **100.00%** | 0 | **381** | **0** |
| Stock cells | 46,816 | 45,229 | **96.61%** | 1,587 | — | — |
| Descriptions | 5,852 | 4,831 | 82.55% | 1,021 | — | — |
| History (SKUs) | 4,306 | 4,306 | **100.00%** | 0 | 0 | 0 |
| Received (pairs) | 11,704 | 11,704 | **100.00%** | 0 | 0 | 0 |
| Containers | 2,686 | 2,686 | **100.00%** | 0 | — | — |

**Overall field-level accuracy: 96.6% on stock, 100% on everything else that was
extracted recently.**

### Which stock values changed

1,587 cells across **1,171 SKUs — one row in five**:

| Warehouse | cells changed |
|---|---:|
| Unit 3 | 932 |
| Unit 4 | 306 |
| Schmutter | 211 |
| Kronen | 68 |
| US | 62 |
| Unit 18 | 8 |

Examples: `CL3TBM` Unit 3 400 → 264 · `LSOL220YB` Unit 3 4 → 1 · `LHSHE27GB` Unit 3
160 → 137. `LSOL220YB` is the kind that matters — an amber low-stock cell that should be
nearly red.

### Which SKUs were added

**381 added, 0 removed.** Lampshade +145, Pendant +84, Ceiling Rose +51, Lamp Spares +36,
Home Appliances +10, and 52 with no prefix rule at all.

**The catalogue is live while this was being measured.** Two runs an hour apart returned
380 and then 381:

```
LQK1   created 2026-08-27 07:56   LED Soft Neon Filament Lamp Retro Edison Industrial
```

One product added to LEDSone between the two runs. That single row is the whole argument
for a scheduled refresh.

### Descriptions

1,021 changed (17.5%). Not a query issue — `product_history` records 380,777
`Product was editted by …` lines, so catalogue text is edited constantly. Harmless, but it
means a refresh will churn the description column every run.

---

## PART 3 — Anything missing or unexpected?

- **0 SKUs removed.** Every row on the dashboard still exists in Postgres.
- **0 history disagreements.** Not one movement differs on a row that existed before,
  which is the strongest evidence the parser is deterministic.
- **0 received disagreements** across 11,704 pairs.
- **0 SKUs lose a price.**
- **No unexpected records.** The only additions are the 381, and each one classifies
  under the derived rule table or lands in Other with its real description.

One thing to keep watching: the **CSV-upload wording is excluded** from the four history
types, so Canada, USA and Netherlands stock movements are no longer logged in the dialog.
That was a deliberate scope decision, not a fault, and it is why `US` shows 62 changed
cells with no matching history rows.

---

## VERDICT

**The new queries are safe to replace the old ones.**

| Question | Answer |
|---|---|
| Do the new queries return the same thing for unchanged data? | **Yes — 100.0000% on stock, containers, history and received** |
| Is any difference caused by a query fault? | **No.** The only intentional difference is the LEDSone channel rule |
| Does anything get lost? | **No.** 0 SKUs removed, 0 prices lost, 0 history rows changed |
| Is the drift real? | **Yes.** 1,587 stock cells and 381 new SKUs, proven by query equivalence |
| Accuracy of the current dashboard | **96.6% on stock, ~1 row in 5 carries at least one wrong number** |

**Recommendation: proceed.** The queries are validated; what remains is the extraction
layer, the apply step, and the cron wrapper with its publish guards.

**Caveats to carry forward:**

1. Stock cannot be corroborated by history — picking is not logged. Query equivalence is
   the only proof available, so the refresh must keep `query-equivalence.js` as a
   pre-flight check, not a one-off.
2. The description column will churn every run.
3. A refresh must never publish on a row-count collapse; the guard is not optional.

## Scripts

- `sql/refresh/query-equivalence.js` — old form vs new form, the decisive test
- `sql/refresh/compare-old-new.js` — dashboard vs live, per field
- `sql/refresh/compare-history-received.js` — parser re-run and diff
- `sql/refresh/random-check.js` — random sampling with a price-tier guard
