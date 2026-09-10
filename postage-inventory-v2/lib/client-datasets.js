// THE BROWSER'S SIDE OF THE DATASET CACHE.
//
// lib/dataset.js already does this on the server: one build per key, concurrent callers
// share it, and a held copy is served while it is inside the TTL. None of that helps a
// reader who switches tabs, because Shell renders each tab conditionally — leaving a tab
// UNMOUNTS it and destroys its `d`, so coming back refetches from scratch and re-transfers
// the payload. Fixed Price is 12 MB and Slow-Moving 5.8 MB.
//
// This module is the same idea in the same shape, one layer out: keep what a URL returned,
// and keep the promise while it is in flight so a second caller attaches instead of
// starting a duplicate. It lives outside React state deliberately — that is the whole
// point, since React state is what unmounting throws away.
//
// WHAT IT IS NOT.
//
//   * It is NOT a source of truth. Every entry came from an API response and nothing is
//     derived, merged or reshaped here. The payload handed back is the one the route sent.
//
//   * It does NOT define a freshness rule. The server owns that — lib/dataset.js:22, from
//     LEDSONE_DATA_TTL. A held copy here is PAINTED and then REVALIDATED behind, which is
//     exactly what Shell's Inventory cache has always done: "the held copy paints
//     immediately — no spinner, no flicker — and the request still goes out behind it, so
//     the next render is current". Adding a second, client-side expiry would be a second
//     freshness rule, and there must only be one.
//
// KEYED BY FULL URL, not by tab. Fixed Price and Slow-Moving encode their filters, sort,
// page and size in the query string, so two different filter states are two different
// datasets and must not share an entry. Returning to a tab reproduces its default URL —
// its state resets on unmount — so the common case still hits.

const store = new Map();   // url -> { data, at, promise }

/** The last payload this URL returned, or null. Synchronous: a caller can paint with it
 *  in the same render rather than waiting a tick and showing a spinner first. */
export function held(url) {
  const e = store.get(url);
  return e && e.data !== undefined ? e.data : null;
}

/** Is a request for this URL in the air right now? */
export function inFlight(url) {
  return !!store.get(url)?.promise;
}

/**
 * Fetch a URL, reusing an identical request that is already running.
 *
 * The promise is recorded BEFORE the fetch is awaited, so two callers in the same tick —
 * a tab mounting while the background prefetch is partway through the same URL — get the
 * same promise and the network sees one request. It is cleared on settle so a later call
 * revalidates rather than replaying a stale promise for ever.
 */
export function load(url) {
  const e = store.get(url);
  if (e?.promise) return e.promise;

  const promise = fetch(url)
    .then(r => r.json())
    .then(j => {
      // Only a successful payload is kept. An { ok: false } body is a real answer and is
      // returned to the caller to render as an error, but caching it would make one
      // failed request poison every later visit to that tab.
      const entry = store.get(url) || {};
      if (j && j.ok) { entry.data = j; entry.at = Date.now(); }
      entry.promise = null;
      store.set(url, entry);
      return j;
    })
    .catch(err => {
      const entry = store.get(url) || {};
      entry.promise = null;
      store.set(url, entry);
      throw err;
    });

  store.set(url, { ...(e || {}), promise });
  return promise;
}

/**
 * Warm the OTHER tabs after the visible one has painted.
 *
 * SEQUENTIAL, NEVER PARALLEL, and this is not a preference. The pool is max 3 locally and
 * 1 on a serverless host, against a role that allows ten connections in total and shares
 * them with pgAdmin and the 2-hourly refresh. instrumentation.js carries the measurement:
 * "slow-moving builds in ~15s idle and 512s when the reader was browsing at the same
 * time. The contention is the cost." Firing six prefetches at once would make every page
 * slower, including the one being read.
 *
 * Each entry is a URL that costs the SERVER a full dataset build but returns almost
 * nothing — the routes already paginate, so `size=1` builds and caches the whole dataset
 * and ships one row. That is the same probe instrumentation.js uses. The expensive part of
 * opening a tab is the build, not the transfer; this removes the build and leaves the tab
 * to fetch its own real page when it is actually opened. Nothing large is pulled into
 * browser memory for a tab nobody has looked at.
 *
 * Failures are swallowed on purpose. A prefetch is an optimisation; if one fails the tab
 * still works, and surfacing it would report an error for a page the reader is not on.
 */
export async function warmOthers(urls) {
  for (const url of urls) {
    if (held(url) || inFlight(url)) continue;
    try { await load(url); } catch { /* an optimisation, never an error the reader sees */ }
  }
}
