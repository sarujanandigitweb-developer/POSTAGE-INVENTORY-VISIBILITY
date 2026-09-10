import fs from 'node:fs';
import path from 'node:path';

// WHERE `data/` ENDS UP IN A DEPLOYED FUNCTION IS NOT process.cwd().
//
// Next traces the files a route needs and copies them into the function's bundle,
// laid out relative to its TRACING ROOT. When the app is a subfolder of a bigger
// repo — which it is: postage-inventory inside POSTAGE-INVENTORY-VISIBILITY — that
// root can be inferred as the REPOSITORY root, and the files land at
// <bundle>/postage-inventory/data/... while the function runs with its cwd at
// <bundle>. Every read built from process.cwd() then points one directory too high
// and throws ENOENT.
//
// Locally the two coincide (`next start` runs in the app directory), so this passes
// every local test and fails only once deployed. It did: /api/inventory returned a
// 500 HTML page because lib/classification.js could not read classification.json,
// and it throws OUTSIDE the route's try/catch.
//
// So the directory is FOUND rather than assumed: the candidates below are tried once
// and the first one actually holding the data wins.
const MARKER = 'classification.json';

const candidates = () => {
  const cwd = process.cwd();
  const out = [
    path.join(cwd, 'data'),                        // cwd is the app root (local, and the usual case)
    path.join(cwd, 'postage-inventory', 'data'),   // cwd is the repo root (traced from above)
  ];
  // and, failing both, walk up looking for it — covers a layout neither guess predicts
  let dir = cwd;
  for (let i = 0; i < 5; i++) {
    dir = path.dirname(dir);
    if (dir === path.dirname(dir)) break;
    out.push(path.join(dir, 'data'), path.join(dir, 'postage-inventory', 'data'));
  }
  return out;
};

let resolved;
export function dataDir() {
  if (resolved) return resolved;
  for (const c of candidates()) {
    try { if (fs.existsSync(path.join(c, MARKER))) return (resolved = c); } catch { /* try the next */ }
  }
  // Nothing found: return the conventional path so the caller's own error names a
  // sensible location rather than one of the guesses.
  return (resolved = path.join(process.cwd(), 'data'));
}

/** The snapshot directory, resolved the same way. */
export function snapshotDir() { return path.join(dataDir(), 'snapshots'); }
