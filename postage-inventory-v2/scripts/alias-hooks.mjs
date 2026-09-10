// `@/lib/db` is a jsconfig path alias that Next resolves at build time. Plain Node knows
// nothing about it, so importing a route module outside Next fails on the first import.
// These hooks map `@/` to the project root, which is exactly what jsconfig.json declares.
import { pathToFileURL } from 'node:url';

const ROOT = pathToFileURL(process.cwd() + '/').href;

// Next also resolves extensionless imports; Node does not. Both have to be handled or
// the alias resolves to a path that then fails to load.
const CANDIDATES = ['', '.js', '.mjs', '/index.js'];

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith('@/')) return nextResolve(specifier, context);
  const base = ROOT + specifier.slice(2);
  for (const ext of CANDIDATES) {
    try { return await nextResolve(base + ext, context); } catch { /* try the next */ }
  }
  return nextResolve(base, context);      // let Node report the real error
}
