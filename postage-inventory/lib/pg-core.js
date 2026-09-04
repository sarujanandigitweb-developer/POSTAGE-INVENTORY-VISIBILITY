// Core LEDSone connection. Imported by lib/db.js (which adds the server-only
// guard) and by sql/smoke.mjs, which has to run outside a React Server bundle.
// Nothing here may be imported from a client component — use lib/db.js.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const REQUIRED = ['LEDSONE_HOST', 'LEDSONE_PORT', 'LEDSONE_DB', 'LEDSONE_USER', 'LEDSONE_PASSWORD'];

// Walk up from the app directory until a .env turns up, so the app works whether
// it is started from postage-inventory/ or from the repo root.
function findEnvFile() {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('No .env found from ' + process.cwd() + ' upwards — see the repo root example.env');
}

let cachedEnv = null;
function readEnv() {
  if (cachedEnv) return cachedEnv;

  // A HOSTED DEPLOYMENT HAS NO .env FILE. The comment below used to say "process.env
  // wins, so a deployment can inject secrets without a file on disk" — but findEnvFile()
  // ran first and THREW when no file existed, so the merge was never reached. On Vercel,
  // where .env is gitignored and the values come from the dashboard, every database
  // request would have failed with "No .env found". The environment is checked first.
  if (REQUIRED.every(k => process.env[k])) {
    cachedEnv = Object.fromEntries(REQUIRED.map(k => [k, process.env[k]]));
    if (process.env.LEDSONE_SSLMODE) cachedEnv.LEDSONE_SSLMODE = process.env.LEDSONE_SSLMODE;
    return cachedEnv;
  }

  const file = findEnvFile();
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const l = line.trim();
    if (!l || l.startsWith('#') || !l.includes('=')) continue;
    const i = l.indexOf('=');
    env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  // process.env wins, so a deployment can inject secrets without a file on disk
  for (const k of REQUIRED) if (process.env[k]) env[k] = process.env[k];
  const missing = REQUIRED.filter(k => !env[k]);
  if (missing.length) throw new Error('Missing in .env: ' + missing.join(', '));
  cachedEnv = env;
  return env;
}

// A password can surface inside a driver error string. Scrub anything leaving here.
export function redact(err) {
  const s = String(err && err.message ? err.message : err);
  const pw = cachedEnv && cachedEnv.LEDSONE_PASSWORD;
  return pw ? s.split(pw).join('***REDACTED***') : s;
}

// ONE pool for the whole server, kept on globalThis.
//
// A module-level `let pool` is not enough: Next bundles each route handler
// separately, so each of the five routes got its OWN pool. Five pools x max 4 is
// up to 20 sockets against a role limit of 10, and tech_user answers with
// "too many connections" — which is exactly what the log showed, with whichever
// route happened to ask first succeeding and the rest failing.
//
// On globalThis it is shared across route bundles and survives dev hot-reloads,
// which would otherwise leak a pool per edit.
const KEY = Symbol.for('postage-inventory.pgpool');
function getPool() {
  if (globalThis[KEY]) return globalThis[KEY];
  const env = readEnv();
  const pool = new pg.Pool({
    host: env.LEDSONE_HOST,
    port: Number(env.LEDSONE_PORT),
    database: env.LEDSONE_DB,
    user: env.LEDSONE_USER,
    password: env.LEDSONE_PASSWORD,
    ssl: (env.LEDSONE_SSLMODE || 'require') === 'disable' ? false : { rejectUnauthorized: false },
    // tech_user is capped at 10 and other clients share it — a pgAdmin session was
    // holding 9. Three leaves room for the 2-hourly refresh, which must never be
    // starved by this app. Requests past three QUEUE in the pool rather than
    // opening a socket the server will refuse.
    max: 3,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
    statement_timeout: 120000,
    application_name: 'postage-inventory-next',
  });
  // an idle-client error must not take the process down
  pool.on('error', e => console.error('[db] idle client error:', redact(e)));
  globalThis[KEY] = pool;
  return pool;
}

// tech_user is shared. When another client (a pgAdmin session was holding 9 of the
// 10) has taken the role to its limit, connecting fails outright rather than
// queueing — the pool can only queue against ITS own max, not the server's. A short
// backoff rides out a burst instead of turning it into a 500 the reader sees.
const LIMIT_HIT = e => /too many connections/i.test(String(e && e.message));
const wait = ms => new Promise(r => setTimeout(r, ms));

async function withRetry(fn, what) {
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      if (!LIMIT_HIT(e)) break;
      if (attempt < 3) await wait(400 * Math.pow(2, attempt));   // 0.4s, 0.8s, 1.6s
    }
  }
  throw new Error(what + ' failed: ' + redact(last));
}

/** Run a read-only query. Returns rows. Throws with the password scrubbed. */
export async function query(sql, params = []) {
  return withRetry(async () => (await getPool().query(sql, params)).rows, 'query');
}

/** Several queries on one connection, for anything that must see one snapshot. */
export async function withClient(fn) {
  return withRetry(async () => {
    const client = await getPool().connect();
    try {
      return await fn((sql, params = []) => client.query(sql, params).then(r => r.rows));
    } finally {
      client.release();
    }
  }, 'query');
}
