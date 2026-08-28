# 54 — SKU Fixed Price tab

**Date:** 2026-08-28 · **Assigned by:** Varmen · **User:** Postage & Warehouse Team
**Deliverable:** a third header tab on `dashboard/inventory-dashboard.html`

## What shipped

A `SKU Fixed Price` tab beside Inventory and Postage Information: **30,193 SKUs**
(4,768 single, 25,425 combo), each with its fixed UK selling price on every marketplace
the database actually holds, searchable and sortable, refreshed on the same 2-hourly cron
as the rest of the page.

## The finding that changed the spec

The requirement named six marketplaces. **Only four exist in the database.**

| Marketplace | Source | SKUs priced |
|---|---|---|
| Shopify | `listings.shopify_listings` | 16,671 |
| eBay | `listings.ebay_listings` | 21,972 |
| Amazon | `listings.amazon_listings` | 16,974 |
| B&Q | `listings.bandq_listings` | 3,981 |
| **Wayfair** | **none** | — |
| **Temu** | **none** | — |

Every schema was searched: there is no listing table, no price column and no channel
value for Wayfair or Temu anywhere. Both columns are therefore rendered as an explicit
**"no source"**, not left blank — a blank cell in a price table reads as "free" or as
"we checked and there is nothing", and neither is true.

## Product names had to be derived

`inventory.products.title` is authoritative for single SKUs. It is **not** for combos:
37,481 rows carry the literal string `Combo Default Title.` — every combo, plus 52 rows
flagged single. The marketplace titles are no better; Shopify's combo titles are variant
labels (`Green / Without Bulb`, `Pack 2`) and `ebay_listings.title` is null throughout.

Names are therefore composed from the SKU itself:

- `A+B+C` → the three component names joined with ` + `
- `12BO1002PK` → `LED 100W Power Adapter… (2 Pack)`

The pack split cannot be done by regex — a lazy match reads `12BO1002PK` as
`12BO1 + 002PK`. Each candidate split is resolved against the catalogue and the one that
names a real product wins. Letter pack codes are decoded through `inventory.product_pk`
(`A`=10, so `12MIP20100APK` is a 10 Pack).

**24,481 of 30,193 rows (81.1%) get a real name.** The remaining 5,712 are 5,659 `ENC*`
eBay combo placeholders — opaque codes carrying no component information anywhere in the
database — plus 53 whose base SKU has no single-product row. Those show the SKU itself.

## Price rule

`wrong_sku = 0 AND all_list = 1 AND price > 0 AND site = 'UK'`, ended listings excluded.
Shopify follows the dashboard's established channel priority (LEDSone first); the other
three take the lowest live UK listing. `shopify_listings.currency` is **null on all
71,202 rows**, so currency cannot be filtered on — `site` is the only usable discriminator.

**Shipping:** these tables carry no shipping column, so `price` is the fixed listing price
as stored. For Shopify and B&Q that is unambiguously the item price. For eBay and Amazon
it cannot be proven from the schema whether a given listing's price is shipping-inclusive
— there is nothing to subtract. Flagged, not silently asserted.

## Size

The payload is **2.28 MB**; the page went 3.87 MB → 6.47 MB. Plain names would have cost
4.63 MB, so names are interned into a dictionary and each row stores indices:

```
n = 5          dictionary entry 5
n = [5, -10]   entry 5, sold as a 10 Pack   (a negative marks a pack count)
n = [5, 9, 2]  a combo of entries 5, 9, 2   (indices are >= 0)
```

Prices are integers in pence, so no float noise reaches the page. The DOM holds 250 rows
at a time with a "show more" control — 30,193 rows are never all in the document.

## Verification

`validation/check-fixed-price.js` drives the page's own render, search, sort, filter and
paging code and asserts on the result. **All checks pass**, including: every row carries a
price; no duplicate SKU; no name is the placeholder; each "listed on X" filter returns
only rows priced on X; each price sort puts unlisted SKUs last in both directions; a
no-match search says so; dates render `DD/MM/YYYY` and an absent date renders empty.

`apply.js` gained four guards so a collapse can never publish an empty third tab: the
dictionary must exceed 1,000 entries, there must be ≥20,000 rows, every row must carry a
price, and every name index must resolve inside the dictionary.

Two full `refresh.sh` runs published cleanly (EXIT=0, 6,181 inventory rows unchanged,
`verify-locks.js` clean), proving the new block rides the existing cron.

## Open

- Wayfair and Temu cannot be filled from this system at all. They need a new data source.
- Whether eBay/Amazon `price` excludes shipping needs confirmation from someone who knows
  how those listings are loaded.
- The page is 6.47 MB. It has not been republished to the Varman AIOS hub.
