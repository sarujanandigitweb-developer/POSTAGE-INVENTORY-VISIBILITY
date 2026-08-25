# **Daily Requirement Document**

## **1. Metadata Block**

| Field | Value |
| ----- | ----- |
| daily_requirement_submitted_date | 2026-08-24 |
| expected_deadline_date | 2026-08-24 |
| end_user | Postage & Warehouse Team |
| expected_roi | Warehouse staff will stop opening the Google Sheet, the LEDSone admin and the marketplace listings separately to answer "where is this SKU and how many are left" — one search will replace three lookups. Estimated 4–5 hours saved per week across the team. |
| developer | sarujanan |
| project | Postage Inventory Visibility |
| project_code | INV-PIV |
| phase | Phase-02 — Multi-Category Rollout |
| requirement_id | REQ-02 |
| deliverable_id | REQ-02-D01 |
| blos_keys | Population source = Google Sheet SOT tab SKU list (never the SKU prefix); Warehouse unit map 1=UK Unit 3, 8=UK Unit 4, 6=UK Unit 18, 10=Kronen, 7=Schmutter, 4=Canada, 32=US; Container counted only when `orders.status_arrived` is true; Shopify price read only where `site='UK'`; Shelf-location sentinels `''` and `'-'` mean no location |
| domain | Inventory — Postage & Warehouse — LEDSone MCP |
| planned benefits | - All six catalogue categories visible in one dashboard instead of one<br>- Stock for seven warehouses readable per SKU without opening the admin<br>- Shelf location shown next to stock so pickers stop guessing<br>- CSV export per category for offline pick lists<br>- Every unavailable value shown as "Unavailable" rather than a misleading zero |

**Task assigned by:** Varmen

---

# **2. Today Requirement Block**

Today I am going to extend the Postage Inventory Visibility dashboard from **one live
category (Ceiling Rose, completed on 2026-08-20)** to **all six catalogue categories**,
using the Google Sheet SOT tabs to define each population and the LEDSone MCP database to
supply the inventory facts.

Ceiling Rose is finished and locked. I am not going to change it.

---

## **2.1 Today Requirement — Lampshade section**

### **Task Name:**
Implement the Lampshade section

### **Business Purpose:**
Give the warehouse team stock and location visibility for lampshades, which are currently
invisible in the dashboard.

### **Source Information**

Source System: LEDSone MCP (PostgreSQL) + Google Sheet SOT

Tables:
```
configurator.components_sot_skus        (source_tab = 'lampshade')
configurator.components_sot_attributes
configurator.components_sot_attribute_values
inventory.products
inventory.physical_product_stock
inventory.product_images
listings.shopify_listings
suppliers.order_items / orders / containers / final_containers
```

Sheet tab: `lampshade_SOT` (gid 816515986)

### **Filter Conditions**
```
Population : the SKUs on the lampshade_SOT tab, resolved 1:1 in inventory.products
Excluded   : bundles (SKU contains '+'), packs (SKU ends PK), unresolved SKUs
NOT USED   : sku LIKE 'LS%'  -- prefix matching is unsafe, it pulls in chandeliers and light sets
```

### **Required Data Output**

| Field | Purpose |
| ----- | ----- |
| SKU | Product identification |
| Description | Product identification for pickers |
| Image | Visual confirmation at the shelf |
| Material family | Level-1 category filter |
| Shade shape | Level-2 filter |
| Fitting type | Attribute filter |
| Stock × 7 warehouses | The core question the team asks |
| Shelf location | Where to walk to |
| Last container | Incoming stock context |
| Shopify UK price | Value context |

---

## **2.2 Today Requirement — Pendant Lamp Holder section**

### **Task Name:**
Discover and implement the Pendant Lamp Holder section

### **Business Purpose:**
Add pendant lamp holder stock visibility, and establish whether the category has an
authoritative classification before anything is built.

### **Source Information**
Sheet tab: `Pendant Lamp Holder_SOT` (gid 2041874053)
Tables: as above, plus `inventory.end_of_line_products`

### **Filter Conditions**
```
Population : the distinct SKUs on the Pendant Lamp Holder_SOT tab
NOT USED   : sku LIKE 'PH%'
```

### **Required Data Output**
Same field set as 2.1, with **Mount Type** carried as an attribute.

