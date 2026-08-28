'use strict';
// The single place the LEDSone connection is built. Credentials are read at run time
// from the gitignored .env at the project root and are NEVER written anywhere else —
// not into the dashboard, not into a log, not into an error message.
//
// The dashboard is published to a public hub URL. Nothing in this file may reach it.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.resolve(__dirname, '..', '..');
const ENV = path.join(ROOT, '.env');

function readEnv(){
  if (!fs.existsSync(ENV)) throw new Error('Missing ' + ENV + ' — see example.env');
  const env = {};
  fs.readFileSync(ENV, 'utf8').split('\n').forEach(line => {
    const l = line.trim();
    if (!l || l.startsWith('#') || l.indexOf('=') === -1) return;
    const i = l.indexOf('=');
    env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  });
  ['LEDSONE_HOST','LEDSONE_PORT','LEDSONE_DB','LEDSONE_USER','LEDSONE_PASSWORD']
    .forEach(k => { if (!env[k]) throw new Error('Missing ' + k + ' in .env'); });
  return env;
}

// a password can surface inside a driver error; scrub every message that leaves here
function redact(e, pw){
  const s = String(e && e.message ? e.message : e);
  return pw ? s.split(pw).join('***REDACTED***') : s;
}

async function connect(){
  const env = readEnv();
  const client = new Client({
    host: env.LEDSONE_HOST, port: Number(env.LEDSONE_PORT),
    database: env.LEDSONE_DB, user: env.LEDSONE_USER, password: env.LEDSONE_PASSWORD,
    ssl: (env.LEDSONE_SSLMODE || 'require') === 'disable' ? false : { rejectUnauthorized: false },
    statement_timeout: 300000,
    application_name: 'postage-inventory-refresh'
  });
  client.__pw = env.LEDSONE_PASSWORD;
  try { await client.connect(); }
  catch (e){ throw new Error('connect failed: ' + redact(e, env.LEDSONE_PASSWORD)); }
  return client;
}

async function q(client, sql, params){
  try { return (await client.query(sql, params || [])).rows; }
  catch (e){ throw new Error('query failed: ' + redact(e, client.__pw)); }
}

module.exports = { connect, q, redact };
