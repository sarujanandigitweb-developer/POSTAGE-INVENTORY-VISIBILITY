// THE THREE FILE-SOURCED FIELDS, KEPT IN STEP WITH THE PIPELINE.
//
// The Inventory tab's Shopify Price, its alternative-currency price and its Price
// Comment are not queries. They are produced by a separate pass of the 2-hourly refresh
// (sql/build-shopify-comments.js and the price extract), because the price rule is a
// five-tier match — exact SKU, a one-'+' combo, a pack, a larger combo — with LEDSone
// winning at every tier. Re-deriving ~200 validated lines in a route would be a second
// implementation free to drift.
//
// So they are COPIED. And copying by hand is how they went four days stale: the app was
// showing £47.20 for LSGL15014CL while the database said £7.71, a six-fold error, on
// eleven SKUs. This runs from `prebuild`, so every deployment takes whatever the last
// refresh produced. If the pipeline output is missing the existing copy is kept — a
// stale price beats no price — and it says so loudly.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../sql/refresh/out');
const DATA = path.resolve(here, '..', 'data');

const PAIRS = [
  ['shopify-price_data.json', 'price.json'],
  ['shopify-alt-price_data.json', 'price-alt.json'],
  ['shopify-comments.json', 'price-comments.json'],
];

let copied = 0, kept = 0;
for (const [src, dst] of PAIRS) {
  const from = path.join(OUT, src), to = path.join(DATA, dst);
  try {
    const raw = fs.readFileSync(from, 'utf8');
    const n = Object.keys(JSON.parse(raw)).length;      // never copy a truncated file
    const was = fs.existsSync(to) ? Object.keys(JSON.parse(fs.readFileSync(to, 'utf8'))).length : 0;
    fs.writeFileSync(to, raw);
    copied++;
    console.log(`  ${dst.padEnd(20)} ${String(was).padStart(5)} -> ${String(n).padStart(5)} entries`);
  } catch (e) {
    kept++;
    console.log(`  ${dst.padEnd(20)} kept the existing copy — ${e.code === 'ENOENT' ? 'no pipeline output' : e.message}`);
  }
}
console.log(`  ${copied} refreshed, ${kept} left as they were`);
