# Evidence 42 — Shopify price: `public.listing_data` vs the source in use

**Date:** 2026-08-26 · Read-only. Triggered by: *"user said all products have the Shopify
price — check it."* Not committed, not pushed.

## Verdict

The table pointed to is **the right source and a large improvement in price quality**,
but the premise it was given with is **not correct**. 58.6% of dashboard SKUs have a
Shopify UK price. The other 41.4% are, in the overwhelming majority, **not listed on
Shopify at all** — so no source can supply a price for them.

## Sources compared

| | In use until now | Checked here |
|---|---|---|
| Connector | LEDSone MCP | second Postgres connector |
| Table | `listings.shopify_listings` | `public.listing_data` |
| Filter | `site = 'UK'`, `price IS NOT NULL` | `which_channel = 3`, `wrong_sku = 0`, `market_place = 'UK'`, `price > 0` |
| SKU resolution | `sku` | `COALESCE(NULLIF(mapped_sku,''), sku)` |

## Result over all 5,661 dashboard SKUs

| | In use now | `listing_data` | Change |
|---|---:|---:|---|
| Exact single price | 1,222 (21.6%) | **3,302 (58.3%)** | **×2.7** |
| Ambiguous price range | 2,100 (37.1%) | **18 (0.3%)** | **−99%** |
| No price | 2,339 (41.3%) | 2,341 (41.4%) | unchanged |

**Coverage does not move. Price quality transforms.** 2,082 SKUs that today display a
misleading range — `CRFF100BY £2.45–£5.99` — resolve to one price, `£5.99`.

## The check that makes this safe

Of the SKUs holding an exact price in **both** sources — 1,219 of them — the two sources
agree on **every single one**. Zero disagreements, maximum difference £0.00.

This is not a different price. It is the same price with the ambiguity removed: the old
query collapsed several store channels into a min–max range, `listing_data` separates
them by `sub_source_name` so one store's price can be named.

Only **3 SKUs would lose** a price they show today — `LSFC220GD`, `PHMU1PBRFG`,
`WSADHTBM` — all three are listed on Shopify UK with `price = 0`, which the
`price > 0` rule correctly rejects.

## Which store supplies the price

`ledsone` first, then any other UK store:

| Store | SKUs priced |
|---|---:|
| `ledsone` (sub_source 104) | 2,690 |
| `045e77-2` | 263 |
| `vintage-light-web` | 199 |
| `electricalsoneuk` | 165 |
| `dcvoltage-2` | 3 |

This confirms the earlier independent finding that `sub_source = 104` is the primary
UK store.

## Why 2,341 SKUs still have no price — measured, not assumed

All 35,467 Shopify rows in `listing_data` were read and matched against the dashboard:

| Reason | SKUs | Share |
|---|---:|---|
| **Not listed on Shopify at all** — no row in any market | **2,245** | **95.9%** |
| Priced on a non-UK Shopify market only (DE/FR/US/CA) | 88 | 3.8% |
| Listed on Shopify UK but `price` is 0 or NULL | 8 | 0.3% |

**Zero** were recovered by stripping a variant suffix (`_AML`, `_AMD`, `-IDE`, `-CA`),
so SKU-form mismatch is ruled out as a cause.

## Coverage by section — the gap is structural, not a data fault

| Section | SKUs | With a Shopify UK price |
|---|---:|---:|
| Lamp Holder | 226 | **97.3%** |
| Ceiling Rose | 332 | **91.0%** |
| Bulbs | 334 | 82.6% |
| Lamp Spares | 1,420 | 69.2% |
| Home Appliances | 705 | 67.0% |
| Clothes | 177 | 62.7% |
| Lighting | 562 | 56.2% |
| Wall Arm | 180 | 47.2% |
| Lampshade | 851 | 42.2% |
| Pendant Lamp Holder | 398 | 37.2% |
| Cosmetics | 124 | 29.0% |
| **Refurbished** | **352** | **3.4%** |

Refurbished alone accounts for 340 of the unpriced SKUs — refurbished stock is not sold
through Shopify, so this is the correct answer rather than a missing one. The finished
retail categories (Ceiling Rose, Lamp Holder, Bulbs) are 83–97% covered, which is what
"most products have a Shopify price" is true of.

## How this would be applied without breaking a lock

The price fields `p`, `pn`, `p0`, `p1` live **inside** the fourteen locked datasets, so
re-extracting them would break all fourteen hashes. It does not need to: the same
separate-lookup pattern already used for `INCOMING`, `LS_EXTRA`, `LB_EXTRA` and
`HAP_GROUP` applies here —

```js
const SHOPIFY_PRICE = { "CRFF100BY": [1, 5.99, 5.99], ... };   // sku -> [np, pmin, pmax]
```

merged onto rows at load, overriding `p`/`pn`/`p0`/`p1`. Every embedded array stays
byte-identical and all fourteen locks survive.

**Not applied.** It changes the price on every row of every section and needs a decision.

---

# Part 2 — Applied (2026-08-26)

Applied exactly as proposed, via a separate lookup rather than re-extraction.

```js
const SHOPIFY_PRICE = { "CRFF100BY": 5.99, "LSCY290BM": [3, 12.99, 18.49], ... };
```

A **number** is an exact price; an **array** `[channels, low, high]` covers only the 18
SKUs where UK stores still disagree after preferring `ledsone`. 3,320 entries, 56,328
bytes, sha256 `8219ec4f…`.

Merged in one pass over every section **after** classification, so a single rule governs
the whole dashboard:

```js
Object.keys(CATS).forEach(key => {
  CATS[key].data.forEach(r => {
    const px = SHOPIFY_PRICE[r.s];
    if (typeof px === 'number'){ r.p = px;   r.pn = 1;     r.p0 = px;    r.p1 = px;    }
    else if (px)               { r.p = null; r.pn = px[0]; r.p0 = px[1]; r.p1 = px[2]; }
    else                       { r.p = null; r.pn = null;  r.p0 = null;  r.p1 = null;  }
  });
});
```

The `else` branch matters: `listing_data` is now the single source of truth, so a SKU
missing from it shows *no listing* rather than a stale value from the old query.

## Result on the live page

| | Before | After |
|---|---:|---:|
| Exact single price | 1,222 | **3,302** |
| Unresolvable range | 2,100 | **18** |
| No UK Shopify listing | 2,339 | 2,341 |

`CRFF100BY` went from `£2.45 – £5.99` *Unavailable* to **£5.99**.

## Unavailable wording corrected

Both messages described the old source and are no longer true:

- the range message claimed *"LEDSone MCP has no primary-channel rule"* — there is one
  now (`ledsone` first), so the 18 survivors are cases where **the stores genuinely
  disagree and none is the primary**. Reworded to say that.
- the no-price message said *"not available in LEDSone MCP"*, implying an extraction
  gap. It now names the real reason and the real source: no UK Shopify listing with a
  price above zero, `public.listing_data, which_channel = 3, wrong_sku = 0`.

## Validation

`node validation/test_lampshade.js` → **ALL PASS — 874 passed, 0 failed** (838 before;
+36). Phase 35 asserts the three buckets (3,302 / 18 / 2,341) sum to 5,661, that every
row matches the lookup exactly, that no stale price survives for an unlisted SKU, that
no stored price is ≤ 0, that every range genuinely spans two prices, the per-section
coverage figures, the three `price = 0` drops, and both corrected messages.

**All fourteen dataset locks verified byte-identical.** The lookup is now locked too.
