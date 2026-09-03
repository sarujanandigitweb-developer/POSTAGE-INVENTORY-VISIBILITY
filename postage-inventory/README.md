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

## Layout and styling

Two stylesheets, and the split matters:

* **`app/dashboard.css`** — the live page's stylesheet, ported verbatim. It owns
  the **table**: the three-row grouped header, the UK / German / Other markets
  bands, cell padding, the sticky SKU column, row colours, the density scale.
* **`app/theme.css`** — **chrome only**. Sidebar, top bar, cards, category
  strip, table toolbar and pager. No rule in it selects `table`, `thead`,
  `tbody`, `tr`, `th`, `td` or `.scroll`, so the table cannot drift.

The shell is viewport-locked: the top bar stays put, the pager sits on the bottom
edge, and the only thing that scrolls is the rows between them. Below 560px of
window height the shell scrolls instead, so a short window clips nothing.

The sidebar collapses to icons — by its own chevron, by the hamburger in the top
bar, or automatically below 900px, where the labels would otherwise eat a quarter
of the width.

The top bar carries the tab name, a category jump, when the data was read, the
two stock alerts as chips, Export CSV, the theme toggle and the account. Below
620px the buttons and chips drop their labels and keep icon + count.

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

## Loading

The endpoint reads **one category per request**, not the catalogue. Which SKUs
are in a section is known locally from the curated classification, so no query is
needed to work that out — and a section is 124–1,487 rows rather than 6,181.

| | |
|---|---|
| whole catalogue (before) | ~6 s before anything appeared |
| first paint, Ceiling Rose | ~2.1 s |
| a section after that | 0.7–2.1 s |
| a section already visited | instant — cached in the client |

The table opens on **15 rows per page**, not all of them, so the first render is
a page rather than a section.

Two things deliberately kept off the request path:

* **The unplaced check.** Scoping the query to one category means it can no
  longer notice a SKU that Postgres has and the curated arrays do not, and
  `build.js`'s contract is that those are reported, never silently dropped. A
  SKU-only scan of the catalogue restores it, but awaiting it put that scan in
  front of the first paint — 7.3 s instead of 2.1 s. It now runs in the
  background: the first response says `unplaced: null` (pending), every one after
  it carries the list of 52.
* **Section populations** for the category strip come from the local
  classification, so all twelve show their real count even though one was
  queried.

Image URLs are normalised the way the live page's `imgURL()` does it: a bare
filename gets the CDN prefix, an absolute url is left alone — prefixing those
made a double-scheme url that could never load, and it failed quietly behind the
onerror fallback so it read as missing rather than broken.

## The other three tabs

All ported from the validated extract scripts in `../sql/refresh/extract/`, and
checked against the live dashboard rather than assumed:

| Tab | Figure | This app | Live dashboard |
|---|---|---|---|
| SKU Fixed Price | total SKUs | 30,221 | 30,221 |
| | single / combo | 4,771 / 25,450 | 4,771 / 25,450 |
| Slow-Moving | slow rows | 16,462 | 16,462 |
| | holding stock | 2,465 | 2,465 |
| | never sold | 1,116 | 1,116 |
| | Critical / High / Medium | 9,639 / 3,812 / 3,011 | 9,639 / 3,812 / 3,011 |
| Pending Dispatch | open orders | 234 | 234 |

The Slow-Moving and Fixed Price figures were verified by running the live extract
itself minutes apart, not against this morning's published snapshot — the numbers
move through the day as orders ship.

Three rules in these tabs are load-bearing, and each was a real defect when it
was missing from my first attempt:

* **Single vs combo is `inventory.products.inventory_bool`**, not whether the SKU
  contains a `+`. The `+` heuristic gave 15,768 / 14,453 against the dashboard's
  4,771 / 25,450 — plenty of combos carry no `+` in their SKU.
* **A SKU that holds nothing AND has never sold is a dormant catalogue entry, not
  a slow-mover** — there is neither stock to act on nor a sale to have gone quiet.
  Leaving those in gave 34,764 rows against 16,478.
* **A SKU never sold is aged from `created_at`**, not treated as infinitely old.

And from the source scripts, preserved verbatim in comments where they matter:
Cancelled and Deleted orders are not sales; a component sold inside a combo has
moved; `order_info.shipped` is not the open/closed signal; Wayfair and Temu hold
no data source at all and are declared empty rather than left blank.

Fixed Price (~30k rows) and Slow-Moving (~16k) are built once per process and
served in pages from memory — the same model the live dashboard uses, where a
2-hourly job builds a snapshot and the page reads it. First build ~5.5s and ~12s;
pages after that are instant. Pending Dispatch is small enough (234 orders) to
return whole.

## What is NOT done yet

**1. Postage Information** is fetched live from the team's Google Sheet on the
original dashboard, not from PostgreSQL. Not ported.

**2. Columns not yet carried over** on the Inventory tab: Last Container
(warehouse / date / container number), Price Comment and the History drill-down.
Their sources are `containers.js`, `price.js` and `history.js`. The status line
also does not yet show the per-family breakdown ("CRSF 267 · CRFF 116").

**3. Nothing writes.** Every query is read-only; no schema is touched.
