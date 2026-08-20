# Evidence 01 — LEDSone MCP Tools & Sources Inspected

Date: 2026-08-20
Mode: READ-ONLY discovery. No DDL, no DML, no schema/data/business-rule changes.
Scope: Ceiling Rose — `CRSF` (Side Fitting) and `CRFF` (Front Fit) only.

## MCP tools used

| Tool | Purpose |
|---|---|
| `mcp__claude_ai_Ledsone_postgres__search_objects` | Enumerate schemas / tables |
| `mcp__claude_ai_Ledsone_postgres__execute_sql` | Read-only SELECT queries against `information_schema`, `pg_catalog` and business tables |

## Database surface

19 schemas, 157 base tables, 2 views (both in `ebay_campaigns`, unrelated), **0 user-defined functions/procedures**.

Relevant schemas:

| Schema | Tables | Relevance |
|---|---|---|
| `inventory` | 9 | Primary — products, stock, warehouses, images |
| `configurator` | 3 | Ceiling-rose component "SOT" (Google-Sheet synced) |
| `suppliers` | 15 | Purchase orders + containers |
| `listings` | 25 | Shopify / Amazon / eBay listing prices |

## Objects inspected in detail

- `inventory.products` (id, title, sku, sku_original, description, eng_description, chinese_decription, instruction_link, inventory_bool, created_at, updated_at)
- `inventory.physical_product_stock` (inventory, warehouse, quantity, reserved_quantity, shelf_quantity, shelf_capacity, product_shelf_location, product_bulk_location)
- `inventory.warehouse` (warehouse, warehouse_name, warehouse_location)
- `inventory.local_inventory_current_stock_location_wise` (inventory_id, warehouse_location, stock)
- `inventory.product_images` (id, product_id, image_path, image_url, image_ordering, ...)
- `inventory.product_mapping`, `inventory.product_pk`, `inventory.end_of_line_products`
- `configurator.components_sot_skus` (id, sku, source_tab, sheet_gid, sheet_row, synced_at, ...)
- `configurator.components_sot_attributes` (id, key, label, sort_order, ...)
- `configurator.components_sot_attribute_values` (id, sot_sku_id, attribute_id, value, ...)
- `suppliers.orders`, `suppliers.order_items`, `suppliers.containers`, `suppliers.final_containers`
- `listings.shopify_listings`

## Objects searched for and NOT found

A catalog-wide scan of `information_schema.columns` for `%container%`, `%receiv%`, `%arriv%`,
`%log%`, `%history%`, `%movement%`, `%adjust%` returned **no** stock-history, stock-movement,
goods-received, or container-arrival object in `inventory`, `suppliers`, or `order_management`.
The only match, `suppliers.order_item_logs`, is a purchase-order-line change log
(order_id, order_item_id, change_key, old_value, new_value, change_by, created_at) —
it does not record warehouse stock movements.
