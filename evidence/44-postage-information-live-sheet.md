# Evidence 44 — Postage Information tab, live from Google Sheets

**Date:** 2026-08-26 · Not committed, not pushed.
Request: keep Inventory as the default header tab, add a Postage Information tab whose
buttons each show a different table from the linked sheet, fetched live. **No static or
manually embedded data.**

## Sheet

`Postage_Inventory_Visibility_Dashboard_User_Requirements`
(`1-4AnU5osx50_LRwwBPXwtVYWG_dk09psx8Jgsd3mYHI`), 14 tabs. Sharing is
**`{"role":"reader","type":"anyone"}`** — anyone with the link can view. That is what
makes a browser read possible without publishing the workbook to the web.

The linked tab, gid `1966712240`, is **Postage Information**. The other postage-shaped
tabs are empty today: *Upcoming Stock* returns 21 bytes, *Price Details* returns 0.

## The endpoint decision — this is the important one

The usual client-side trick is `gviz/tq?tqx=out:csv`. **On this sheet it silently loses
data.**

| Endpoint | Rows returned | International pricing rows |
|---|---:|---|
| `gviz/tq?tqx=out:csv` | **281** | collapsed to a **single cell** each |
| `export?format=csv` | **352** | intact, 30+ populated columns each |

gviz applies its own header and type inference and drops what it cannot fit. Row 103 came
back as `[(0,'Courrier')]` under gviz and as `Ireland | 6.9 | 0.65 | 0.91 | 8.46 | …`
(31 populated columns) under export.

This is the same failure this project was bitten by on 2026-08-20, when a Drive read
returned 17 of 451 SKUs and looked plausible. **`/export?format=csv` is used.**

Both endpoints were checked for CORS with a foreign `Origin`, because a browser will
refuse the read otherwise:

```
export  307  access-control-allow-origin: https://example.com
        200  access-control-allow-origin: *          <- final hop, googleusercontent.com
```

Both hops are permissive, so `fetch` works from the file and from the hub.

## Tables

The tab holds **six stacked tables**, each introduced by a numbered heading:

