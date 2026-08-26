# Evidence 36 — Lamp Spares section (7th category)

**Date:** 2026-08-25 · `dashboard/inventory-dashboard.html`, `validation/test_lampshade.js`.
Not committed, not pushed.

## Source

All data from LEDSone MCP, the **same nine tables** as the other six sections:

`inventory.products` · `inventory.product_images` · `inventory.physical_product_stock` ·
`inventory.end_of_line_products` · `listings.shopify_listings` · `suppliers.order_items` ·
`suppliers.orders` · `suppliers.final_containers` · `suppliers.containers`

## How the population differs from the other six

The six existing sections take their population from a **validated SOT tab** in
`configurator.components_sot_skus`. **Lamp Spares has no such tab** — verified, no
tab matching `spare|part|access|chain|cable` exists. The 29 SKU prefixes supplied by
the source owner therefore **are** the business rule for this section.

That is a deliberate exception, and it was validated before use:

| Check | Result |
|---|---|
| Clean single products | **1,420** |
| SKUs matching **two** sub-types | **0** — the prefixes are unambiguous |
| SKUs colliding with the six existing categories | **0** |
| Bundles (`+`) / packs (`…PK`) / combos | excluded |
| Description coverage | 1,420 / 1,420 |
| Image coverage | 1,409 / 1,420 |

Where a SKU matches both a short and a long prefix (`12` and `12IP`, both
Transformers) the **longest prefix wins**.

## The 29 sub-types

| Sub-type | Prefix | Count |
|---|---|---:|
| Pipe Light accessories | PC | 258 |
| Transformers | 12, 12IP, 24IP, 5IP, CC, CH | 205 |
| Cables | CL | 162 |
| Spare parts | SP | 92 |
| Switch | SW | 90 |
| Plate With accessories | CB | 71 |
| Screw | RW | 69 |
| Connector | CO | 62 |
| Socket | SO | 58 |
| Cord Grip | CG | 39 |
| Neon flex | NF | 38 |
| Tapes | ST | 34 |
| Waterproof Junction Box | WJ | 34 |
| Tile spare parts | TS | 33 |
| Hook | HK | 27 |
| Chain | CN | 26 |
| Injection Module | IM | 22 |
| Shade Ring | SCRN | 18 |
| Cable Tie | CEN | 17 |
| LED Stripe Light Accessories | LC | 17 |
| Sand Paper | SDP | 16 |
| Threaded Rod | RD | 12 |
| Spring Clip | BC | 6 |
| Splitter Cables | SLW | 5 |
| Holder Ring | HR | 4 |
| Reducer Plate | RPM4 | 2 |
| COB Module | CM | 1 |
| Lock Nuts | NT5 | 1 |
| Washer | WR | 1 |
| **Total** | | **1,420** |

`Handles (HL)` was in the first list and removed from the second — it is **not**
included. `24` matched no products; every other prefix did.

## Payload compression — and why it is lossless

79% of stock values (7,873 of 9,931 rows) are zero. Zeros are omitted from the
embedded payload and restored at load, halving the section's size.

This is only safe because **1,411 of 1,420 SKUs have a row in all seven
warehouses**. The nine that do not are all missing only `us`:

`CBFF140`, `PCBM20DSBM`, `PCBSF2MSN`, `PCMT20MX-PUVII`, `PCSN295BM`, `PCSN295CH`,
`PCSN295FG`, `PCSN295SN`, `PCSN295WH`

Those nine keep `us` undefined, so they render **Unavailable**, not `0` — the
distinction the whole dashboard depends on is preserved. Asserted directly.

## Classifier boundary

`classifySKU` covers the six SOT categories via 2-char rules and a derived 4-char
index. **Lamp Spares is excluded from that index** — its prefixes are 2 to 4
characters with 29 sub-types of its own, and deriving 4-char rules from it inflated
the index from 181 to 467 and broke two synthetic tests. It is routed by registry
key instead. The classifier still holds **exactly 181 derived rules**, unchanged.

## Regression — 495 assertions, 0 failures

| Section | Rows | |
|---|---:|---|
| Ceiling Rose | 332 | **LOCK INTACT** |
| Pendant Lamp Holder | 398 | **LOCK INTACT** |
| Lampshade | 451 | **LOCK INTACT** |
| Wall Arm | 180 | **LOCK INTACT** |
| Lamp Holder | 226 | **LOCK INTACT** |
| LED Bulbs | 218 | **LOCK INTACT** |
| **Lamp Spares** | **1,420** | new |
| **Total** | **3,225** | |

Search, sub-type filters, warehouse/stock filters, pagination, CSV (25 columns,
1,420 data rows) and dark/light all verified on the new section. `node --check`: PASS.
Still a single self-contained file.

## Note for the source owner

**Socket (SO): 57 of its 58 products are end-of-line**, and 10 have no image. Nearly
the whole sub-type is discontinued — worth confirming it should appear at all.
