// Runs once when the server starts. Warming here means the first reader to open a
// tab finds it already built, instead of watching "Reading … from LEDSone" for 3s
// on Fixed Price or 11s on Slow-Moving.
//
// It warms over HTTP rather than importing the route modules: referencing them here
// pulls them into the instrumentation bundle, which fails to resolve and takes the
// whole server down with it — the hook is loaded before anything can serve.
//
// Sequential, not parallel: tech_user allows 10 connections and is shared, and the
// 2-hourly refresh must never be starved by this app warming itself up.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const port = process.env.PORT || 3020;
  const keys = ['fixed-price', 'slow-moving', 'container-details'];

  // never let warming break startup — it is an optimisation, not a dependency
  setTimeout(async () => {
    for (const key of keys) {
      try {
        const t0 = Date.now();
        const r = await fetch(`http://127.0.0.1:${port}/api/${key}?size=1`);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        console.log(`[warm] ${key} ready in ${Date.now() - t0}ms`);
      } catch (e) {
        console.log(`[warm] ${key} skipped: ${e.message}`);
      }
    }
  }, 2000).unref?.();
}
