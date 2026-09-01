# Postage Inventory Visibility — Next.js

A **new, separate** dashboard. It does not touch, import from, or modify
`../dashboard/inventory-dashboard.html` or anything under `../sql/refresh`.

## Run

```bash
npm install
npm run dev      # http://localhost:3020
npm run build && npm start
node sql/smoke.mjs   # connectivity + table check, prints no credentials
```

## What this pass delivers

* The **current UI reproduced**, not redesigned. `app/dashboard.css` is the live
  page's stylesheet copied verbatim — 58.4 KB, 586 rules — including the density
  scale (`--fs`, `--py`, `--cpy`, `--thr`) that shrinks the page with the window,
  the three-row grouped table header, the sticky SKU column and the theme tokens.
* The **one requested change**: the tab strip has moved out of the header into a
  sidebar (`components/Sidebar.jsx`, `app/sidebar.css`). It reuses the original
  `.vtab` styling, so it still looks like the tabs it replaced. Everything else in
  the header — provenance pill, stock alerts, Export CSV, theme toggle — is in its
  original place.
* **Live data from LEDSone**, server-side only.

## Layout

A viewport-locked shell: the header stays put, the pager sits on the bottom edge
of the screen, and the only thing that scrolls is the rows between them.

This is a deliberate departure from the live page, which scrolls the whole
document so its chrome moves out of the way. That was the right answer there,
where the tab strip, the title and the filters all competed for the same vertical
space. Here the tabs are in the sidebar, so the header is short enough to keep on
screen. Below 560px of window height the shell scrolls instead, so a short window
clips nothing.

The header carries what the live one carried, minus the tab strip: the name of
the tab, when the data was read, the two stock alerts, Export CSV and the theme
toggle — on one row, because the flex break that split the live header existed
only to make room for the tabs.

## How the database is reached

```
browser ──fetch──▶ /api/inventory (route handler) ──▶ lib/db.js ──▶ lib/pg-core.js ──▶ PostgreSQL
```

* `lib/db.js` is marked `server-only`: importing it from a client component is a
  **build error**, not a silent leak.
* Credentials are read at run time from the gitignored `.env` at the repo root
  (`LEDSONE_*`), or from `process.env` if a deployment injects them. They are
  never written into a page, a log, or an error message — `redact()` scrubs the
  password out of any driver error before it propagates.
* Verified: no credential, host or `pg` driver code appears in `.next/static`.
* The pool is capped at 4 connections because `tech_user` has a connection limit.

SQL is ported from the working extract scripts in `../sql/refresh/extract/`
(`products.js`, `stock.js`, `price.js`) rather than rewritten, so the figures
agree with the live dashboard. Spot check — `CRFF100BM` returns 701 / 111 / 850 /
50 units, £5.99, shelf `1-F-03`, matching the live page exactly.

## Classification: how it actually works

The first version of this app derived section and type from the SKU prefix. That
was wrong, and it disagreed with the dashboard on six of the twelve sections.
`build.js` states the rule plainly:

> **an existing SKU keeps the classification it already has — the embedded arrays
> on disk are the authority for `f`, `t`, `x`, `mt`, `sh`, `ft` and `sr`.**

Section and type are **curated data**, not something derivable from PostgreSQL.
So `scripts/export-classification.cjs` exports that placement once into `data/`,
and the app joins live stock, price, description and image onto it — the same
shape `build.js` works in. Re-run the export whenever those arrays change.

The page also re-types three sections **in memory** after loading the arrays, so
the arrays keep their byte-identical hashes on disk. Anything reading the arrays
directly gets the PRE-transform shape and disagrees with what the dashboard
shows. All three are reproduced, in the page's own order:

| Transform | Effect |
|---|---|
| `HANDLES_MOVED` — 31 `ZHL` SKUs are lamp/cabinet hardware | Lamp Spares 1456 → **1487**, Home Appliances 715 → **684** |
| Wall Arm collapse — 11 sheet subtypes → 4 business families | `WAAR` 122 · `WAAD` 47 · `WADB` 2 · `WAWB` 5 · `WAOT` 4; the 11 survive as the `ws` Subtype attribute |
| Bulbs re-typing — the 218 SOT rows | become "LED Bulbs", banner series moves to the `sr` Series attribute; the 117 prefix-added (`x:1`) rows are left alone |

Verified against the live dashboard — all twelve sections match:

| | | | |
|---|---|---|---|
| Ceiling Rose 383 | Pendant Lamp Holder 482 | Lampshade 996 | Wall Arm 181 |
| Lamp Holder 417 | Bulbs 335 | Lamp Spares 1487 | Lighting 563 |
| Cosmetics 124 | Clothes 177 | Home Appliances 684 | Refurbished 352 |

6,181 placed SKUs, and the same 52 the live page reports as unplaced — in
Postgres but not in the curated arrays. Reported, never silently dropped.

## Filters

`lib/filter.js` is a port of the page's `matches()`, clause for clause:

* **One active category at a time.** Choosing a type elsewhere resets the
  previous select to "Select". "Select" is not a filter state; `*` means
  "All <name>". Switching category clears the level-2 and attribute filters,
  because their dimensions differ between sections.
* **Level-2 and attribute dropdowns** are built from the *active* category's own
  rows, so every option offered is a value that exists, listed exactly as stored
  — no normalising, no merging of near-duplicate spellings. Lampshade gets Shade
  shape + Fitting type; Wall Arm gets Subtype; Bulbs gets Series; Pendant Lamp
  Holder and Lamp Holder get Mount Type; Home Appliances gets its group.
* **Search** is multi-token AND across SKU, type, family, description, shade
  shape and fitting type.
* **Stock** conditions are the page's five: `pos` `zero` `neg` `low` `out`.
  `low`/`out` use `stockLevel`, which sums **all eight** warehouse columns — not
  just the UK ones. Getting that wrong changes both alert counts.
* **The header alerts are scoped to the active category**, not the catalogue.
  That is why the live page reads 62 / 7 on Ceiling Rose and not 1613 / 687.

Spot-checked against the live page: Ceiling Rose gives CRSF 267 · CRFF 116,
62 out of stock, 7 low.

## What is NOT done yet

**1. Four tabs are UI-only.** Postage Information, SKU Fixed Price, Slow-Moving
Stock and Pending Dispatch render their panel but have no query yet. Their SQL is
validated in `../sql/refresh/extract/`.

**2. Columns not yet carried over** on the Inventory tab: Last Container
(warehouse / date / container number), Price Comment and the History drill-down.
Their sources are `containers.js`, `price.js` and `history.js`. The status line
also does not yet show the per-family breakdown ("CRSF 267 · CRFF 116") the live
page prints beside the count.

**3. Caching.** `/api/inventory` is `force-dynamic` — every load runs the full
query (~6 s). Before real use it wants a short revalidate or a snapshot, so the
page is not doing 3 chunked round-trips per visitor against a connection-limited
user.
