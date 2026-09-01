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

let pool = null;
function getPool() {
  if (pool) return pool;
  const env = readEnv();
  pool = new pg.Pool({
    host: env.LEDSONE_HOST,
    port: Number(env.LEDSONE_PORT),
    database: env.LEDSONE_DB,
    user: env.LEDSONE_USER,
    password: env.LEDSONE_PASSWORD,
    ssl: (env.LEDSONE_SSLMODE || 'require') === 'disable' ? false : { rejectUnauthorized: false },
    max: 4,                       // tech_user has a connection limit — stay well under it
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
    statement_timeout: 120000,
    application_name: 'postage-inventory-next',
  });
  // an idle-client error must not take the process down
  pool.on('error', e => console.error('[db] idle client error:', redact(e)));
  return pool;
}

/** Run a read-only query. Returns rows. Throws with the password scrubbed. */
export async function query(sql, params = []) {
  try {
    const res = await getPool().query(sql, params);
    return res.rows;
  } catch (e) {
    throw new Error('query failed: ' + redact(e));
  }
}

/** Several queries on one connection, for anything that must see one snapshot. */
export async function withClient(fn) {
  const client = await getPool().connect();
  try {
    return await fn((sql, params = []) => client.query(sql, params).then(r => r.rows));
  } catch (e) {
    throw new Error('query failed: ' + redact(e));
  } finally {
    client.release();
  }
}
