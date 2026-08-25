# LEDSone PostgreSQL — Data Structure Map

Source document: Google Sheet **`ledsone_postgresql_data_structure`**
`https://docs.google.com/spreadsheets/d/1KbyvKhLr0fGc6N0IV-OhSaVl9YLAXdbw4zA4cUdhI-k`
Owner: sarujanandigitweb@gmail.com · Created 2026-08-20 05:28 · Modified 2026-08-20 05:29
Read via the authenticated Google Drive connector on 2026-08-20. Validated against live LEDSone MCP the same day.

## 1. What this document is

A **data-dictionary catalogue of the LEDSone PostgreSQL database itself** — not inventory data.
It tells you which schema/table holds which business entity. It contains no stock figures, no SKUs
and no Ceiling Rose rows, so it is a *navigation and verification* artefact, never a data source.

Header block declared by the sheet:

| Field | Value |
|---|---|
| Database | `ledsone` (PostgreSQL 18.4) |
| Host | `169.58.91.229` |
| Tables | 127 |
| Total rows | 71,166,442 |
| Schemas | 16 |
| Access | read-only role `dbhub_readonly` — `SELECT` on every table, nothing else |

Caveats the sheet states about itself:

- **Row counts** are exact at export time, not estimates — *"They move constantly, syncs run every minute."*
- **Not all history** — each table mirrors a MySQL source; some apply deliberate filters, so a table may
  hold fewer rows than its source by design (e.g. orders limited to whitelisted sales channels).
- **Amazon returns** — `customer_service.amazon_returns` is the only table pulled from the Amazon API
  directly rather than mirrored from MySQL.

## 2. Sheet table structure

The sheet is one flat grid of five columns, preceded by a summary block and a notes block.

| # | Column | Meaning (as defined in the sheet) |
|---|---|---|
| 1 | `Subject` | The business area. "Start here if you know what you want but not where it lives." |
| 2 | `Description` | What the table holds, plus any caveat worth knowing before you trust it. |
| 3 | `Business Entities` | The columns you would most likely filter or join on. **Not the full column list.** |
| 4 | `Table Location` | `schema.table` — use directly in SQL. |
| 5 | `Rows` | Exact row count at export time. |

Parsed result: **163 grid rows**, of which **127 are real table entries** (the rest are the summary
block, the column-definition block and the notes block).

Important limitation for mapping work: column 3 is explicitly a *sample* of joinable columns, and
many entries end in `(+N more)`. **It cannot be used as a schema definition** — the authoritative
column list is `information_schema.columns` in MCP.

## 3. Subject summary block

| Subject | Tables | Rows | Schema |
|---|---:|---:|---|
| Sales / Orders | 15 | 6,535,012 | `order_management` |
| Customers | 3 | 3,327,554 | `customers` |
| Product Listings | 16 | 4,313,414 | `listings` |
| **Inventory & Stock** | **7** | **293,372** | **`inventory`** |
| Finance / Fees & Payouts | 5 | 2,355,199 | `accounting` |
| Advertising – Amazon | 5 | 12,319,550 | `amazon_campaigns` |
| Advertising – eBay | 6 | 7,028,998 | `ebay_campaigns` |
| Advertising – Google | 21 | 15,276,174 | `google_ads` |
| Traffic & Conversion | 3 | 8,033,870 | `business_reports` |
| Website Analytics | 2 | 291,676 | `google_analytics` |
| SEO / Search Console | 7 | 10,659,194 | `google_search_console` |
| Customer Service | 8 | 527,137 | `customer_service` |
| Amazon FBA | 1 | 14,037 | `amazon_fba` |
| **Suppliers & Purchasing** | **15** | **14,668** | **`suppliers`** |
| HR / Staff | 10 | 159,121 | `employee_management` |
| Staff Portfolios | 3 | 17,466 | `staff` |
| **TOTAL** | **127** | **71,166,442** | 16 schemas |

Arithmetic verified: the 16 subject subtotals sum exactly to 127 tables and 71,166,442 rows, and
the `inventory` subtotal (293,372) is exactly the sum of its 7 listed tables. The sheet is
internally consistent.

## 4. Full catalogue, by subject

### Sales / Orders  (15 tables)

