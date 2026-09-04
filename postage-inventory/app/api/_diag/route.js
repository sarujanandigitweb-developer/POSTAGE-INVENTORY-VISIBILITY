// TEMPORARY DIAGNOSTIC. Reports what the deployed function can actually SEE of its
// own filesystem, because three rounds of inference about where Next puts traced
// files have each been wrong. Delete once the deployment is healthy.
//
// Paths and file names only — never environment values.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const dynamic = 'force-dynamic';

const list = d => { try { return fs.readdirSync(d).slice(0, 40); } catch (e) { return 'ERR ' + e.code; } };
const has  = f => { try { return fs.statSync(f).size; } catch (e) { return 'ERR ' + e.code; } };

export async function GET() {
  const cwd = process.cwd();
  let here = null;
  try { here = path.dirname(fileURLToPath(import.meta.url)); } catch { /* bundled */ }

  // every place data/ could plausibly have landed
  const roots = [cwd, path.join(cwd, 'postage-inventory'), '/var/task',
                 '/var/task/postage-inventory', here, here && path.resolve(here, '../../../../..')]
    .filter(Boolean);

  const probes = {};
  for (const r of roots) {
    probes[r] = {
      entries: list(r),
      'data/': list(path.join(r, 'data')),
      'data/classification.json': has(path.join(r, 'data', 'classification.json')),
      'data/snapshots/': list(path.join(r, 'data', 'snapshots')),
    };
  }

  let resolved = null, resolveErr = null;
  try { resolved = (await import('@/lib/data-dir')).dataDir(); }
  catch (e) { resolveErr = e.message; }

  return Response.json({
    ok: true,
    cwd, moduleDir: here, resolvedDataDir: resolved, resolveErr,
    nodeVersion: process.version,
    vercel: { region: process.env.VERCEL_REGION || null, env: process.env.VERCEL_ENV || null,
              commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null },
    probes,
  }, { headers: { 'cache-control': 'no-store' } });
}
