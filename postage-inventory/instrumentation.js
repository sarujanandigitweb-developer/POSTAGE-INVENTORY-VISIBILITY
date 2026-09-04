// Runs once when the server starts, so the first reader to open a tab finds it already
// built instead of watching "Reading … from LEDSone".
//
// It warms over HTTP rather than importing the route modules: referencing them here pulls
// them into the instrumentation bundle, which fails to resolve and takes the whole server
// down with it — the hook is loaded before anything can serve.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const port = process.env.PORT || 3020;
  const keys = ['container-details', 'fixed-price', 'slow-moving'];

  // SEQUENTIAL, and cheapest first. tech_user allows 10 connections, shares them with
  // pgAdmin and with the 2-hourly refresh, and this app's pool is capped at 3. Warming
  // three datasets at once starves all of them AND whatever the reader is doing.
  //
  // Measured: slow-moving builds in ~15s on an idle database. In a log from a start
  // where the reader was browsing at the same time, the same build took 512s. The
  // contention is the cost, not the query.
  const TIMEOUT_MS = 10 * 60 * 1000;

  setTimeout(async () => {
    for (const key of keys) {
      const t0 = Date.now();
      try {
        // An explicit timeout, generous enough for a cold build on a busy database.
        // Without one, the platform's own ~5-minute limit fired first and logged
        // "fetch failed" for a build that then finished perfectly well — a warning
        // about nothing, which is worse than silence.
        const r = await fetch(`http://127.0.0.1:${port}/api/${key}?size=1`,
                              { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        console.log(`[warm] ${key} ready in ${Date.now() - t0}ms`);
      } catch (e) {
        // The build itself may well still be running and will finish on its own; the
        // reader simply pays for it on first open. Say that, rather than "failed".
        const why = e.name === 'TimeoutError'
          ? `still building after ${Math.round((Date.now() - t0) / 1000)}s — the first reader will wait for it`
          : e.message;
        console.log(`[warm] ${key} not pre-built: ${why}`);
      }
    }
  }, 4000).unref?.();
}
