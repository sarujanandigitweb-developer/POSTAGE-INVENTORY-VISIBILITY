# Evidence 11 — Dashboard Dataset Provenance & Validation

Date: 2026-08-20 · Dashboard: `dashboard/ceiling-rose-inventory-visibility.html`

## Provenance chain (proves data came from MCP, not the existing dashboard)

1. `mcp__claude_ai_Ledsone_postgres__execute_sql` returned the dataset as a single
   `json_agg(...)::text` payload (two calls: Front Fitting, then Side Fitting).
2. Both payloads exceeded the inline result limit and were written by the MCP client to
   `~/.claude/projects/.../tool-results/mcp-claude_ai_Ledsone_postgres-execute_sql-*.txt`.
3. The JSON was extracted with `jq -r '.data.rows[0].data'`, merged with `jq -s`, and
   concatenated into the HTML by shell — **never retyped by hand**, so no transcription
   or substitution from any screenshot was possible.
4. Independent re-query of 6 SKUs afterwards matched the embedded values exactly (below).

## Independent re-query cross-check

Fresh MCP query run *after* the file was built, compared to the embedded values
(order: Unit 3, Unit 4, Unit 18, Kronen, Schmutter, CA, US):

| SKU | Embedded | Live MCP | Match |
|---|---|---|---|
| CRFF100BM | 799, 148, 900, 0, 293, 30, −2 | identical | YES |
| CRFF105CH | 295, −2, 100, 0, −1, 0, 0 | identical | YES |
| CRFF140SN | 30, 0, 0, 0, 0, 503, 0 | identical | YES |
| CRSF100BM | 2256, 1071, 5700, 0, 3839, 0, −11 | identical | YES |
| CRSF100CH | 337, 0, 1100, −1, 634, 69, 0 | identical | YES |
| CRSF2003BM | 616, 597, 1450, 0, 377, 20, 353 | identical | YES |

Note: `CRSF100BM` Unit 3 read **2264** earlier in this session and **2256** at extraction;
`CRFF100BM` Unit 4 read **160** earlier and **148** at extraction. The live table moved between
reads — further proof the embedded numbers are freshly fetched, not carried over from the
earlier discovery pass or from the screenshots (which showed entirely different figures).

## Dataset composition

| Metric | Result |
|---|---|
| Product set | `configurator.components_sot_skus` WHERE `source_tab='ceilingrose'` |
| CRSF SKUs (Side Fitting) | 219 |
| CRFF SKUs (Front Fit) | 113 |
| Total embedded rows | **332** |
| Distinct SKUs | 332 (0 duplicates) |
| Bundle SKUs | 0 |
| Unrelated-family SKUs | 0 |
| SKUs unresolved in `inventory.products` | 0 |
| Grain | 1 row per SKU |

## Field mapping

| Dashboard column | MCP source |
|---|---|
| SKU | `inventory.products.sku` |
| Type | `configurator` attr `fitting_type` → CRSF `Side Fitting`, CRFF `Front Fit` |
| Description (search only) | `configurator` attr `product_subtype` |
| Image | `inventory.product_images.image_url` via `product_id` FK |
| Unit 3 Stock / Location | `physical_product_stock.quantity` / `.product_shelf_location`, `warehouse=1` |
| Unit 4 Stock / Location | same, `warehouse=8` |
| Unit 18 Stock | same, `warehouse=6` |
| Kronen Stock / Location | same, `warehouse=10` |
| Schmutter Stock / Location | same, `warehouse=7` |
| CA | same, `warehouse=4` |
| US | same, `warehouse=32` |
| Container Number (UK / German) | `suppliers.order_items` → `containers.name` / `final_containers.name`, restricted to `orders.status_arrived = true` |
| Shopify Price | `listings.shopify_listings.price` WHERE `site='UK'` |

Warehouse ids resolved from `inventory.warehouse` (Evidence 03). Location sentinel `'-'` and
empty strings normalised to NULL → rendered `Unavailable`.

## Missing-field register (rendered as `Unavailable`, never invented)

| Field | SKUs affected | Why unavailable in LEDSone MCP |
|---|---|---|
| UK Last Container — Received Warehouse | 332 / 332 | No goods-receipt warehouse column on `containers`, `final_containers`, `orders` or `order_items`. `main_container` holds a region ('UK'/'DE'/'GERMAN'), not a warehouse — and is inconsistently coded |
| UK Last Container — Received Date | 332 / 332 | `orders.status_arrived` is a bare boolean; no receipt date column exists. `confirmed_date` / `finished_date` / `expected_completion_date` are production dates; `updated_at` is a row-edit stamp (all bulk-set 2026-07-27/28) |
| German Last Container — Received Warehouse | 332 / 332 | as above |
| German Last Container — Received Date | 332 / 332 | as above |
| UK History | 332 / 332 | No stock-history/movement/adjustment table; `physical_product_stock` has no timestamp column |
| German History | 332 / 332 | as above |
| Kronen Location | 332 / 332 | `product_shelf_location` NULL for every Ceiling Rose SKU at warehouse 10 |
| Unit 4 Location | 163 / 332 | NULL or `'-'` sentinel |
| Schmutter Location | 151 / 332 | NULL |
| Unit 3 Location | 51 / 332 | NULL or `'-'` sentinel |
| UK Container Number | 278 / 332 | 250 SKUs have no arrived container; 28 have several arrived containers with no receipt date to order them |
| German Container Number | 316 / 332 | 309 none; 7 ambiguous |
| Shopify Price | 274 / 332 | 244 have conflicting UK channel prices with no primary-channel rule; 30 have no UK listing |
| US Stock | 1 / 332 | No `physical_product_stock` row at warehouse 32 |

## Container rule applied (Step 6 compliance)

Container Number is populated **only** where a SKU has exactly **one** container on an order
with `status_arrived = true`. In that case it is the last received container by logical
necessity, requiring no ordering assumption. Where several arrived containers exist, the field
is `Unavailable` — LEDSone MCP has no receipt date to order them, and picking the newest PO
would be a guess. Unshipped POs were excluded entirely (`status_arrived = true` required).

| Region | Shown (unambiguous) | Ambiguous → Unavailable | No arrived container |
|---|---|---|---|
| UK | 54 | 28 | 250 |
| German | 16 | 7 | 309 |

## Price rule applied (Step 5 compliance)

Shown only where all UK Shopify channels agree on one price (58 SKUs). Where they disagree
(244 SKUs) the field is `Unavailable`, with the observed range in the hover title so no
information is lost and nothing is asserted. 30 SKUs have no UK listing.

## Image validation (Step 8 compliance)

Images resolve through the `inventory.product_images.product_id → inventory.products.id`
foreign key — not by name matching — so cross-SKU substitution is structurally impossible.
332/332 SKUs have exactly one image row; 0 have none; 0 have multiple. All 332 image URLs are
distinct (`.../product_images/<product_id>.jpg`, e.g. CRSF100BM → id 344 → `344.jpg`).
