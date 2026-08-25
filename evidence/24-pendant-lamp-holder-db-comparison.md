# Evidence 24 — Pendant Lamp Holder: Database Discovery & Bidirectional Comparison (Phases 5–10)

Date: 2026-08-24 · Mode: READ-ONLY · **Dashboard NOT modified**

## Phase 10 first — is there an authoritative SOT for this population? **NO**

```sql
SELECT source_tab, count(*), count(*) FILTER (WHERE upper(sku) LIKE 'PH%'), max(sheet_gid)
FROM configurator.components_sot_skus GROUP BY 1;
```

| source_tab | SKUs | PH-prefixed | sheet_gid |
|---|---:|---:|---|
| bulb | 218 | **0** | 297008248 |
| ceilingrose | 332 | **0** | 134991562 |
| lampshade | 451 | **0** | 816515986 |

**No `pendant` tab, and not one `PH%` SKU in any SOT tab.** The supplied gid `2041874053`
is not among the three synced gids. A sweep of all SOT attribute *values* for
`%pendant lamp holder%` / `%lampholder%` returns only *references from the lampshade tab*
(`rel_1_target = 'All M40-thread Pendant Lampholders (Pendant_Lamp_Holder_SOT)'`), never a
classification of a PH SKU.

**Consequence:** unlike Ceiling Rose and Lampshade, the authoritative product list for
Pendant Lamp Holder exists **only in the Google Sheet**, not in LEDSone MCP.

## Phase 5 — the `PH%` population in `inventory.products`

| Measure | Count |
|---|---:|
| Raw `PH%` rows | **2,631** |
| — bundle SKUs containing `+` | 2,081 |
| **Single (non-`+`) SKUs** | **550** |
| — combo-titled | 68 |
| — pack (`[0-9]PK$`) | 67 |
| — inactive (`inventory_bool = false`) | 68 |
| — end-of-line | 60 |
| Rule-clean active singles | 422 |

Fields available on a PH product: `id`, `sku`, `title`, `inventory_bool` (plus stock, images,
containers, prices). **There is no product_type / subtype / fitting / material / style field
for PH SKUs anywhere in the database** — those exist only as SOT attributes, and PH has no SOT
row. This is the central finding for Phase 8.

## Phase 6 — Sheet → Database

```sql
SELECT count(*) FROM sheet WHERE sku NOT IN (SELECT upper(sku) FROM inventory.products);  -- 0
```

| SKU | Sheet Type | Database Found? | Reason | Status |
|---|---|---|---|---|
| *(none)* | — | — | — | **All 398 distinct sheet SKUs resolve 1:1 in `inventory.products`** |

Additional facts about the 398:

| Check | Result |
|---|---:|
| Resolve in `inventory.products` | **398 / 398** |
| Inactive (`inventory_bool = false`) | **0** |
| Bundles (`+`) in the sheet | **0** |
| Packs (`*PK`) in the sheet | **0** |
| **End-of-line** | **32** |

The sheet lists 32 SKUs that `inventory.end_of_line_products` marks EOL — the sheet keeps them,
the DB flags them. Include/exclude is an owner decision, not a data error.

## Phase 7 — Database → Sheet

**550 single PH SKUs − 398 in the sheet = 152 not in the sheet.** Classified:

| Classification | n | Verdict |
|---|---:|---|
| Pack **and** combo-titled (`*PK`, `Combo…`) | **67** | Correctly excluded — multipacks |
| **Active single, NOT in sheet** | **56** | **Needs review — see below** |
| End-of-line | 28 | Correctly excluded |
| Combo-titled (not pack) | 1 | Correctly excluded (`PHAH2RBMBMEPK`) |
| **Total** | **152** | |

### The 56 active singles — inspected by title, they are NOT one group

**(a) Products that look like genuine Pendant Lamp Holders missing from the sheet — 35**

