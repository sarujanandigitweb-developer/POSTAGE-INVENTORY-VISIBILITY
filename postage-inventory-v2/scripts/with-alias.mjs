// Registers the `@/` resolver, then runs the snapshot build. Kept separate so the hooks
// are installed before the route modules are imported.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('./alias-hooks.mjs', pathToFileURL('./scripts/'));
await import('./build-snapshots.mjs');
