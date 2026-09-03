import 'server-only';

// Fixed Price is ~30k rows and Slow-Moving ~16k. Both are built from several
// whole-table queries, so they cannot be paginated in SQL without rewriting the
// shaping logic the live pipeline already validated. Instead each dataset is
// built ONCE per process and served in pages from memory — the same model the
// live dashboard uses, where a 2-hourly job builds a snapshot and the page reads
// it. The first caller pays for the build; everyone after gets a slice.
//
// Concurrent callers share one build rather than each starting their own.
const TTL = 10 * 60 * 1000;
const cache = new Map();     // key -> { at, data }
const inflight = new Map();  // key -> Promise

export async function getOrBuild(key, build) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  if (inflight.has(key)) return inflight.get(key);

  const p = (async () => {
    const data = await build();
    cache.set(key, { at: Date.now(), data });
    return data;
  })().finally(() => inflight.delete(key));

  inflight.set(key, p);
  return p;
}

export function builtAt(key) {
  const hit = cache.get(key);
  return hit ? new Date(hit.at).toISOString() : null;
}

// One place to slice, so every tab paginates identically.
export function page(rows, { page = 1, size = 25 } = {}) {
  const n = rows.length;
  if (size === 'all') return { rows, total: n, page: 1, pages: 1, size: n };
  const per = Math.max(1, Number(size) || 25);
  const pages = Math.max(1, Math.ceil(n / per));
  const cur = Math.min(Math.max(1, Number(page) || 1), pages);
  return { rows: rows.slice((cur - 1) * per, cur * per), total: n, page: cur, pages, size: per };
}
