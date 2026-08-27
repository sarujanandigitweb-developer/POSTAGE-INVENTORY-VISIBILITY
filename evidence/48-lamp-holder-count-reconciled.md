# Evidence 48 — Lamp Holder: 226 vs 413/417 reconciled

**Date:** 2026-08-27 · Read-only. Not committed, not pushed.

## The answer

**226 is not a filter on `inv_products`. It is the Google Sheet's population.** That is why
no combination of `inventory_bool`, `isdeleted` or channel filters could reproduce it —
the two numbers come from different sources entirely.

| Figure | What it is |
|---:|---|
| **417** | `LH%` single SKUs in `inventory.products` (excludes `+` bundles and `…PK` packs) |
| **413** | the same, restricted to active/non-deleted — the four-row difference is deletion flags |
| **226** | the `LampHolder_SOT ` **Google Sheet tab**: 247 rows − 15 corrupt − 6 excluded |

The 226 breaks down exactly as evidence/30 recorded: 247 rows on the tab, minus 15 rows
whose SKU is corrupt (13 carrying an unknown `-IDE` suffix, 2 joined to a name fragment),
minus 6 more — `PHXSH1PBRWH`, which belongs to Pendant Lamp Holder and is already carried
there, and 5 packs whose only description is `Combo Default Title.` with no stock anywhere.

## Why the sheet was used at all

`configurator.components_sot_skus` has **zero** rows under any `lampholder` tab — confirmed
again today. Lamp Holder is one of the sections with no in-database source of truth, so its
population came from the sheet. Evidence/30 shipped it at **RED** for exactly this reason,
with twelve outstanding owner decisions.

## What the gap actually costs

Every one of the dashboard's 226 exists in the database — there are no phantom rows. The
gap is one-directional:

```
417  LH single SKUs in the database
226  on the dashboard          (all 226 verified present in the database)
191  in the database, on NO section of the dashboard
```

Of those **191**:

| | |
|---:|---|
| **158** | are **live** — not end-of-line |
| **133** | have stock right now |
| **43,550** | **units sitting on shelves the team cannot see** |
| 155 | say "holder" in their own description |

## Is the LH prefix safe to use as the population?

Measured across all 417: **380 (91.1%) have "holder" in the description.** The other 37 are
holder *parts* — `LHPLFTE14BM` "E14 Full teeth black Lid", `LHPLBM` "Plain aluminum lamp
head", `LH2HTE27YB` "lamp spare Part". They are the same product family, not contamination
from another category.

This is unlike the other categories, where prefix membership was 73–95% contaminated. For
`LH`, **the prefix is clean and the sheet is the stale artefact.**

## Recommendation

Repopulate Lamp Holder from the `LH` prefix, as Lamp Spares, Lighting, Cosmetics, Clothes,
Home Appliances and Refurbished already are. That takes the section **226 → 417** and makes
43,550 units visible.

Two things to decide first, because they change what the team sees:

1. **The 37 holder parts.** Keep them in Lamp Holder, or move them to Lamp Spares? They are
   lids, teeth and lamp heads rather than holders.
2. **Types.** The sheet declares no subtype column, so Lamp Holder currently has no type
   dropdown at all. With 417 SKUs a type breakdown becomes worth having — but it would have
   to be derived from the SKU, and nothing in the source declares one.

**Not applied.** This replaces a locked section's entire population, and evidence/30 left
the source question open with the owner.
