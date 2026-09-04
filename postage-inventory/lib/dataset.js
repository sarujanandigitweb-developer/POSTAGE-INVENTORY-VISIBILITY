import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { snapshotDir } from './data-dir.js';

// Fixed Price is ~30k rows and Slow-Moving ~16k. Both are built from several
// whole-table queries, so they cannot be paginated in SQL without rewriting the
// shaping logic the live pipeline already validated. Instead each dataset is
// built ONCE per process and served in pages from memory — the same model the
// live dashboard uses, where a 2-hourly job builds a snapshot and the page reads
// it. The first caller pays for the build; everyone after gets a slice.
//
// Concurrent callers share one build rather than each starting their own.
const TTL = 10 * 60 * 1000;

// On globalThis, for the same reason the pool is: Next bundles each route handler
// separately and dev HMR re-evaluates modules, so a plain module-level Map is not
// one map — it is one per bundle, per reload. That is why the log showed
// `[dataset] built fixed-price` THREE times for what should have been a single
// build shared by the warm-up and the page's own prefetch. Three builds is also
// three times the connection pressure on a role that allows ten.
const STORE = Symbol.for('postage-inventory.dataset');
if (!globalThis[STORE]) globalThis[STORE] = { cache: new Map(), inflight: new Map() };
const { cache, inflight } = globalThis[STORE];

// Survive a restart. Rebuilding Fixed Price costs ~3s and Slow-Moving ~11s against a
// role that only allows 10 connections, so paying that again every `npm run dev` —
// and making the first reader wait for it — is waste, not safety. The snapshot is
// written beside the app and reused while it is inside the TTL.
const DIR = path.join(process.cwd(), '.cache');
const file = key => path.join(DIR, key + '.json');

function readDisk(key) {
  try {
    const raw = fs.readFileSync(file(key), 'utf8');
    const { at, data } = JSON.parse(raw);
    if (Date.now() - at < TTL) return { at, data };
  } catch { /* no snapshot, or an unreadable one: just rebuild */ }
  return null;
}

function writeDisk(key, at, data) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    // write then rename, so a reader never sees a half-written snapshot
    const tmp = file(key) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ at, data }));
    fs.renameSync(tmp, file(key));
  } catch (e) { console.error('[dataset] could not cache ' + key + ':', e.message); }
}

// A SNAPSHOT SHIPPED WITH THE DEPLOYMENT. Built before the app is packaged — by the
// build, or by the machine that already runs the 2-hourly refresh — and read instead of
// the database. It carries NO TTL: it is not a cache of a live source, it IS the source
// in a deployment, exactly as the published HTML dashboard is a 2-hourly snapshot rather
// than a live page.
//
// This is what makes the app hostable. Serverless gives every concurrent request its own
// instance and its own pool, against a role that allows TEN connections in total and
// shares them with pgAdmin and the refresh cron. Four readers would exhaust it. With a
// snapshot the deployed app opens no connection at all.
const SNAP_DIR = snapshotDir();
function readShipped(key) {
  try {
    const raw = fs.readFileSync(path.join(SNAP_DIR, key + '.json'), 'utf8');
    const { at, data } = JSON.parse(raw);
    return { at, data };
  } catch { return null; }        // no snapshot: fall through and query
}

/** Was this dataset shipped, rather than queried? */
export function shippedAt(key) {
  const s = readShipped(key);
  return s ? s.at : null;
}

export async function getOrBuild(key, build) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  if (inflight.has(key)) return inflight.get(key);

  // shipped first, and it never expires — see the note above
  const shipped = readShipped(key);
  if (shipped) { cache.set(key, { at: Date.now(), data: shipped.data }); return shipped.data; }

  const onDisk = readDisk(key);
  if (onDisk) { cache.set(key, onDisk); return onDisk.data; }

  const p = (async () => {
    const t0 = Date.now();
    const data = await build();
    const at = Date.now();
    cache.set(key, { at, data });
    writeDisk(key, at, data);
    console.log('[dataset] built ' + key + ' in ' + (at - t0) + 'ms');
    return data;
  })().finally(() => inflight.delete(key));

  inflight.set(key, p);
  return p;
}

/** Is this dataset ready to serve without touching the database? */
export function isReady(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return true;
  return !!readDisk(key);
}

export function builtAt(key) {
  const hit = cache.get(key);
  return hit ? new Date(hit.at).toISOString() : null;
}

// One place to slice, so every tab paginates identically.
export function page(rows, { page = 1, size = 25 } = {}) {
  const n = rows.length;
  if (size === 'all') return { rows, total: n, page: 1, pages: 1, size: n };
  const per = Math.max(1, Number(size) || 25);
  const pages = Math.max(1, Math.ceil(n / per));
  const cur = Math.min(Math.max(1, Number(page) || 1), pages);
  return { rows: rows.slice((cur - 1) * per, cur * per), total: n, page: cur, pages, size: per };
}
