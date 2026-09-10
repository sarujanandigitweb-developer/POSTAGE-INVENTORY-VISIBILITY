// SEARCH, FILTER, SORT AND PAGINATE — ON THE SERVER, IN ONE PLACE.
//
// WHAT THIS CHANGES, AND WHAT IT DELIBERATELY DOES NOT.
//
// It changes WHERE the narrowing happens, not HOW. Every tab used to receive its whole
// result set and narrow it in the browser: Inventory shipped 1,736 KB for Lampshade and
// 1,812 KB for a cross-section search, Recently Dispatched 2,140 KB for 4,649 orders.
// The reader then looked at 25 rows of it. Now the request carries the filters, the
// server applies them, and the response carries one page. SKU Fixed Price and
// Slow-Moving already worked this way — 9 KB for 25 of 31,426 rows — so this is the
// pattern the app already had, applied to the tabs that had been left out.
//
// It does NOT change any SQL. The predicates below are the ones lib/filter.js already
// used in the browser, imported rather than reimplemented, so a row is included or
// excluded for exactly the reason it always was. That is not a shortcut: these rows are
// not rows of any table. Slow-Moving assembles three movement sources with a fallback
// precedence, Fixed Price applies a five-tier price rule across four marketplaces, and an
// Inventory row's price comes from data/price.json while its stock is pivoted across
// eight warehouses and its container history is parsed out of free text. `ORDER BY price`
// cannot be written against a column that does not exist. Pushing these predicates into
// SQL would mean rewriting the business rules in a second language and keeping the two in
// step for ever — which is the one thing this project has consistently refused to do.
//
// So the pipeline is: the dataset is built once and cached by lib/dataset.js exactly as
// before, and everything below runs over that cached set, server-side, per request.

/** The page sizes the UI offers. 250 is the ceiling: a page is meant to be read, and the
 *  whole point of this module is that a response is not a dataset. */
export const SIZES = [25, 50, 100, 250];
export const MAX_SIZE = 250;
export const DEFAULT_SIZE = 25;

/**
 * Read `page` and `size` off a request, and refuse to be talked into a bigger page than
 * the UI offers. `?size=100000` is how server-side pagination quietly becomes no
 * pagination at all, so the value is clamped rather than trusted.
 */
export function pageParams(sp) {
  const raw = Number(sp.get('size'));
  const size = SIZES.includes(raw) ? raw
             : (Number.isFinite(raw) && raw > 0 ? Math.min(Math.round(raw), MAX_SIZE) : DEFAULT_SIZE);
  const page = Math.max(1, Math.round(Number(sp.get('page')) || 1));
  return { page, size };
}

/**
 * A DYNAMIC FILTER, not a query per combination.
 *
 * `tests` is a list of predicates in which the inactive ones are already null — the
 * caller writes `q && (r => …)`, so a filter the reader did not set contributes nothing
 * and costs nothing. Adding a filter is adding one line to that list; no combination is
 * enumerated anywhere.
 */
export function applyFilters(rows, tests) {
  const active = tests.filter(Boolean);
  if (!active.length) return rows;
  return rows.filter(r => active.every(t => t(r)));
}

/**
 * SORT WITH A UNIQUE TIE-BREAKER, ALWAYS.
 *
 * Paging over an unstable order is how a reader sees the same SKU on page 2 and page 3
 * and never sees another at all: equal keys may fall either way, and each page is sorted
 * independently. `key` may repeat — many rows share a price, a date, a warehouse — so
 * every comparison ends on `unique`, which must not. Array.prototype.sort is stable in
 * modern JS, but stability preserves the INPUT order, and the input here is a rebuilt
 * dataset whose order is not guaranteed across builds. The tie-breaker is what makes the
 * order reproducible, not the sort algorithm.
 */
export function sortRows(rows, { key, dir = 'asc', unique }) {
  if (!key) return rows;
  const sign = dir === 'desc' ? -1 : 1;
  const val = r => {
    const v = typeof key === 'function' ? key(r) : r[key];
    return v === undefined || v === null || v === '' ? null : v;
  };
  const uv = r => (typeof unique === 'function' ? unique(r) : r[unique]) ?? '';
  return [...rows].sort((a, b) => {
    const x = val(a), y = val(b);
    // Rows with no value sort last whichever way the column is pointing — an empty cell
    // is not "the smallest", it is "not applicable", and burying it keeps the first page
    // of a descending sort useful.
    if (x === null && y === null) return String(uv(a)).localeCompare(String(uv(b)));
    if (x === null) return 1;
    if (y === null) return -1;
    const c = typeof x === 'number' && typeof y === 'number'
      ? x - y
      : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' });
    if (c !== 0) return c * sign;
    return String(uv(a)).localeCompare(String(uv(b)));
  });
}

/**
 * The slice, and the numbers the pager needs to describe it.
 *
 * `total` is the size of the MATCHING set, not of the dataset — it is what "3,245 SKUs
 * found" has to say — and it is a length, not a second pass over the data.
 *
 * A page beyond the end is clamped rather than returned empty: narrowing a filter while
 * sitting on page 40 would otherwise show nothing at all, with a pager insisting there
 * are only 3 pages.
 */
export function paginate(rows, { page = 1, size = DEFAULT_SIZE } = {}) {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const cur = Math.min(Math.max(1, page), pages);
  const from = (cur - 1) * size;
  return { rows: rows.slice(from, from + size), total, page: cur, pages, size, from };
}

/**
 * The whole pipeline, in the order the numbers have to be produced: narrow, order, count,
 * then cut. Counting before ordering would be cheaper by a hair and wrong by a page — the
 * count has to describe the same set the slice came from.
 */
export function runQuery(rows, { tests = [], sort, page, size }) {
  const matched = applyFilters(rows, tests);
  const ordered = sort ? sortRows(matched, sort) : matched;
  return paginate(ordered, { page, size });
}

/**
 * OPTION LISTS COME FROM THE MATCHING SET, NOT FROM THE PAGE.
 *
 * The dropdowns used to be built in the browser out of every row, because the browser had
 * every row. It no longer does, so the server sends them — and it builds them from the
 * rows that match everything EXCEPT the filter being offered, which is why each list is
 * requested separately. Building them from the 25 rows on screen would offer a reader the
 * three warehouses that happen to appear on page 1.
 */
export function optionsFor(rows, key) {
  if (!key) return null;
  const counts = new Map();
  for (const r of rows) {
    const v = typeof key === 'function' ? key(r) : r[key];
    if (v !== null && v !== undefined && v !== '') counts.set(v, (counts.get(v) || 0) + 1);
  }
  return [...counts.keys()].sort((a, b) => String(a).localeCompare(String(b)))
    .map(v => ({ value: v, count: counts.get(v) }));
}
