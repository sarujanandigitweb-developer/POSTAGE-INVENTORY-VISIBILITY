import 'server-only';
import fs from 'node:fs';
import path from 'node:path';

// The curated placement, exported from the live dashboard's arrays by
// scripts/export-classification.cjs. build.js states the rule plainly:
//
//   "an existing SKU keeps the classification it already has — the embedded
//    arrays on disk are the authority for f, t, x, mt, sh, ft and sr"
//
// So section and type are DATA, not something to re-derive from a SKU prefix.
// The first version of this app derived them and disagreed with the dashboard on
// six of the twelve sections. Re-run the export whenever those arrays change.
const DIR = path.join(process.cwd(), 'data');
const load = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));

let cache = null;
export function classification() {
  if (!cache) cache = { cls: load('classification.json'), sections: load('sections.json') };
  return cache;
}

// The category bar's order, including which sections exist. Taken from the page's
// own CATEGORIES list so the bar reads identically.
export const CATEGORY_ORDER = ['CR', 'PH', 'LS', 'WA', 'LH', 'LB', 'SPR', 'LGT', 'CSM', 'CLO', 'HAP', 'RFB'];
