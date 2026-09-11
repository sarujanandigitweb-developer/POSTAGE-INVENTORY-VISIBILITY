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
// How long any held copy — in memory, on disk, or shipped with the build — may be
// served before the database is asked again. LEDSONE_DATA_TTL is in SECONDS.
//
// This is the knob that decides "live" versus "stale". It is deliberately not zero:
// tech_user allows TEN connections in total and shares them with pgAdmin and the
// 2-hourly refresh, so a page with six tables must not open six queries per viewer.
// Five minutes means a warm instance queries once per dataset per five minutes and
// every reader sees data no older than that.
const TTL = Math.max(0, Number(process.env.LEDSONE_DATA_TTL ?? 300)) * 1000;

// On globalThis, for the same reason the pool is: Next bundles each route handler
// separately and dev HMR re-evaluates modules, so a plain module-level Map is not
// one map — it is one per bundle, per reload. That is why the log showed
// `[dataset] built fixed-price` THREE times for what should have been a single
// build shared by the warm-up and the page's own prefetch. Three builds is also
// three times the connection pressure on a role that allows ten.
const STORE = Symbol.for('postage-inventory.dataset');
if (!globalThis[STORE]) globalThis[STORE] = {
  cache: new Map(), inflight: new Map(),
  // when each key was last ASKED FOR. The keep-warm ticker refreshes only keys a reader
  // has actually opened, so an idle server does no database work at all.
  seen: new Map(), ticker: null,
};
const { cache, inflight, seen } = globalThis[STORE];

// Survive a restart. Rebuilding Fixed Price costs ~3s and Slow-Moving ~11s against a
// role that only allows 10 connections, so paying that again every `npm run dev` —
// and making the first reader wait for it — is waste, not safety. The snapshot is
// written beside the app and reused while it is inside the TTL.
const DIR = path.join(process.cwd(), '.cache');
const file = key => path.join(DIR, key + '.json');

function readDiskAny(key) {
  try {
    const raw = fs.readFileSync(file(key), 'utf8');
    const { at, data } = JSON.parse(raw);
    return { at, data };
  } catch { /* no file, or an unreadable one */ }
  return null;
}

function readDisk(key) {
  const d = readDiskAny(key);
  return d && Date.now() - d.at < TTL ? d : null;
}

// HOW LONG A STALE COPY MAY STAND IN FOR A FRESH ONE while the rebuild runs behind it.
// Not unbounded: if every rebuild is failing, a reader must eventually be made to wait
// rather than be shown last week's figures indefinitely. An hour is far past the 300 s
// TTL and far short of a working day.
const MAX_STALE = Math.max(0, Number(process.env.LEDSONE_MAX_STALE ?? 3600)) * 1000;