| Table | Rows | Widest |
|---|---:|---:|
| 1. postage Prices | 60 | 5 |
| 2. Intenational Prices *(sheet's own spelling)* | 43 | 43 |
| 3.postage Dimensions | 6 | 3 |
| 4. Contact Details | 28 | 6 |
| 5. Box Sizes | 37 | 2 |
| 6. Box Purchase History | 130 | 12 |

Two traps in splitting them, both handled and both tested:

- **A heading is not always in column A.** `4. Contact Details` sits in **column B**, so
  every cell in a row is tested, not just the first. Checking only column A loses that
  table entirely.
- **`9.5x9.5x4.5` is a box size, not a heading.** A naive `^\d+\.` split cuts Box Sizes
  in two. The rule requires a **letter** after the number.

## What was built

- **Header tabs — `Inventory` (default) and `Postage Information`.** Switching hides the
  category row and the inventory table and shows the postage panel.
- **One button per table**, built from what the fetch returned, each showing its row
  count. A seventh section added to the sheet appears as a seventh button with no code
  change.
- **A real CSV reader** — quoted fields, embedded commas and newlines, doubled quotes,
  CRLF/LF, BOM. Splitting on `,` would destroy every quoted price description.
- **Per-table trimming** — empty rows dropped, trailing empty columns removed, so a
  5-column table does not render as 43.
- **Refresh** re-reads the sheet, cache-busted, and the panel shows the sync time.
- **No invented column labels.** The sections do not share a header shape, so every cell
  rendered is a cell the sheet contains. A first row is emboldened only when it looks
  like a label row (2+ cells, none numeric) — getting that wrong costs a bold row, never
  a mislabelled column.
- **Failure is stated, never faked.** A network or HTTP error says so, states that the
  section is live and has no fallback copy, and links to the sheet. No stale sync time is
  left claiming freshness.

## The no-network rule changed deliberately

The harness has asserted "no fetch, no XMLHttpRequest" since day one, and **it failed
this build** — correctly. The rule became precise rather than removed:

- exactly **one** `fetch(` exists in the file, and it is the sheet read
- no `XMLHttpRequest` anywhere
- the **Inventory view makes no network call at all** — asserted over the source between
  `rowHTML` and the postage code
- external hosts are limited to the sheet, the two image CDNs and the SVG namespace

## A pre-existing bug found on the way

The host allow-list assertion surfaced a third host, `dashboard.digitweblk.com`. One row,
`WCFL180RO` in `LS_EXTRA`, stores a **full URL** instead of a bare filename, and the
loader prefixed the CDN base to it unconditionally:

```
https://sin1.contabostorage.com/…/product_images/https://dashboard.digitweblk.com/Productimages/23484.jpg
```

That URL can never load. It failed quietly behind the `onerror` fallback, so it read as a
missing image rather than a broken one. All ten prefix sites now share
`imgURL(v) = /^https?:\/\//i.test(v) ? v : LS_IMG_BASE + v`. Fixed in the loader, so the
embedded arrays and their locks are untouched.

## Validation

`node validation/test_lampshade.js` → **ALL PASS — 955 passed, 0 failed** (905 before; +50).

The network is stubbed with a **synchronously-settling thenable**: a real Promise resolves
on the microtask queue, which never runs inside a synchronous assertion, so the load path
would have appeared to do nothing. The dashboard's own `.then`/`.catch` chain is exercised
exactly as written.

Phase 37 asserts the default view, that Inventory issues **zero** network calls, that
switching issues exactly one to `/export` and never to `gviz`, that it is cache-busted,
that all 352 rows and 43 columns parse, the CSV edge cases, the six tables with their
exact row counts, the column-B heading, the `9.5x9.5x4.5` trap, per-table trimming,
button rendering with counts, table switching, URL cells becoming links, Refresh
re-fetching, re-entry **not** refetching, network failure and HTTP 404 both surfacing,
recovery clearing the error, and that no postage row data is baked into the file.

All fourteen dataset locks verified byte-identical.

## Known constraints

- The sheet must stay shared as **anyone with the link can view**. Restricting it breaks
  the section, and the panel will say so rather than showing stale data.
- The browser needs reachability to `docs.google.com`. Offline, Inventory still works
  completely; Postage Information reports that it cannot read the sheet.
- If the hub serves the page under a Content-Security-Policy with a restrictive
  `connect-src`, the fetch will be blocked there while still working from the local file.
  That is worth checking on the next publish.

---

# Part 2 — Both views rendered at once, and search/filter added

**Reported:** the Postage Information panel appeared as a blank band *above* the Inventory
table, with both visible at the same time, and the sheet looked like it had not connected.

## Cause — CSS, not the fetch

The panels are toggled with the HTML `hidden` attribute:

```js
$('catbar').hidden = ...; $('invwrap').hidden = ...; $('pgwrap').hidden = ...;
```

`hidden` works through the browser's own `[hidden]{display:none}` rule, which is the
weakest kind of rule there is. Both panels set `display` from a class:

```css
.wrap  { … display:flex; … }
.pgwrap{ flex:1; display:flex; … }
```

A class selector outranks the UA rule, so `hidden` had **no effect** and both views
rendered together. The postage band was blank because the view was still Inventory, so
`pgLoad()` had never run — the sheet connection was never the problem.

I had written exactly this guard for the Stock History dialog (`.hmodal[hidden]`) and
did not carry it to the two panels added later.

**Fix:** one global rule, `[hidden]{display:none !important}`, so no author rule can
outrank it — present or future.

## The harness could not see it, again

The DOM stub sets a JavaScript **property**; it has no styling, so
`els.pgwrap.hidden === true` was true while the panel was plainly visible on screen. 955
assertions passed against a page showing both views at once. This is the same shape of
blind spot as the `getElementById` miss in evidence/41: the stub models the script, not
the browser.

**Guard added** — it asserts the CSS itself, and lists every id the script hides so a new
panel cannot be added without one:

```js
ok('a global [hidden] rule exists that no author display rule can outrank',
   /\[hidden\]\{display:none ?!important\}/.test(HTML));
```

**Verified by deleting the rule:** the suite fails with exactly that assertion, then
passes again when restored.

## Search and column filter

Added to the postage toolbar, above the table:

- **Search** across the active table's cells, case-insensitive.
- **Column filter** — a dropdown listing that table's columns, using **its own header
  labels** where it has them (`carrier_name`, `Price(Included VAT)`, `Mobile No`) and
  plain `Column 1…n` where it does not. No column name is invented.
- **`Showing N of M rows`**, with the header row counted separately rather than folded in.
- **Clear** resets both.

Two behaviours worth stating:

- **A header row is a label, not a result.** It stays on screen while the body is
  filtered, so the columns remain explained instead of a filtered table losing its
  headings.
- **Switching table resets the search.** The columns differ between tables, so carrying a
  column filter across would silently search the wrong field.

The toolbar hides whenever there is no table on screen — loading, error, or no sections —
so it never lingers over a state it cannot act on.

## Validation

`node validation/test_lampshade.js` → **ALL PASS — 980 passed, 0 failed** (955 before; +25).

Phase 38 asserts the CSS `[hidden]` guard, that the three panel ids are the ones the
script hides and that each exists in the markup, that switching really flips all three,
that the toolbar appears only with a table, the header-label column list, the
`Column 1…n` fallback, case-insensitive search, the count excluding the header, the header
surviving a filter, every rendered row genuinely matching, column-restricted search, the
no-match state replacing the table rather than showing an empty one, Clear, and the reset
on table switch.

---

# Part 3 — "Failed to fetch": the page was opened from disk

**Reported:** the Postage tab showed *Could not read the Google Sheet — Failed to fetch*.

## Cause

Not the sheet, not its sharing, not the network. **Google refuses CORS for a `null`
origin**, and a page opened straight off disk (`file://`) sends exactly that.

Measured against Google on 2026-08-26:

| Origin sent | `/export` 307 hop | `/export` final 200 | `gviz/tq` |
|---|---|---|---|
| `https://dashboard.example.com` | `access-control-allow-origin: https://dashboard.example.com` | `*` | ACAO echoed |
| **`null`** | **no ACAO header at all** | `*` | **no ACAO header at all** |

The browser checks CORS on **every** response in a redirect chain. With `Origin: null`
the first hop carries no `access-control-allow-origin`, so the request is killed before
the redirect is followed — which surfaces as the bare `TypeError: Failed to fetch`.

Both endpoints behave the same way, so there is no alternative URL to switch to, and **no
client-side change can work around it.** The page has to be served over `http(s)`.

My earlier CORS verification used `Origin: https://example.com` and passed. It was a real
check of the right thing, but not of the origin the team was actually using.

## Fix

The error message now diagnoses it instead of guessing. When `location.protocol` is
`file:` it says the page is open from disk, that Google refuses cross-origin reads from a
file, that **the sheet, its sharing and the connection are not at fault**, that the
request is blocked before it is sent, and what to do — open the dashboard from its Varman
AIOS hub address, or serve the folder over `http://`. It also notes that the Inventory tab
is unaffected and works fully from a file.

Served over `https`, the previous wording stands, because there the likely causes really
are sharing or reachability.

`node validation/test_lampshade.js` → **ALL PASS — 988 passed, 0 failed** (980 before; +8).
Phase 39 drives the failure under both protocols and asserts the two messages are
genuinely different, that the file case names the cause, clears the sheet of blame, gives
the fix, and that recovery still works afterwards.

**Consequence for the team: this tab only works from the hub URL, never from a copy of
the file on a desktop.**

---

# Part 4 — Reading the sheet's own structure

**Reported:** the tables were not professional, the headers were wrong, sub-titles and
sub-sub-titles were missing, the postage price table should be split one-by-one by its
sub-title, the `1. 2. 3.` numbering should come off the buttons, and a Google Sheet link
was being rendered as if it were a table row.

Every one of those is the same underlying fault: **Part 1 treated each section as one
flat grid.** The sheet is not flat — it has heading rows, sub-heading rows, stacked
multi-level headers and pointer links, and rendering them all as ordinary `<td>`s is why
it looked wrong.

## What the sections actually contain — measured

| Section | Header rows | Sub-headings | Links |
|---|---:|---:|---:|
| postage Prices | 1 | **11** | 0 |
| Intenational Prices | **5** | 0 | 0 |
| postage Dimensions | 1 | 0 | 0 |
| Contact Details | 1 | 0 | 0 |
| Box Sizes | 0 | **5** | 0 |
| Box Purchase History | 1 | 0 | **1** |

## The rules, and the two that had to be measured to get right

**A header block** is the run of label rows a section opens with: consecutive rows with
two or more filled cells and no numbers, ending at the first numeric row *or* once a row
is as wide as a normal data row. That last clause matters — without it *postage
Dimensions* reads as six header rows, because `120 X 60 X 45` is not a number. With it,
**International Prices keeps all five of its stacked levels** and every other section
correctly gets one.

**A sub-heading** is a lone value **in the first column** that is not a number, a link or
a contact detail. The first-column test is what stops Contact Details' five loose phone
numbers each becoming a heading of their own; the contact test stops `info@postnpackages.com`
doing the same.

## What changed

- **`1. 2. 3.` is stripped from the buttons.** Their order already conveys it. The titles
  are otherwise untouched — including the sheet's own `Intenational` typo, which is not
  mine to correct.
- **Sub-titles become their own tables.** postage Prices now renders eleven — `ROYAL
  MAIL`, `SMART TRACK`, `DPD`, `Amazon Shipping`, `Evri`, `DHL`, `GLS` and the `UK SITE` /
  `DE SITE` / `US SITE` bands — each under its own heading, each repeating the column
  header. Box Sizes splits the same way by material.
- **Multi-level headers render as headers.** All five of International Prices' levels sit
  in the `<thead>`, the deepest styled as the column row and the ones above it as group
  labels, so the column alignment they carry is preserved.
- **A standalone link is a link.** Box Purchase History's Google Sheets URL now sits above
  the table as *↗ Linked sheet* instead of occupying row one — which also lets the real
  header row (`Product · Size · Order date · …`) be recognised.
- **Counts describe data.** *Showing 48 of 48 rows across 11 tables · header rows
  excluded* — previously it said 59, counting headings as data.
- **Styling**: sticky headers, zebra rows, hover, right-aligned monospace numerics,
  per-table horizontal scroll, and a rule beside each group heading.

## One thing the source cannot tell us

A heading and a service-with-no-price are the same shape in this sheet: `SMART TRACK` and
`Royal Mail Internal(prime label)` are both a lone value in column A. **No nesting is
inferred** — every sub-title opens its own group — because guessing a parent would place a
real service in a position it does not hold. `Royal Mail Internal(prime label)` therefore
shows as a heading band with no rows. That is the sheet's ambiguity, not a rendering
choice, and it would be resolved by the sheet marking its headings.

## Validation

`node validation/test_lampshade.js` → **ALL PASS — 1,097 passed, 0 failed** (1,073 before).

Phase 44 asserts no button label starts with a number while the titles keep their spelling,
that International Prices keeps exactly five header levels and the others one, that
postage Prices splits into eleven groups with the carriers as titles, that the column
header repeats on every split table, that a heading with no rows renders as a band, that a
phone number never becomes a sub-heading, that the linked sheet is lifted out and no row
still carries it, that the real header is found once it is gone, that the count is 48 data
rows, and that searching drops groups with no match.

All fourteen dataset locks verified byte-identical.

---

# Part 5 — The 43-column table was unreadable

**Reported:** International Prices rendered with every heading broken one character per
line — `T r a c k e d   H e a v i e r …` — down a column a few pixels wide.

## Cause

Two rules fighting each other:

```css
.pgtab { width:100% }                       /* 43 columns into the panel = ~30px each */
.pgtab th,.pgtab td { overflow-wrap:anywhere }   /* so break mid-word to fit */
```

`width:100%` is right for a 2-column table and catastrophic for a 43-column one.
`overflow-wrap:anywhere` then did exactly what it was asked to: broke every word wherever
it had to. Neither was wrong on its own; together they were.

## Fix

- **`width:auto; min-width:100%`** — the table fills the panel when it is narrower than it
  and sizes to its content when it is wider, scrolling horizontally inside `.pgscroll`
  rather than compressing.
- **`min-width:118px`** per column so none can collapse, `92px` for numeric ones.
- **`overflow-wrap:break-word`** with `word-break:normal` — breaks between words, and only
  breaks inside one when a single word genuinely cannot fit.
- **A sticky first column.** On a 43-column table, scrolling right otherwise loses which
  country a price belongs to. The row label now stays put. Its backgrounds are repeated
  for the zebra and hover states because a sticky cell floats above the rows it passes and
  would otherwise be transparent, and the header corner takes `z-index:3` so it sits above
  both the sticky row label and the sticky header.

## Validation

`node validation/test_lampshade.js` → **ALL PASS — 1,109 passed, 0 failed** (1,097 before).

Phase 45 asserts the `width:auto; min-width:100%` pair, the column minimums, that
`overflow-wrap:anywhere` is **gone**, horizontal scrolling, the sticky row label with all
three of its background states and the header corner's stacking, that the header still
sticks to the top, and that International Prices really is 43 columns with all of them
rendered.

All fourteen dataset locks verified byte-identical.