| Table | Sheet rows | In live MCP | Key columns |
|---|---:|:-:|---|
| `order_management.order_combo` | 1,969,858 | YES | id, order_item_info_id, sku, qty, color, image |
| `order_management.order_item_info` | 1,171,118 | YES | id, order_id, order_ref_id, line_item_id, item_transaction_id, item_id, product_id, variant_id,… |
| `order_management.shipment` | 1,119,738 | YES | id, order_id, carrier_service_id, status, ref_id, shipment_created_at, cancelled_at, cost, trac… |
| `order_management.orders` | 1,077,719 | YES | id, order_id, status, order_date, sub_source_id, total, sub_total, shipping_cost, warehouse_id,… |
| `order_management.order_info` | 1,077,717 | YES | id, order_id, currency, payment_status, ebay_payment_status, ebay_cancel_status, ioss_no, amoun… |
| `order_management.amazon_fba_order_items` | 38,769 | YES | id, order_id, line_item_id, item_sku, item_price, item_asin, item_title, item_quantity, item_ta… |
| `order_management.amazon_fba_order_info` | 37,206 | YES | id, order_id, currency, payment_status, amount_paid, paid_time, shipped_time, payment_method, p… |
| `order_management.amazon_fba_orders` | 37,206 | YES | id, order_id, status, order_date, buyer_email, sub_source_id, total, sub_total, shipping_cost, … |
| `order_management.vendor_sales` | 4,493 | YES | id, asin, start_time, end_time, ordered_units, ordered_revenue, currency_code  (+2 more) |
| `order_management.international_postage_rates` | 591 | YES | id, country, service_name, surcharge_type, price, currency, effective_date, source_created_at, … |
| `order_management.carrier_service` | 382 | YES | id, name, amaz_carrier_name, selro_carrier_name, charge, charge_with_tax, charge_currency, carr… |
| `order_management.sub_source` | 118 | YES | id, source_id, name, map_name, orders_fetch, logo, company, address, vat_no, max_qty, max_qty_m… |
| `order_management.local_postage_rates` | 44 | YES | id, service_name, price, currency, effective_date, source_created_at, source_updated_at, import… |
| `order_management.market_place` | 36 | YES | id, name, amz_marketplace_id, abbreviation, ebay_url, amazon_url, amz_region  (+2 more) |
| `order_management.source` | 17 | YES | id, source_name |

### Customers  (3 tables)

| Table | Sheet rows | In live MCP | Key columns |
|---|---:|:-:|---|
| `customers.shipping_address` | 1,109,192 | YES | id, order_id, address_name, postcode, country_id, phone, company, address_line_1, address_line_… |
| `customers.billing_address` | 1,109,190 | YES | id, order_id, address_name, postcode, country_id, phone, company, address_line_1, address_line_… |
| `customers.customer_info` | 1,109,172 | YES | id, order_id, first_name, last_name, email, ebay_buyer_id, email_invoice  (+2 more) |

### Product Listings  (16 tables)

| Table | Sheet rows | In live MCP | Key columns |
|---|---:|:-:|---|
| `listings.ebay_listing_images` | 1,515,714 | YES | id, product_id, image_url, view_order  (+2 more) |
| `listings.amazon_listing_images` | 853,568 | YES | id, product_id, image_url, view_order  (+2 more) |
| `listings.amazon_listing_bullet_points` | 424,241 | YES | id, product_id, points, view_order |
| `listings.ebay_listings` | 301,105 | YES | id, item_id, parent_sku, sku, price, currency, title, quantity, category_id, shop_cate_id, prod… |
| `listings.ebay_listings_parent_child_mapping` | 289,501 | YES | id, parent_id, child_id, child_order |
| `listings.shopify_collection_products` | 193,528 | YES | id, shopify_collec_id, collection_id, product_id, position, sort_value, is_deleted  (+2 more) |
| `listings.amazon_listing_search_engine_keywords` | 187,808 | YES | id, product_id, keyword, view_order |
| `listings.shopify_listing_tag` | 140,648 | YES | id, product_id, product_type, sub_source, tag, is_deleted |
| `listings.amazon_listings` | 131,511 | YES | id, asin, parent_sku, sku, mapped_sku, price, currency, title, quantity, category_id, product_t… |
| `listings.shopify_listing_images` | 130,789 | YES | id, product_id, image_id, alt_text, image_url, view_order |
| `listings.shopify_listings` | 69,637 | YES | id, item_id, parent_sku, sku, mapped_sku, price, compare_price, currency, title, quantity, prod… |
| `listings.shopify_listings_parent_child_mapping` | 55,329 | YES | id, parent_id, child_id, child_order |
| `listings.shopify_listing_meta` | 14,645 | YES | id, product_id, title_tag, description_tag |
| `listings.bandq_listings` | 4,136 | YES | id, offer_id, parent_sku, sku, mapped_sku, price, currency, title, quantity, category_id, produ… |
| `listings.shopify_collections` | 1,232 | YES | id, collection_id, sub_source, title, type, published_at, admin_graphql_api_id, handle, body_ht… |
| `listings.market_place_id_mapping` | 22 | YES | id, site_id, currency, site, code, postal, amz_market_place, market_place_code, location, is_eb… |

