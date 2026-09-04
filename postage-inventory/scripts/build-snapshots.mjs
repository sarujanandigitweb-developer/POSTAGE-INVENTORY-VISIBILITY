// BUILD THE DATA ONCE, BEFORE THE APP IS PACKAGED.
//
// The deployed app must not query PostgreSQL. `tech_user` allows TEN connections in
// total and shares them with pgAdmin and the 2-hourly refresh; a serverless host gives
// every concurrent request its own instance and its own pool, so a handful of readers
// would exhaust the role and starve the cron that publishes the live dashboard. The
// dataset builds also run 15s–500s depending on contention, well past a function's
// timeout, and the disk cache that hides that locally cannot be written on a read-only
// filesystem.
//
// So this runs at BUILD time — one database session, no time limit — and writes a
// snapshot per dataset into data/snapshots/. lib/dataset.js reads those in preference to
// querying. It is the same model the published HTML dashboard already uses: a job builds
// a snapshot every 2 hours and the page reads it.
//
//   npm run snapshots      build them now (needs .env or the LEDSONE_* variables)
//
// Run by `prebuild`, so `next build` produces them automatically.
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'data', 'snapshots');
// Each entry names the route module and the export that builds its data. Importing the
// route gives us the same query and the same shaping the running app uses — there is no
// second copy of the logic to drift.
const DATASETS = [
  { key: 'container-details', mod: '../app/api/container-details/route.js' },
  { key: 'fixed-price',       mod: '../app/api/fixed-price/route.js' },
  { key: 'slow-moving',       mod: '../app/api/slow-moving/route.js' },
  { key: 'pending-dispatch',  mod: '../app/api/pending-dispatch/route.js' },
  { key: 'recent-dispatch',   mod: '../app/api/recent-dispatch/route.js' },
];

// Inventory is snapshotted ONE SECTION AT A TIME, keyed the way the request is keyed —
// a single whole-catalogue file would be 6,181 rows to load for a section of 124.
const INVENTORY = '../app/api/inventory/route.js';

const write = (key, data) => {
  fs.mkdirSync(OUT, { recursive: true });
  const f = path.join(OUT, key + '.json');
  fs.writeFileSync(f, JSON.stringify({ at: Date.now(), data }));
  return fs.statSync(f).size;
};

const mb = n => (n / 1048576).toFixed(2) + ' MB';

async function main() {
  const t0 = Date.now();
  let total = 0, made = 0, failed = 0;

  for (const d of DATASETS) {
    const t = Date.now();
    try {
      const m = await import(d.mod);
      if (typeof m.buildSnapshot !== 'function') {
        console.log(`  -- ${d.key}: no buildSnapshot export, skipped`);
        continue;
      }
      const size = write(d.key, await m.buildSnapshot());
      total += size; made++;
      console.log(`  OK ${d.key.padEnd(20)} ${mb(size).padStart(9)}  ${Date.now() - t}ms`);
    } catch (e) {
      failed++;
      console.error(`  ** ${d.key}: ${e.message}`);
    }
  }

  // one per category, from the route's own category list
  try {
    const inv = await import(INVENTORY);
    for (const cat of inv.CATEGORY_ORDER) {
      const t = Date.now();
      try {
        const size = write('inventory-' + cat, await inv.buildSnapshot(cat));
        total += size; made++;
        console.log(`  OK ${('inventory-' + cat).padEnd(20)} ${mb(size).padStart(9)}  ${Date.now() - t}ms`);
      } catch (e) { failed++; console.error(`  ** inventory-${cat}: ${e.message}`); }
    }
  } catch (e) { failed++; console.error('  ** inventory: ' + e.message); }

  console.log(`\n  ${made} snapshot(s), ${mb(total)} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  // A missing snapshot is not fatal — the route falls back to querying — but on a host
  // that cannot reach the database it would mean an empty tab, so say so loudly.
  if (failed) {
    console.error(`\n  ${failed} dataset(s) could not be built. The deployed app will try to`);
    console.error('  query for those, which a serverless host cannot sustain. Fix before deploying.');
    process.exitCode = 1;
  }
}

main();
