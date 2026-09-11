// THE DISPATCH PREDICATES, MOVED BUT NOT REWRITTEN.
//
// These are the clauses PendingDispatchTab and RecentlyDispatchedTab ran in the browser,
// lifted out character for character so the server can run them instead. Nothing here is
// a tidier restatement of what those components did — a restatement is exactly how a
// filter's meaning drifts, and the meaning is the thing that must not change.
//
// The two tabs search DIFFERENT fields, and that difference is deliberate. The queue has
// no tracking number to search yet; on Recently Dispatched most orders have one, and
// "where did LED62991 go" is asked by number. The comment that recorded this lived in
// RecentlyDispatchedTab; it is repeated here because this is now where the rule lives.

/** Recently Dispatched: order id, SKUs, tracking, courier, marketplace, ship-to, product names. */
export const recentHay = x =>
  (x.o + ' ' + x.k + ' ' + x.t + ' ' + x.cr + ' ' + x.m + ' ' + x.c + ' ' +
   x.li.map(l => l.n).join(' ')).toLowerCase();

/** Dispatch Queue: no tracking, no courier — an order still in the queue has neither. */
export const pendingHay = x =>
  (x.o + ' ' + x.k + ' ' + x.m + ' ' + x.c + ' ' +
   x.li.map(l => l.n).join(' ')).toLowerCase();

/** Every term must appear somewhere in the row. Same split, same `every`, same `includes`. */
export function termsMatch(hay, q) {
  const terms = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  return terms.every(k => hay.includes(k));
}

/**
 * A DYNAMIC FILTER, not a query per combination.
 *
 * `spec` names the row field each parameter tests; a parameter the reader did not set is
 * an empty string and contributes no clause at all. Adding a filter is adding one entry.
 * The comparison is `===` on the row's own value, which is what the components did — not
 * a case-insensitive or trimmed match, because that would let through rows the old build
 * excluded.
 */
export function applyDispatchFilters(rows, params, spec, hayOf) {
  const clauses = Object.entries(spec)
    .filter(([p]) => params[p])
    .map(([p, field]) => x => x[field] === params[p]);
  const q = (params.q || '').trim();
  let out = clauses.length ? rows.filter(x => clauses.every(c => c(x))) : rows;
  if (q) out = out.filter(x => termsMatch(hayOf(x), q));
  return out;
}

/** The field each query parameter filters on, per tab. */
export const RECENT_SPEC  = { band: 'band', wh: 'w', mkt: 'm', dis: 's' };
export const PENDING_SPEC = { band: 'band', wh: 'w', dis: 's' };