### Inventory & Stock  (7 tables)

| Table | Sheet rows | In live MCP | Key columns |
|---|---:|:-:|---|
| `inventory.local_inventory_current_stock_location_wise` | 175,583 | YES | inventory_id, warehouse_location, stock |
| `inventory.physical_product_stock` | 72,283 | YES | quantity, inventory, warehouse, reserved_quantity, shelf_quantity, shelf_capacity, product_shel… |
| `inventory.products` | 43,936 | YES | id, title, sku, sku_original, description, eng_description, chinese_decription, instruction_lin… |
| `inventory.end_of_line_products` | 1,016 | YES | id, sku, end_of_line_status  (+3 more) |
| `inventory.product_mapping` | 516 | YES | id, inventory_id, warehouse_id, alternative_inventory_id, stock_id, alternative_stock_id, mappe… |
| `inventory.product_pk` | 28 | YES | id, pack_char, pack_qty |
| `inventory.warehouse` | 10 | YES | warehouse_name, warehouse, warehouse_location |

### Finance / Fees & Payouts  (5 tables)

| Table | Sheet rows | In live MCP | Key columns |
|---|---:|:-:|---|
| `accounting.ebay_order_expenses` | 945,446 | YES | id, transaction_date, transaction_id, order_id, item_id, payout_id, case_id, sub_source, transa… |
| `accounting.amazon_transactions_breakdown` | 741,122 | YES | id, transaction_id, breakdown_type, amount, currency, breakdown_path  (+1 more) |
| `accounting.amazon_order_expenses` | 474,575 | YES | id, date, order_id, seller_sku, item_id, charge_type, amount, currency, sub_source, market_plac… |
| `accounting.amazon_transactions` | 131,632 | YES | id, transaction_id, order_id, transaction_type, transaction_status, date, total, currency, sub_… |
| `accounting.shopify_transactions` | 62,424 | YES | id, type, payout_id, payout_status, currency, amount, sub_source, source_type, order_id, shopif… |

### Advertising - Amazon  (5 tables)

| Table | Sheet rows | In live MCP | Key columns |
|---|---:|:-:|---|
| `amazon_campaigns.performance_data` | 11,271,093 | YES | id, date, ad_id, listing_sku, asin, campaign_id, ad_group_id, impressions, clicks, spend, ctr, … |
| `amazon_campaigns.search_term_performance_data` | 736,629 | YES | id, date, campaign_id, ad_group_id, match_type, impressions, clicks, spend, search_term, keywor… |
| `amazon_campaigns.ads` | 292,020 | YES | id, ad_id, ad_group_id, listing_sku, asin, serving_status, ad_name, landing_page_type, state, l… |
| `amazon_campaigns.ad_groups` | 14,636 | YES | id, ad_group_id, campaign_id, ad_group_name, creative_type, state, default_bid, bid_optimizatio… |
| `amazon_campaigns.campaigns` | 5,172 | YES | id, campaign_id, campaign_type, sub_source, campaign_name, start_date, end_date, budget_type, t… |

### Advertising - eBay  (6 tables)

| Table | Sheet rows | In live MCP | Key columns |
|---|---:|:-:|---|
| `ebay_campaigns.performance_data` | 6,821,567 | YES | id, ad_id, ebay_listing_id, campaign_id, date, ad_group_id, impressions, clicks, ctr, attribute… |
| `ebay_campaigns.campaign_report_data` | 112,485 | YES | id, campaign_id, date, impressions, clicks, ctr, sold, sales_amount_listing, ad_fees_listing, s… |
| `ebay_campaigns.ads` | 92,773 | YES | id, ad_id, ebay_listing_id, listing_id, ad_group_id, campaign_id, seller_store_id, state, bid_p… |
| `ebay_campaigns.ad_groups` | 1,167 | YES | id, ad_group_id, campaign_id, seller_store_id, ad_group_name, state, default_bid  (+2 more) |
| `ebay_campaigns.campaigns` | 994 | YES | id, campaign_id, campaign_name, seller_store_id, sub_source, marketplace_id, start_date, end_da… |
| `ebay_campaigns.seller_stores` | 12 | YES | id, seller_store_name, ebay_seller_store_id, sub_source, ebay_seller_store_username, ppc_sync  … |

