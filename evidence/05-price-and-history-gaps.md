# Evidence 05 — Shopify Price Ambiguity & Missing History

## Shopify price is not resolvable to one value per SKU

`listings.shopify_listings` is the only Shopify price source. It is keyed by
(sku, site, channel) — one SKU can hold many listing rows across several store channels.

Channels found carrying CRSF/CRFF listings:

| site | channels |
|---|---|
| UK | LEDSone, Vintagelite, Electricalsone, dcvoltage, BesBet |
| Germany | LEDSone DE |
| France | LED Sone FR |
| US | LEDSone US |
| Canada | Relicelectrical |

For the 332 SOT ceilingrose SKUs, restricted to `site='UK'`:

| Measure | SKUs |
|---|---|
| No UK Shopify listing at all | **30** |
| Exactly one UK listing | 37 |
| More than one UK listing | **265** |
| **UK listings with conflicting prices** | **244 (73.5%)** |

Example — `CRSF100BM`: UK prices range **£3.99 – £7.90** across channels.
`CRFF10020CH`: **£1.75 – £5.19**. `CRSF10025BM`: **£4.99 – £6.59**.

There is no `is_primary` flag, no channel-precedence table, and no business rule in the
database that selects which channel's price is "the" Shopify Price. The dashboard shows a
single value (e.g. £5.89) — that value cannot be derived from LEDSone MCP without a
business rule that does not exist in the source.

Additional: `listings.shopify_listings.currency` is **NULL for every CRSF/CRFF row**, so the
currency shown on the dashboard (£) is not sourced from LEDSone MCP either.

## History — not available

Catalog-wide search for `%log%`, `%history%`, `%movement%`, `%adjust%` across
`inventory`, `suppliers`, `order_management`:

- **No stock history table.**
- **No stock movement / transaction table.**
- **No goods-received table.**
- `inventory.physical_product_stock` has no timestamp column, so not even a
  last-changed date can be shown.
- `suppliers.order_item_logs` logs purchase-order-line field edits
  (change_key / old_value / new_value / change_by / created_at) — it is not warehouse stock history.

The dashboard's UK "History" and GERMAN "History" buttons therefore have **no backing source**
in LEDSone MCP.
