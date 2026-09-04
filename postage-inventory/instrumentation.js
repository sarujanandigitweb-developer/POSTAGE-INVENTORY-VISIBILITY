// Next compiles this file for EVERY runtime, edge included, and an edge bundle cannot
// resolve `node:fs` — webpack fails the module build and every page 500s before a single
// line below ever runs. Two things that look like they would prevent that do not:
//
//   * a `process.env.NEXT_RUNTIME` guard — it is a runtime test, and the failure is at
//     build time, so webpack has already followed the import and given up;
//   * moving the node code into its own module and importing it inside that guard —
//     webpack follows the graph through a conditional dynamic import just the same.
//
// The directive below is what actually stops it: the import is left alone at build time
// and resolved natively by Node at runtime, on the one branch that can reach it. Both
// spellings are here so this holds whether the build runs webpack or turbopack.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const fs   = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ 'node:fs');
  const path = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ 'node:path');

  const KEYS = ['container-details', 'fixed-price', 'slow-moving'];
  const TIMEOUT_MS = 10 * 60 * 1000;

  // A DEPLOYMENT SERVING SNAPSHOTS HAS NOTHING TO WARM. The read is a file read of a few
  // milliseconds, and on a serverless host there is no local server to fetch from — each
  // function is its own isolate, so http://127.0.0.1 reaches nothing. Warming there would
  // be one wasted request per cold start and a misleading failure in the log.
  const shipped = KEYS.every(k => {
    try { return fs.existsSync(path.join(process.cwd(), 'data', 'snapshots', k + '.json')); }
    catch { return false; }
  });

  if (shipped) {
    console.log('[warm] skipped — every dataset is shipped as a snapshot, nothing to build');
    return;
  }

  const port = process.env.PORT || 3020;
  // Sequential, cheapest first: tech_user allows ten connections and shares them with
  // pgAdmin and the 2-hourly refresh. Warming three datasets at once starves all of them
  // and whatever the reader is doing. Measured: slow-moving builds in ~15s idle and 512s
  // when the reader was browsing at the same time. The contention is the cost.
  setTimeout(async () => {
    for (const key of KEYS) {
      const t0 = Date.now();
      try {
        // An explicit timeout, generous enough for a cold build on a busy database.
        // Without one the platform's own ~5-minute limit fired first and logged
        // "fetch failed" for a build that then finished perfectly well.
        const r = await fetch(`http://127.0.0.1:${port}/api/${key}?size=1`,
                              { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        console.log(`[warm] ${key} ready in ${Date.now() - t0}ms`);
      } catch (e) {
        const why = e.name === 'TimeoutError'
          ? `still building after ${Math.round((Date.now() - t0) / 1000)}s — the first reader will wait for it`
          : e.message;
        console.log(`[warm] ${key} not pre-built: ${why}`);
      }
    }
  }, 4000).unref?.();
}