### Advertising - Google  (21 tables)

| Table | Sheet rows | In live MCP | Key columns |
|---|---:|:-:|---|
| `google_ads.product_performance` | 10,319,889 | YES | id, date, campaign_id, ad_group_id, product_item_id, parent_id, variation_id, merchant_id, impr… |
| `google_ads.campaign_search_term_data` | 3,046,990 | YES | id, date, campaign_id, ad_group_id, match_type, impressions, clicks, cost, insight_id, search_t… |
| `google_ads.pmax_campaign_search_term_data` | 855,097 | YES | id, date, campaign_id, match_type, impressions, clicks, cost, search_term, conversions, convers… |
| `google_ads.merchant_products` | 516,744 | YES | id, merchant_id, product_id, title, country, item_group_id, price, currency, sale_price, source… |
| `google_ads.asset_performance` | 221,020 | YES | id, date, asset_id, asset_group_id, campaign_id, clicks, impressions, cost, conversions, conver… |
| `google_ads.asset_group_product_group_performance` | 181,502 | YES | id, date, account_id, campaign_id, asset_group_id, asset_group_resource_name, listing_group_fil… |
| `google_ads.campaign_performance` | 52,748 | YES | id, date, campaign_id, clicks, impressions, cost, cost_micros, conversions, conversion_value, c… |
| `google_ads.campaign_search_term_insights` | 26,933 | YES | id, insight_id, campaign_id, category_label |
| `google_ads.asset_group_assets` | 19,110 | YES | id, account_id, asset_id, asset_type, campaign_id, asset_group_id, policy_status, asset_value, … |
| `google_ads.asset_group_listing_group_filters` | 12,862 | YES | id, account_id, campaign_id, asset_group_id, listing_group_filter_id, resource_name, asset_grou… |
| `google_ads.asset_group_signals` | 8,251 | YES | id, account_id, campaign_id, asset_group_id, signal_type, audience_id, approval_status, audienc… |
| `google_ads.keywords` | 6,003 | YES | id, account_id, campaign_id, ad_group_id, criterion_id, resource_name, status, match_type, keyw… |
| `google_ads.google_ads_change_events` | 3,521 | YES | id, customer_id, sub_source, campaign_id, campaign_name, user_email, client_type, change_resour… |
| `google_ads.ad_group_products` | 1,664 | YES | id, campaign_id, ad_group_id, product_item_id, parent_id, variant_id, price, status, feed_label… |
| `google_ads.ad_groups` | 1,137 | YES | id, ad_group_id, campaign_id, ad_group_name, ad_group_status, cpc_bid_amount, cpm_bid_amount, t… |
| `google_ads.asset_groups` | 834 | YES | id, asset_group_id, campaign_id, account_id, name, status, ad_strength |
| `google_ads.campaigns` | 803 | YES | id, campaign_id, account_id, merchant_id, campaign_name, start_date, campaign_primary_status, c… |
| `google_ads.keyword_performance` | 578 | YES | id, date, account_id, campaign_id, ad_group_id, criterion_id, impressions, clicks, cost, cost_m… |
| `google_ads.ads` | 460 | YES | id, account_id, campaign_id, ad_group_id, ad_id, ad_status, ad_type, approval_status, final_url… |
| `google_ads.merchants` | 20 | YES | id, merchant_id, customer_id, customer_name, is_active |
| `google_ads.accounts` | 8 | YES | id, account_id, account_name, sub_source_id, currency_code, market_place |

### Traffic & Conversion  (3 tables)

| Table | Sheet rows | In live MCP | Key columns |
|---|---:|:-:|---|
| `business_reports.ebay_traffic_data` | 5,655,047 | YES | id, ebay_listing_id, item_id, impressions, date, sub_source, meta_data, ebay_views, external_vi… |
| `business_reports.amz_catalog_performance_data` | 2,253,042 | YES | id, start_date, end_date, asin, sub_source, impression_median_price, clicked_median_price, cart… |
| `business_reports.amz_traffic_by_asin` | 125,781 | **NO** | id, date, sku, sub_source, parent_asin, child_asin, market_place, browser_sessions, browser_ses… |

### Website Analytics  (2 tables)