I am going to check the sheet's duplicate rows before reporting any category counts, because
the row count and the distinct SKU count are not the same number and I must not present a row
count as a product count.

---

## **2.3 Today Requirement — Lamp Holder discovery**

### **Task Name:**
Discover the Lamp Holder mapping

### **Business Purpose:**
Establish whether the Lamp Holder tab can safely drive a dashboard section.

### **Source Information**
Sheet tab: `LampHolder_SOT ` (gid 1423341591)

### **Filter Conditions**
```
Population : the SKUs on that tab only
NOT USED   : sku LIKE 'LH%'
```

I am going to stop and raise a source-correction report instead of building, if the tab
cannot supply a safe category mapping.

---

## **2.4 Today Requirement — Wall Arm and LED Bulbs sections**

### **Task Name:**
Implement the Wall Arm and LED Bulbs sections

### **Business Purpose:**
Close the last two GAP chips on the dashboard.

### **Source Information**
Sheet tabs: `Wall_Arm_SOT` (gid 1720361941), `LED BULBS_SOT` (gid 297008248)

### **Filter Conditions**
```
Wall Arm  : the distinct SKUs on the Wall_Arm_SOT tab
LED Bulbs : the distinct SKUs on the LED BULBS_SOT tab
NOT USED  : sku LIKE 'WS%' / sku LIKE 'LD%'
```

---

## **2.5 Today Requirement — Publish**

### **Task Name:**
Publish the updated dashboard to the Varman AIOS hub

### **Business Purpose:**
Make the dashboard reachable by the whole team, not just on my machine.

### **Filter Conditions**
```
member_name : sarujanan
page_slug   : the existing page slug, so the hub page id does not change
```

---

# **Business Logic Block**

## **Population selection**

```
Rule:
IF the SKU appears on the category's Google Sheet SOT tab
   AND it resolves 1:1 in inventory.products
THEN it is IN the dashboard population
ELSE it is EXCLUDED and the reason is recorded in evidence
```

The SKU prefix is **not** the category. I am going to measure the contamination of the
prefix for every category and record the number, so the decision is evidenced rather than
asserted.

## **Category assignment**

```
Rule:
IF the sheet declares a Level-1 category column or banner rows
THEN use it verbatim as the category filter
ELSE leave the category dropdown empty and expose the nearest attribute as an ATTRIBUTE filter
```

I am not going to invent a category. If a sheet does not declare one, the section will say so.

## **Unavailable values**

```
Rule:
IF the database has no value for a field
THEN display "Unavailable"
ELSE display the stored value verbatim
```

Negative stock quantities will be shown exactly as stored. Nothing will be clamped,
netted off, or substituted.

---

# **Data Enrichment Block**

Purpose: attach the operational context the warehouse team needs after the population is fixed.

Source: LEDSone MCP

Tables:
```
inventory.product_images
inventory.physical_product_stock
inventory.end_of_line_products
suppliers.order_items / orders / containers / final_containers
listings.shopify_listings
```

Required Data:

| Field | Reason |
| ----- | ----- |
| Product image | Visual confirmation at the shelf |
| Stock per warehouse (7) | The core operational question |
| Shelf location per warehouse | Where to walk to |
| Last arrived container (UK / DE) | Incoming stock context |
| Shopify UK price | Value context for write-offs and returns |
| End-of-line flag | Warns that a SKU is being run down |

---

# **Acceptance / Validation I will run today**

| Check | Target |
| ----- | ----- |
| Sheet row count vs distinct SKU count | Reported separately, never conflated |
| 1:1 SKU resolution against `inventory.products` | 100%, or every failure listed |
| Duplicate SKUs in the dashboard | 0 |
| Contamination of the SKU prefix | Measured and recorded per category |
| Image / description coverage | Reported per category |
| Ceiling Rose regression | SHA-256 of the embedded dataset must be byte-identical |
| Automated harness | Must pass with 0 failures before publishing |

---

# **Constraints**

- Read-only against LEDSone MCP. No production data, schema or workflow will be modified.
- Ceiling Rose must remain byte-identical.
- Single self-contained HTML file: no external JS, no external CSS, no fetch/XHR.
- Nothing will be committed or pushed to git.