/** The newest copy of a key REGARDLESS of age — memory, shipped snapshot, or disk. */
function newestAny(key) {
  const all = [cache.get(key), readShipped(key), readDiskAny(key)].filter(Boolean);
  if (!all.length) return null;
  return all.reduce((a, b) => (b.at > a.at ? b : a));
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
// the database, while it is still inside the TTL. It is a HEAD START, not the source:
// it spares the first reader of a fresh deployment a cold query, and once it ages out
// the database is read like anywhere else.
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

/** When was this dataset actually read from the database? */
export function shippedAt(key) {
  const s = readShipped(key);
  return s ? s.at : null;
}

/** Is this dataset currently being SERVED from a shipped snapshot — that is, does one
 *  exist AND is it still inside the TTL? A stale file on disk is not a snapshot in use. */
export function fromSnapshot(key) {
  const s = readShipped(key);
  return !!s && Date.now() - s.at < TTL;
}

// The build, started once and shared. Split out of getOrBuild() so the same promise can be
// awaited by a reader who has nothing to look at, or left running behind a reader who has.
function startBuild(key, build) {
  if (inflight.has(key)) return inflight.get(key);
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

// ---- KEEP WARM, BUT ONLY WHAT IS BEING READ ---------------------------------------
//
// Stale-while-revalidate already means nobody waits, but the first reader after a lapse
// still sees data one refresh-cycle old. This closes that: a key a reader has opened
// recently is rebuilt just BEFORE its TTL runs out, so the copy is normally fresh.
//
// It refreshes only keys someone has actually asked for, within the last IDLE_AFTER. An
// idle server does no database work at all, which matters because tech_user allows TEN
// connections in total and shares them with pgAdmin and the 2-hourly refresh.
//
// Strictly one at a time. Rebuilding Slow-Moving takes ~20 s and the pool is max 3; a
// parallel sweep would starve the reader it is meant to be helping.
const REFRESH_AT = 0.8;                 // refresh once a copy is 80% of the way to stale
const IDLE_AFTER = 30 * 60 * 1000;      // a key untouched for half an hour stops refreshing
let sweeping = false;

function keepWarm() {
  const st = globalThis[STORE];
  // LEDSONE_KEEP_WARM=0 turns the sweep off. It exists so the stale-while-revalidate path
  // can be measured on its own — with the sweep running a key in use never goes stale,
  // which is the point of it, and also means the fallback cannot be timed.
  if (st.ticker || !TTL || process.env.LEDSONE_KEEP_WARM === '0') return;
  // A quarter of the TTL, so a key cannot pass 80% unnoticed.
  st.ticker = setInterval(sweep, Math.max(15000, TTL / 4));
  st.ticker.unref?.();                  // never hold the process open
}

async function sweep() {
  if (sweeping) return;                 // a slow rebuild must not stack up behind itself
  sweeping = true;
  try {
    const now = Date.now();
    for (const [key, lastSeen] of seen) {
      if (now - lastSeen > IDLE_AFTER) { seen.delete(key); continue; }
      const held = cache.get(key);
      if (!held || inflight.has(key)) continue;
      if (now - held.at < TTL * REFRESH_AT) continue;
      const build = builders.get(key);
      if (!build) continue;             // nothing registered a way to rebuild this key
      try { await startBuild(key, build); }
      catch (e) { console.error('[dataset] keep-warm ' + key + ' failed:', e.message); }
    }
  } finally { sweeping = false; }
}

// How to rebuild each key, remembered from the caller that first asked for it. The ticker
// has no other way to know: getOrBuild() receives the build function, the ticker does not.
const builders = globalThis[STORE].builders ||= new Map();

export async function getOrBuild(key, build) {
  seen.set(key, Date.now());
  builders.set(key, build);
  keepWarm();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  if (inflight.has(key)) return inflight.get(key);

  // A SHIPPED SNAPSHOT IS A CACHE, NOT THE SOURCE. It used to be preferred over
  // everything and to never expire, which meant a deployed build served the data it was
  // built with FOREVER — the site showed the deploy day's figures three days later and
  // would never have moved on its own.
  //
  // It is now judged by the same TTL as everything else: inside the window it saves a
  // cold start a query, outside it the database is asked. Its OWN timestamp is kept, so
  // builtAt() reports when the data was read, not when this process happened to load it.
  const shipped = readShipped(key);
  if (shipped && Date.now() - shipped.at < TTL) {
    cache.set(key, { at: shipped.at, data: shipped.data });
    return shipped.data;
  }

  const onDisk = readDisk(key);
  if (onDisk) { cache.set(key, onDisk); return onDisk.data; }

  // ---- STALE-WHILE-REVALIDATE ------------------------------------------------------
  //
  // Everything above is a copy INSIDE the TTL. Past it, this used to fall through to an
  // awaited build() — so a reader who opened Slow-Moving five minutes after the last one
  // waited 20.8 s for 16,380 rows to be reassembled, and Inventory 7.7 s, every time the
  // TTL lapsed. The dataset was not missing; it was merely a few seconds too old.
  //
  // A copy that exists is now SERVED AT ONCE and the rebuild runs behind it. Nothing about
  // what gets built changes — the same build(), the same rows, the same order. Only the
  // waiting changes: the reader gets the previous answer now instead of the next answer in
  // twenty seconds, and the one after that is current.
  //
  // The staleness is not hidden. builtAt() reads this entry's own timestamp, so the "read
  // …" chip in the header reports when the data was actually read and goes on ageing until
  // the rebuild lands. Past MAX_STALE the copy is no longer good enough to stand in, and
  // the reader waits — which is what should happen if every rebuild is failing.
  // LEDSONE_STALE=0 restores the old behaviour — wait for the rebuild — so the two can be
  // measured against each other in one session rather than compared across runs.
  const stale = process.env.LEDSONE_STALE === '0' ? null : newestAny(key);
  const p = startBuild(key, build);
  if (stale && Date.now() - stale.at < MAX_STALE) {
    cache.set(key, stale);          // so builtAt() reports the age the reader is seeing
    console.log('[dataset] ' + key + ' served stale (' +
                Math.round((Date.now() - stale.at) / 1000) + 's old), refreshing behind');
    return stale.data;
  }
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