| Table | Sheet rows | In live MCP | Key columns |
|---|---:|:-:|---|
| `google_analytics.organic_landing_page_revenue` | 277,414 | YES | id, property_id, report_name, run_date, date_start, date_end, landing_page, landing_page_hash, … |
| `google_analytics.traffic_source_revenue` | 14,262 | YES | id, report_name, property_id, run_date, date_start, date_end, session_source_medium, session_so… |

### SEO / Search Console  (7 tables)

| Table | Sheet rows | In live MCP | Key columns |
|---|---:|:-:|---|
| `google_search_console.query_page` | 5,793,017 | YES | id, search_type, sub_source, date, clicks, impressions, site_url, query, page, row_hash, ctr, p… |
| `google_search_console.query` | 2,967,188 | YES | id, search_type, sub_source, date, clicks, impressions, site_url, query, row_hash, ctr, positio… |
| `google_search_console.page` | 1,696,349 | YES | id, search_type, sub_source, date, clicks, impressions, site_url, page, row_hash, ctr, position |
| `google_search_console.country` | 192,077 | YES | id, search_type, sub_source, date, country, clicks, impressions, site_url, row_hash, ctr, posit… |
| `google_search_console.device` | 6,223 | YES | id, search_type, sub_source, date, clicks, impressions, site_url, device, row_hash, ctr, positi… |
| `google_search_console.overview` | 4,340 | YES | id, search_type, sub_source, date, clicks, impressions, site_url, row_hash, ctr, position |
| `google_search_console.appearance` | — | YES | id, search_type, sub_source, date, clicks, impressions, site_url, search_appearance, row_hash, … |

### Customer Service  (8 tables)

| Table | Sheet rows | In live MCP | Key columns |
|---|---:|:-:|---|
| `customer_service.ebay_orders_customer_feedbacks` | 313,408 | YES | id, date, type, item_id, feedback_id, transaction_id, order_line_item_id, price, sub_source, bu… |
| `customer_service.ebay_message_headers` | 99,616 | YES | id, sender_id, receiver_id, sub_source, item_id, message_type, message_id, ext_message_id, read… |
| `customer_service.ebay_messages` | 70,885 | YES | id, message_id, message |
| `customer_service.ebay_returns` | 31,699 | YES | id, return_id, order_id, type, reason, response_type, status, item_id, transaction_id, creation… |
| `customer_service.amazon_messages` | 7,068 | YES | id, message_id, sub_source, from_name, date, order_id, asin, message_type, from_msg, subject, b… |
| `customer_service.ebay_order_cancellations` | 4,177 | YES | id, cancel_id, order_id, requestor_type, reason, status, partial_order_type, seller_response_du… |
| `customer_service.amazon_returns` | 220 | YES | id, order_id, item_id, asin, sku, request_date, reason, type, status, qty, amz_rma_id, merchant… |
| `customer_service.ebay_account_ratings` | 64 | YES | id, rating_type, sub_source, week_rating, week_rating_count, thirty_day_rating, thirty_day_rati… |

### Amazon FBA  (1 tables)

| Table | Sheet rows | In live MCP | Key columns |
|---|---:|:-:|---|
| `amazon_fba.excess_inventory_data` | 14,037 | YES | id, sub_source, snapshot_date, sku, asin, product_name, currency, your_price, sales_price, reco… |

### Suppliers & Purchasing  (15 tables)