`PH3C16030BM`, `PHAH1TSNBM`, `PHAH2RCOBR`, `PHBK1PBRGB`, `PHCH1AGRGB`, `PHCH1GDRYB`,
`PHCH1PWRSBU`, `PHCN1BRRCO`, `PHCW1PWRWO`, `PHHRE2HETX1HE`, `PHHRE2HETX2HE`, `PHHS1PWRCB`,
`PHHT1PBRGY`, `PHHT1PWRGR`, `PHHW1PBRBM`, `PHIFT1PBRBM`, `PHIFT1PBRYB`, `PHIFT1PCRCH`,
`PHLSFH1PBRBC`, `PHLSFH1PBRBM`, `PHNW1RBB`, `PHRN1002BM`, `PHRN1PCRPI`, `PHRN2PCRBT`,
`PHSF2AGTGB`, `PHSH15E27BYB`, `PHSH1BMTCO`, `PHSH1E27BMYB`, `PHSQ2PBRYB`, `PHTC1PGTGD`,
`PHTT1PBRBB`, `PHWPHL1BM`, `PHWPHL35BM`, `PHWPLH1BM`, `PHWPLH35BM`

Titles such as *"E27 Copper Colour Aluminum Holder Fabric 3 Core Round Brown Colour 2m Cable
Pendant Set"*, *"1m 3 core black PVC Cable black iron holder pendant"*, *"1M black cable +
black water pipe lamp holder"*. These read as pendant lamp holders. Whether the sheet is
incomplete or these are deliberately excluded is **an owner question — not decided here**.

**(b) Products that are a DIFFERENT product type sharing the `PH` prefix — 21**

| Sub-group | n | SKUs | Evidence from title |
|---|---:|---|---|
| Ceiling rose + hanging chain | 8 | `PHCT150YBCYB`, `PHCT1BMRBM`, `PHCT1WHRWH`, `PHCT80BMCBM`, `PHCT80CHCCH`, `PHCT80GBCGB`, `PHCT80WHCWH`, `PHCT80YBCYB` | *"Ceiling Rose with Hanging Chain — Black"* |
| **Lampshades** | 4 | `PHLSDG220BG`, `PHLSDG220WI`, `PHLSGP350WI`, `PHLSLG190WI` | *"Gold Inner dome style Lampshade"*, *"Modern Ceiling Pendant Lampshades Metal"* |
| Chandelier / 5-head cluster | 4 | `PHWPPBRBL`, `PHWPPBRGR`, `PHWPPBRRE`, `PHWPPBRYE` | *"5 Glass Wine Bottle Pendant Ceiling Chandelier Hanging Light Cluster"* |
| Ceiling-rose combo kits | 3 | `PHCD1120PBRBW`, `PHHT1F120RBM`, `PHSG2PBRCCO` | *"120*25 Ceiling rose with round ceiling bracket … + chain + holder"* |
| Wooden ceiling lamps | 2 | `PHWC1PBRWO`, `PHWR1PBRWO` | *"wooden ceiling lamp"* |

This is the same failure mode proven for WC (`evidence/18`) and LS (`evidence/21`): the prefix
gathers complete fittings and other categories alongside the component.

## Phase 8 — Category / type comparison

| SKU | Sheet Category | Database Category | Match | Difference |
|---|---|---|---|---|
| all 398 | `Product_Type = Lighting Accessory`, `Product_Subtype = Pendant Lamp Holder` | **none exists** | **N/A** | The database holds no product-type, subtype, fitting, material or style field for any PH SKU — no SOT row exists |

**A category comparison is not possible in either direction.** For Ceiling Rose and Lampshade
the comparison was meaningful because the SOT carried `material_primary` / `fitting_type` /
`shade_shape`. For Pendant Lamp Holder the database side is empty, so there are:

* **0 confirmed matches** (nothing to match against),
* **0 detected mismatches** (a mismatch cannot be detected),
* and this is a **gap, not a clean result**.
