import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './data-dir.js';

// The curated placement, exported from the live dashboard's arrays by
// scripts/export-classification.cjs. build.js states the rule plainly:
//
//   "an existing SKU keeps the classification it already has — the embedded
//    arrays on disk are the authority for f, t, x, mt, sh, ft and sr"
//
// So section and type are DATA, not something to re-derive from a SKU prefix.
// The first version of this app derived them and disagreed with the dashboard on
// six of the twelve sections. Re-run the export whenever those arrays change.
// Not process.cwd() — see lib/data-dir.js. This read happens at module scope for
// the inventory route and throws outside its try/catch, so getting it wrong takes
// the whole route to a 500 HTML page.
const DIR = dataDir();
const load = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));

let cache = null;
export function classification() {
  if (!cache) cache = { cls: load('classification.json'), sections: load('sections.json') };
  return cache;
}

// The category bar's order, including which sections exist. Taken from the page's
// own CATEGORIES list so the bar reads identically.
export const CATEGORY_ORDER = ['CR', 'PH', 'LS', 'WA', 'LH', 'LB', 'SPR', 'LGT', 'CSM', 'CLO', 'HAP', 'RFB'];

// Which SKUs belong to a section. Local, so the API can scope its queries to one
// category instead of reading the whole catalogue on every load.
let bySection = null;
export function skusIn(key) {
  if (!bySection) {
    const { cls } = classification();
    bySection = {};
    for (const sku of Object.keys(cls)) (bySection[cls[sku].key] ||= []).push(sku);
  }
  return bySection[key] || [];
}

// Section populations, for the category strip. No database needed.
export function sectionCounts() {
  const { cls } = classification();
  const c = {};
  for (const sku of Object.keys(cls)) c[cls[sku].key] = (c[cls[sku].key] || 0) + 1;
  return c;
}

// Almost every image is stored as a bare filename and needs the CDN prefix. A few
// carry a FULL url from a different host; prefixing those makes a double-scheme
// url that can never load, so absolute urls are left alone. Same rule as the live
// page's imgURL().
const IMG_BASE = 'https://sin1.contabostorage.com/4ad62276cb6d4a83bfb1b8a91b839703:newom/newom/newom/img/product_images/';
export const imgURL = v => (!v ? null : /^https?:\/\//i.test(v) ? v : IMG_BASE + v);
