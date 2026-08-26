# Evidence 38 — Lighting section (8th category)

**Date:** 2026-08-25 · Not committed, not pushed. Source: LEDSone MCP, same nine
tables as every other section.

## Result

| Type | Prefix | Products |
|---|---|---:|
| Plugin Pendant | `PS` | 176 |
| Pipe Lighting | `PL` | 124 |
| Wall Lamp | `WL` (excluding `WLGL`, `WLCA`) | 103 |
| Wall Scones | `WS` (excluding Wall Arm's 180 and `WSCW`) | 93 |
| Table Lamp | `TP` | 66 |
| **Total** | | **562** |

Dashboard total: **4,187 SKUs across 8 sections**.
Description 562/562 · image 560/562 · 0 bundles, packs or combos.

## The `WS` conflict — the important one

`WS` is both the requested prefix for **Wall Scones** and the prefix of every SKU in
the existing **Wall Arm** section.

`WS` matched 277 products. Of those:

| | Count | Decision |
|---|---:|---|
| Already the entire **Wall Arm** section (from `Wall_Arm_SOT`) | **180** | **stay in Wall Arm** |
| `WSCW` — already Lampshade / Chandeliers | 4 | stay in Lampshade |
| Not claimed by any section | **93** | **become Wall Scones** |

Wall Arm still has exactly 180 rows and lost nothing. No SKU appears twice.

**This needs a business decision.** Wall Arm's own sub-types already include
*"Wall Sconce / Wall Arm with Ceilingrose"*, *"Bulkhead Light / Nautical Wall
Sconce"* and *"Plug-in Wall Sconce / Adjustable Wall Arm"* — so **Wall Arm already
contains wall sconces**. Wall Scones (93) and Wall Arm (180) may be the same
business category under two names, exactly like Glass / Glass Shades.

I did **not** merge them, because that would move 180 SOT-backed rows out of a
validated section on my own judgement. Two options, whenever you want:

1. **Keep as is** — Wall Arm 180 (SOT tab) and Lighting → Wall Scones 93 (prefix).
2. **Merge** — fold Wall Arm's 180 into Lighting as Wall Scones, giving 273 and
   removing the Wall Arm section.

## Other exclusions applied

- `WLGL` and `WLCA` → already Lampshade (Glass Shades, Chandeliers) — excluded from
  Wall Lamp, exactly as instructed ("NOT WLGL").
- `WSCW` → already Lampshade (Chandeliers) — excluded from Wall Scones.

Verified: **0 of the 562 exist in any other section**, checked against all 3,625
previously embedded SKUs.

## Classifier boundary

Lighting rows carry `x: 1`, so they are skipped by the derived 4-char index, exactly
like Lamp Spares and the Lampshade prefix-added rows. The classifier still holds
exactly **181 rules**.

## Regression — 564 assertions, 0 failures

All seven previously embedded datasets **LOCK INTACT**, including Wall Arm's 180.
Filters (Plugin Pendant → 176, Table Lamp → 66), search, CSV (25 columns),
pagination and dark/light all verified. `node --check`: PASS. Single self-contained file.
