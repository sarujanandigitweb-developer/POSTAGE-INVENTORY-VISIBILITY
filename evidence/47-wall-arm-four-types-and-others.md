# Evidence 47 — Wall Arm reduced to four types, and an Others bucket for every section

**Date:** 2026-08-27 · Not committed, not pushed.

## Request

> reduce the type 11 to 4, give the correct 4 type · also add the others section
> · Lampshade — if a type I have not mentioned appears (LSOO…) it must go to Others
> · Wall Arm — if a WS… of another type appears it goes to Other

## Wall Arm: 11 sheet subtypes → 4 families + Others

The `Wall_Arm_SOT` tab declares eleven `Product_Subtype` values, **seven of which hold one
or two SKUs**. Collapsed by what the product actually is:

| Family | From | SKUs |
|---|---|---:|
| **Wall Arm / Lamp Holder Arm** | `WA` fixed arm · `GN` gooseneck | **122** |
| **Adjustable Wall Arm** | `AW` adjustable · `PL` plug-in · `AC` adjustable sconce | **47** |
| **Double Wall / Ceiling Arm** | `DA` double arm · `DS` double spotlight arm | **2** |
| **Wooden Wall Bracket** | `WB` | **5** |
| **Others** | `CR` sconce w/ ceiling rose · `BN` + `BI` bulkhead lights | **4** |
| | | **180** |

The three in Others are the honest cases: a bulkhead light and a sconce-with-ceiling-rose
are not wall arms, so they belong in a bucket rather than being forced into one of the four.

**Nothing is destroyed.** Every row keeps the sheet's own subtype in `ws`, exposed as a
**Subtype** dropdown — all eleven values still selectable, and asserted to still be eleven.
The collapse happens in memory, so `WA_DATA` on disk and its lock are untouched.

## Others, for every section that declares types

A section's declared types are a snapshot of what the source contained when it was read.
When the extraction next returns a type nobody listed — an `LSOO…` lampshade, a `WS…` arm
of a new kind — it previously showed a raw code that no dropdown could filter on. Now it
lands in **Others** under its own section, and the row keeps what the source called it in
`osub`, so *Others* never means *we lost the name*.

Added to all ten sections that declare types. Ceiling Rose already had one under a
different label (`CR · Other`) and is now normalised to **Others** like the rest.

**Pendant Lamp Holder and Lamp Holder are deliberately left alone.** Their sheets declare
no subtype column at all, so there is nothing for a SKU to fall outside of; a lone
"Others" there would be meaningless.

Every bucket except Wall Arm's is **empty today**, which is the point — it is a landing
place for tomorrow's data, not a dumping ground for today's.

## Validation

`node validation/test_lampshade.js` → **ALL PASS — 1,165 passed, 0 failed**.

Eighteen existing assertions were updated rather than deleted: the per-section type counts
and dropdown lengths each gain one for Others, Wall Arm's main family moves 118 → 122, its
CSV gains the Subtype column (26 → 27), Ceiling Rose's bucket is renamed, and the derived
4-character rule for `WSSS` now resolves to `Adjustable Wall Arm`. Two new assertions check
that Wall Arm's five families still total exactly 180 and that all eleven sheet subtypes
survive on the rows.

All fourteen dataset locks verified byte-identical.

## Note on suite runtime

The suite now takes **~10 minutes**. It is not hung — the final full-catalogue render is
simply slow at this size. The lock file records the expected runtime beside the expected
count so a slow run is not misread as a broken one.
