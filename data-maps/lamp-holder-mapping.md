# Lamp Holder — Sheet ↔ database mapping

**Sheet:** `1jS5ZrhEXdMcBtnpB6aYJvjcmZCUjNdd16WRhz0xnkYM`
**Tab:** `LampHolder_SOT ` — **note the trailing space** — sheetId 16, **gid 1423341591**
**Not to be confused with** the hidden `LampHolder_SOT` (no trailing space, sheetId 9, 998 rows, different layout).

## Column mapping

| Dashboard field | Source | Note |
|---|---|---|
| SKU | Sheet `SKU_ID` (col 0) → `inventory.products.sku` | uppercase match |
| Description | `inventory.products.description` | not the sheet's `Product Name` |
| Image | `inventory.product_images.image_url` | Contabo CDN; the sheet's `IMG_LINK` points at a different host and is unreliable (see evidence/28 §2) |
| **Category / family** | **none available** | the tab has no `Product_Type` / `Product_Subtype`, and there is no LH SOT in the database |
| Mount Type (attribute only) | Sheet `Mount Type` (col 10) | 13 values, 15 blank, 6 compound — usable only as a raw attribute, never as a category |
| Unit 3 / Unit 4 / Unit 18 stock | `inventory.physical_product_stock.quantity` @ warehouse 1 / 8 / 6 | |
| Kronen / Schmutter stock | same table @ warehouse 10 / 7 | |
| Canada / US stock | same table @ warehouse 4 / 32 | |
| Shelf locations | `physical_product_stock.product_shelf_location` | `-` and `''` treated as no location |
| Container | `suppliers.order_items` → `final_containers` / `containers`, arrived orders only | |
| Shopify price | `listings.shopify_listings` where `site='UK'` | |

## Population

| Step | Count |
|---|---|
| Sheet data rows | 247 |
| Distinct SKUs (duplicates: 0) | 247 |
| − corrupt / unresolvable | −15 |
| − pack / combo | −5 |
| − already in the LOCKED Pendant Lamp Holder section (`PHXSH1PBRWH`) | −1 |
| **Clean population** | **226** |

Per-row decisions: `lamp-holder-sheet-skus.csv`.
SKU list: `lamp-holder-population-226.txt`.
Raw tab export: `lampholder_SOT-raw-export.csv`.

## Status

**AMBER — not implemented.** The population is established; the category logic is
not. See `validation/lamp-holder-discovery.md`.