| Table | Sheet rows | In live MCP | Key columns |
|---|---:|:-:|---|
| `suppliers.order_item_logs` | 7,271 | YES | id, order_id, order_item_id, change_key, old_value, new_value, change_by  (+1 more) |
| `suppliers.order_items` | 4,029 | YES | id, order_id, sku, assigned_container_id, final_container_id, english_description, chinese_desc… |
| `suppliers.images` | 1,621 | YES | id, product_id, image_url |
| `suppliers.order_items_child` | 494 | YES | id, parent_item_id, pcs, ctn_pcs, ctns, length, width, height, weight, cbm, total_cbm  (+2 more… |
| `suppliers.incidents` | 466 | YES | id, sku, image_name, file_name, resolved_at, description, image_path, file_path  (+2 more) |
| `suppliers.supplier_documents` | 276 | YES | id, supplier_id, document_type, marketplace, file_name, mime_type, file_url, temp_url, file_siz… |
| `suppliers.orders` | 267 | YES | id, supplier_id, order_id, order_date, confirmed_date, finished_date, container_id, final_conta… |
| `suppliers.child_item_products` | 77 | YES | id, parent_item_id, child_item_id, sku, pcs, ctn_pcs, ctns, length, width, height, weight, cbm,… |
| `suppliers.suppliers` | 47 | YES | id, name, password_set_at, name_zh, code, gpsr_link, instruction_manual_link, password_changed … |
| `suppliers.hs_code_map` | 30 | YES | id, hs_code_id, supplier_id |
| `suppliers.invoices` | 28 | YES | id, final_container_id, hs_code_name, unit_price, invoice_date, ship_by_date, units, fob, creat… |
| `suppliers.containers` | 25 | YES | id, name, status, main_container, current_cbm  (+2 more) |
| `suppliers.final_containers` | 16 | YES | id, name, type, status, main_container, current_cbm  (+2 more) |
| `suppliers.hs_code` | 13 | YES | id, name, hs_code |
| `suppliers.invoice_shipping_cost` | 8 | YES | id, final_container_id, shipping_cost |

### HR / Staff  (10 tables)

| Table | Sheet rows | In live MCP | Key columns |
|---|---:|:-:|---|
| `employee_management.notification` | 89,873 | YES | id, type, department_id, receiver, message, sender, component, reference, is_read  (+2 more) |
| `employee_management.logs` | 47,987 | YES | id, component_name, component_id, field_name, delete_status, action, old_value, new_value, is_u… |
| `employee_management.staff_leave` | 15,495 | YES | id, staff_id, leave_start_date, leave_end_date, leave_type, cover_date, status, type, leave_sta… |
| `employee_management.approval` | 3,000 | YES | id, sender_id, reference_id, delete_status, receiver_id, component, message, is_approved, actio… |
| `employee_management.attendance` | 1,977 | YES | id, staff_name, date, shift_name, staff_code, on_work1, off_work1, on_work2, off_work2, on_work… |
| `employee_management.department_employee` | 387 | YES | id, emp_id, dep_id, delete_status |
| `employee_management.staff` | 311 | YES | id, name, email, phone, joined_date, confirmed_date, delete_status, team_id, staff_type, staff_… |
| `employee_management.team` | 36 | YES | id, name, dep_id, delete_status |
| `employee_management.department` | 33 | YES | id, name, delete_status, is_approved, max_staff_leave |
| `employee_management.staff_shift` | 22 | YES | id, staff_code, shift_start, shift_end |

### Staff Portfolios  (3 tables)

| Table | Sheet rows | In live MCP | Key columns |
|---|---:|:-:|---|
| `staff.ph_category_products` | 17,200 | YES | id, ph_category_id, ref_id, source_id, assign_date, is_updated |
| `staff.users` | 189 | YES | id, first_name, last_name, email, status, gender, username, branch, role  (+2 more) |
| `staff.ph_categories` | 77 | YES | id, category_name, user_id, assign_date  (+1 more) |
## 5. Dashboard column mapping — catalogue ↔ live MCP

How each Ceiling Rose dashboard column maps to the catalogue, and whether the catalogue's own
description supports how the dashboard uses it.

| Dashboard column | Table (catalogue) | Documented in sheet? | Catalogue description supports our use? |
|---|---|:-:|---|
| SKU | `inventory.products` | YES | YES — "Master table of all inventory products… includes both component products and combo products" |
| Type (Side Fitting / Front Fit) | `configurator.components_sot_skus` | **NO** | Schema absent from the catalogue — see §6 |
| Image | `inventory.product_images` | **NO** | Table absent from the catalogue — see §6 |
| Unit 3 / Unit 4 / Unit 18 Stock | `inventory.physical_product_stock` | YES | **YES, explicitly** — "Each row is one product at one warehouse… actual quantity, and reserved quantity" |
| Unit 3 / Unit 4 Location | `inventory.physical_product_stock` | YES | YES — "where the product physically sits (shelf location, bulk location)" |
| Kronen / Schmutter Stock + Location | `inventory.physical_product_stock` | YES | YES — same row grain |
| CA / US Stock | `inventory.physical_product_stock` | YES | YES — same row grain |
| Warehouse names | `inventory.warehouse` | YES | YES — "details of all our warehouses and their locations" |
| Shopify Price | `listings.shopify_listings` | YES | Partially — "Active Shopify listings across all Ledsone stores"; **"all stores" is exactly why one SKU carries several prices**, and the catalogue documents no primary-store rule |
| UK / German Container Number | `suppliers.order_items` + `suppliers.containers` / `final_containers` | YES | YES for identity — "container assignment"; **NO receipt semantics** — see below |
| Received Warehouse (UK + DE) | — | **no source** | Catalogue lists no goods-receipt table or column |
| Received Date (UK + DE) | — | **no source** | `suppliers.orders` documents only *statuses*: "confirmed, finished production, shipped, arrived" |
| History (UK + German) | — | **no source** | No stock-history/movement/adjustment table exists in the catalogue |

### The stock-source question, settled by the catalogue

The two stock tables are described by the maintainer as serving different purposes, which is
exactly the distinction this project established independently by query:

| Table | Catalogue description | Role |
|---|---|---|
| `inventory.physical_product_stock` | *"Physical stock levels and warehouse locations for component products. Each row is one product at one warehouse — contains where the product physically sits (shelf location, bulk location), shelf capacity, actual quantity, and reserved quantity. **Combo/derived product stock is not in this table** — combo stock is calculated from component stock via `GetInvStock`."* | **Physical on-hand, per warehouse unit** |
| `inventory.local_inventory_current_stock_location_wise` | *"Contains live stock data for each product in the `inventory.products` table, broken down by warehouse location. **Usage: this location-wise stock data is pushed/updated to each platform's product listings.**"* | **Sellable figure published to sales channels** |

Two independent confirmations of decisions already taken and documented in `evidence/10`:

1. **Warehouse-grain stock must come from `physical_product_stock`.** The maintainer states its
   grain as "one product at one warehouse" — the grain the dashboard needs.
2. **The country rollup is a derived, platform-facing figure, not a rival on-hand count.** The
   maintainer states its *usage* is to be pushed to platform listings, which matches the measured
   result that it reproduces as `GREATEST(Σquantity − Σreserved, 0)` for 1,323 of 1,327 SKU-country
   pairs (99.7%). Publishing a sellable number to Amazon/eBay/Shopify is precisely what
   "on-hand minus reserved, floored at zero" is for.

A wording caution: the catalogue says the rollup is broken down by "warehouse location", which
reads as warehouse-level. **It is not.** Its 175,583 rows ÷ 43,936 products = 4 rows per product,
and the distinct values are `UK`, `Germany`, `Canada`, `US` — country grain, not unit grain. It
cannot express Unit 3 vs Unit 4 vs Unit 18, so it could not drive this dashboard regardless.

### Bundle exclusion, confirmed

The catalogue's note that *"combo/derived product stock is not in this table — combo stock is
calculated from component stock via `GetInvStock`"* independently supports excluding bundle SKUs:
`physical_product_stock` is a **component-level** table, and the 332 Ceiling Rose SKUs on the
dashboard are components. The `+`-joined bundle SKUs filtered out during discovery are combos,
whose stock is derived at runtime and is not authoritative in this table.

## 6. Where the catalogue and the live database disagree

Compared the 127 catalogued tables against all 159 live objects (157 base tables + 2 views) in MCP.

| Measure | Sheet | Live MCP |
|---|---:|---:|
| Schemas | 16 | 18 with objects (19 incl. empty `reports`) |
| Tables | 127 | 157 base tables + 2 views |
| Catalogued tables confirmed present in MCP | — | **126 of 127 (99.2%)** |

### Catalogued but not found in MCP — 1 table

| Sheet entry | Finding |
|---|---|
| `business_reports.amz_traffic_by_asin` | **Does not exist.** The live table is `business_reports.amz_sales_and_traffic_by_asin`, which the sheet lists separately. Looks like a stale or renamed entry. |

Two further entries flagged by a base-table-only comparison turned out to be fine:
`ebay_campaigns.campaign_report_data` and `ebay_campaigns.performance_data` exist as **VIEWS**, not
base tables. They are present and queryable.

### In MCP but undocumented — 33 tables

Two whole schemas are missing from the catalogue:

| Schema | Tables | Why it matters here |
|---|---|---|
| **`configurator`** | `components_sot_skus` (550), `components_sot_attributes` (306), `components_sot_attribute_values` (99,130) | **This is the dashboard's product set and Type source.** Google-Sheet-synced "SOT" for components; `source_tab='ceilingrose'` gives the 332 Ceiling Rose SKUs and the `fitting_type` values Side Fitting / Front Fitting |
| **`public`** | `migrations`, `personal_access_tokens`, `product`, `websockets_statistics_entries` | Application plumbing, not business data — reasonable to omit |

Other undocumented tables, by schema: `inventory.product_images` (36,346 — **the dashboard's image
source**) and `inventory.product_images_bk_20260813` (a dated backup); `listings.*` B&Q tables (8)
plus `amazon_marketplaces`; `business_reports` (4); `customer_service` (5); `amazon_campaigns` (3);
`ebay_campaigns` (2).

The `inventory` subject header says "7 tables"; the live `inventory` schema has **9** — the two
extra being `product_images` and its backup.

### Row-count drift — expected, and the sheet warns of it

| Table | Sheet (export time) | Live 2026-08-20 | Drift |
|---|---:|---:|---:|
| `inventory.local_inventory_current_stock_location_wise` | 175,583 | 176,743 | +1,160 (+0.7%) |
| `inventory.physical_product_stock` | 72,283 | 75,419 | +3,136 (+4.3%) |
| `inventory.products` | 43,936 | 44,225 | +289 (+0.7%) |
| `inventory.end_of_line_products` | 1,016 | 1,035 | +19 (+1.9%) |
| `inventory.product_mapping` | 516 | 516 | 0 |
| `inventory.product_pk` | 28 | 28 | 0 |
| `inventory.warehouse` | 10 | 10 | 0 |

All drift is upward and small, consistent with the sheet's own note that *"syncs run every minute."*
Nothing here indicates a broken sync.

## 7. Verdict on the maintainer's claim

> *"All the data is in LEDSone MCP."*

**Substantially confirmed, with two documentation gaps — and one important qualification.**

| Claim | Verdict |
|---|---|
| Everything in the catalogue is reachable through LEDSone MCP | **CONFIRMED** — 126/127 present and queryable read-only; the single miss is a stale entry name, not missing data |
| LEDSone MCP holds *more* than the catalogue documents | **CONFIRMED** — 33 undocumented tables including the entire `configurator` schema and `inventory.product_images` |
| Therefore every field the dashboard needs is available | **NOT CONFIRMED** |

The qualification matters. The catalogue confirms MCP is the right and complete *system* of record,
but it does not create fields that are absent. Searching all 127 descriptions and column samples for
`history`, `movement`, `adjust`, `goods`, `receipt`, `received`, `arriv` returns **no stock-history
table and no goods-receipt table**. The only hits are `suppliers.orders` ("confirmed, finished
production, shipped, **arrived**" — statuses, no dates) and unrelated Google Ads / eBay-feedback
tables.

So the six fields the dashboard shows as `Unavailable` are confirmed absent by the maintainer's own
catalogue, not merely absent from the tables examined during discovery:

- UK Last Container — Received Warehouse
- UK Last Container — Received Date
- German Last Container — Received Warehouse
- German Last Container — Received Date
- UK History
- German History

`suppliers.containers` is documented as *"shipping containers used to consolidate purchase orders
before final loading"* with columns `id, name, status, main_container, current_cbm` — a
consolidation record, carrying no receiving warehouse and no receipt date. `suppliers.orders` carries
`order_date`, `confirmed_date`, `finished_date`, `expected_completion_date` — production dates, none
of which is a goods-receipt date.

**Net effect on the dashboard: no change required.** The catalogue independently corroborates the
source-of-truth ruling, the bundle exclusion and every `Unavailable` marking. The two documentation
gaps are gaps in the *sheet*, not in the data — worth reporting back so the catalogue can be
completed.

---

## 8. Tab-level structure (added 2026-08-20 after full workbook inspection)

The earlier read of this sheet flattened it into one grid. Downloading the workbook as XLSX shows
it has **three worksheets**, and a direct `gviz` CSV export binds **GID 208319972 to Tab 1**.

| Tab | Purpose | Grain | Rows | Relevant to Ceiling Rose? |
|---|---|---|---:|---|
| **Tab 1** — GID 208319972 | Table catalogue | one database table | 127 | Indirectly — points at objects only |
| Tab 2 | Subject summary rollup | one business subject | 17 | No |
| Tab 3 | Header / README — connection details, caveats | key–value | 17 | No |

A regex sweep of all 45,381 characters across all three tabs found **zero** occurrences of `CRSF`,
`CRFF`, "ceiling", "rose", "side fitting", "front fit", any warehouse name (Unit 3/4/18, Kronen,
Schmutter, Trossingen), any shelf-location pattern, any container number, any `£` price and any
image URL — and **zero SKU-shaped values in any first column**.

The sheet is therefore **`Mapping/reference only`**: it documents where data lives and contains
none of it. Full validation in `evidence/15-google-sheet-mapping-validation.md`.
