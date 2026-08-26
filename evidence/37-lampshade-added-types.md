# Evidence 37 — Lampshade: five added types

**Date:** 2026-08-25 · Not committed, not pushed.

## What was added

Five product types the `lampshade_SOT` tab does not cover, added to the **Lampshade**
section by SKU prefix at the source owner's direction. Data from LEDSone MCP, same
nine tables as every other section.

| Type | Prefix(es) | Products |
|---|---|---:|
| Wire Cages | `WC` (excluding `WCCY`) | 253 |
| Chandeliers | `LSCA`, `LS2C`, `LS2O`, `WLCA`, `WSCW` | 100 |
| Crystal Shades | `WCCY` | 20 |
| Baton Lighting | `BL` | 17 |
| Glass Shade | `WLGL`, `LSPG` | 10 |
| **Total added** | | **400** |

Lampshade section is now **451 (SOT) + 400 (prefix) = 851**.
Dashboard total: **3,625 SKUs across 7 sections**.

## Two conflicts found and resolved

**1. `WCCY` vs `WC`.** `WCCY` is Crystal Shades, `WC` is Wire Cages — and every
`WCCY` SKU also matches `WC`. Resolved by **longest prefix wins**: the 20 `WCCY`
products go to Crystal Shades and are excluded from the 253 Wire Cages. Asserted
both ways.

**2. `LSPG250AR` was already a Lampshade.** The `LSPG` prefix (Glass Shade) matched
11 products, but one — `LSPG250AR`, *"Glass Pattern Cone Lampshade"* — is already
one of the 451 SOT rows. It was **excluded**, because one SKU must never appear
twice in the same section. Glass Shade is therefore 10, not 11.

## `WSCW` is a Chandelier, not a Wall Arm

Four SKUs start with `WS`, which is the Wall Arm main-category prefix:
`WSCW350GH`, `WSCWBF`, `WSCWFG`, `WSCWGG` — descriptions *"Wall light french gold
crystal light"*, *"Crystal wall light"*.

Checked against the shipped Wall Arm dataset: **none of the four is in the Wall Arm
180**, so classifying them as Chandeliers creates no duplicate and removes nothing
from Wall Arm. Asserted per SKU.

## Duplication check

**0 of the 400 exist anywhere else** in the dashboard — verified against all 3,225
previously embedded SKUs across the seven sections, not just against Lampshade.

## Why the lock still passes

The 400 rows are held in their own array, `LS_EXTRA`, and concatenated into the
Lampshade section at load:

```js
LS: { data: LS_DATA.concat(LS_EXTRA), … }
```

`LS_DATA` is therefore **byte-identical** and its SHA-256 lock
`7b8aeae0…c346a` still passes. The five SOT material counts are unchanged:
Metal 352 · Glass 72 · Fabric 13 · Crystal Glass 9 · Natural Rope 5.

## Classifier boundary

The prefix-added family codes (`XWC`, `XCH`, `XCY`, `XBL`, `XGL`) are **not**
4-character SKU prefixes, so they must not feed the derived 4-char index. Including
them inflated it from **181 rules to 273**. They are now excluded via `PREFIX_ADDED`,
and the classifier holds exactly **181 rules** again, with Lampshade's 50 unchanged.

## Closes an old gap

`evidence/18` recorded that **WC / cage products had no authoritative classification
anywhere** — every synced SOT tab returned zero WC SKUs. That gap is now closed:
253 Wire Cages and 20 Crystal Shades are classified and visible.

It also resolves the `LSCA` finding from `evidence/34`: I reported 82 `LSCA` products
described as *"100cm French gold crystal light"* as evidence that prefix membership
was unsafe for Lampshade. They were indeed not lampshades — they are **Chandeliers**,
and they now have their own type rather than being silently absorbed.

## Regression — 527 assertions, 0 failures

All seven previously embedded datasets **LOCK INTACT**. Filters verified:
Wire Cages → 253, Chandeliers → 100, Metal still → 352. Search, CSV (27 columns),
pagination (851 rows → 35 pages at 25/page) all pass. `node --check`: PASS.
Still a single self-contained file.

---

# Revision 2 — duplicate type names merged

Two pairs described the same product type under two names, one from the SOT tab and
one from the prefix-added set:

| Was | Source | Count | | Now |
|---|---|---:|---|---|
| Glass | `lampshade_SOT` material | 72 | → | **Glass Shades — 82** |
| Glass Shade | prefix `WLGL`, `LSPG` | 10 | → | |
| Crystal Glass | `lampshade_SOT` material | 9 | → | **Crystal Shades — 29** |
| Crystal Shades | prefix `WCCY` | 20 | → | |

Lampshade now has **8 types, not 10**:

| Type | Count |
|---|---:|
| Metal | 352 |
| Wire Cages | 253 |
| Chandeliers | 100 |
| **Glass Shades** | **82** |
| **Crystal Shades** | **29** |
| Baton Lighting | 17 |
| Fabric | 13 |
| Natural Rope | 5 |
| **Total** | **851** |

## How the merge was done

- The prefix-added rows changed family code: `XGL` → `GL`, `XCY` → `CG`, so each type
  has **one code and one name**. Filtering by Glass Shades now returns all 82.
- The two SOT display names are rewritten **in memory at load** via `LS_TYPE_RENAME`.
  The embedded `LS_DATA` text is untouched, so its SHA-256 lock
  `7b8aeae0…c346a` **still passes**. The underlying SOT counts are unchanged:
  GL 72, CG 9.
- Prefix-added rows now carry `x: 1` instead of relying on an `X…` code prefix, and
  the classifier index skips rows with that flag. It still holds exactly **181 rules**.

## Checked for other duplicates

Every type label across all seven sections was compared. **No label appears in more
than one section**, and within Lampshade only these two pairs were genuine duplicates.
Other similar-looking labels — *Cables* / *Splitter Cables*, *Spare parts* / *Tile
spare parts*, *COB Module* / *Injection Module*, *Holder Ring* / *Shade Ring* — are
distinct products and were left alone.

**536 assertions, 0 failures. All seven embedded datasets LOCK INTACT.**
