# Evidence 08 — Existing Repository Asset Discovery

Repository: `/home/led-247/POSTAGE-INVENTORY-VISIBILITY`
Remote: `https://github.com/sarujanandigitweb-developer/POSTAGE-INVENTORY-VISIBILITY.git`
Branch: `main` — **no commits yet** (`fatal: your current branch 'main' does not have any commits yet`)

## Full contents at discovery time

```
./capability/.gitkeep
./closure/.gitkeep
./dashboard/.gitkeep
./data-maps/.gitkeep
./documentation/.gitkeep
./evidence/.gitkeep
./handover/.gitkeep
./prompts/.gitkeep
./sql/.gitkeep
./validation/.gitkeep
./workflows/.gitkeep
```

Non-`.gitkeep` files at start of discovery: **0**.

## Result

| Asset sought | Found |
|---|---|
| Inventory Visibility dashboard files | NONE |
| Existing Ceiling Rose data logic | NONE |
| Existing CRSF / CRFF mappings | NONE |
| Existing SKU mappings | NONE |
| Existing warehouse / stock queries | NONE |
| Existing SQL files | NONE |
| Existing LEDSone MCP queries / connectors | NONE |
| Existing data maps | NONE |
| Existing validation files | NONE |
| Existing evidence files | NONE |
| Existing documentation | NONE |
| Existing prompts / capability files | NONE |

The folder scaffold was created in this session immediately before discovery; it contains no logic.

## Assets discovered OUTSIDE the repository

| Asset | Location | Note |
|---|---|---|
| Live dashboard | `https://varman-aios-hub-varmens.vercel.app/view/hub_pages/Postage_Inventory_dashboard` | Rendering "147 Inventory Records" for Ceiling Rose with GAP badges on container/received fields. Its data-access code is **not** in this repository, so its stock logic could not be inspected and could not be compared to LEDSone MCP. |
| `configurator.components_sot_skus` | LEDSone MCP, schema `configurator` | Named a "SOT" (source of truth), synced from a Google Sheet (`sheet_gid`, `sheet_row`, `synced_at`), carrying its own `total_stock` per SKU |

**No source of truth was created by this discovery.** Only read-only queries were run;
all output is descriptive evidence.
