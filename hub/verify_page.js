// verify_page.js — read back a published hub page and prove it matches the local file.
//
// Usage:
//   node verify_page.js <member_name> <page_slug> <local_html_path>
//
// Why this exists: publish.sh reports what the CLIENT thinks happened. A publish has
// looked successful while nothing committed, and has looked hung for fifteen minutes
// while the row had already landed. The only trustworthy confirmation is a SEPARATE
// read of the row.
//
// Compares CHARACTERS, not bytes: length() on a text column counts characters, and a
// UTF-8 byte count will differ from it by exactly the multi-byte characters in the
// page. It also compares a sha256 of the stored html against the local file, which is
// the check that actually proves the two are identical.
//
// READ ONLY. Same safety scope as push_to_hub.js: it only ever SELECTs from
// varman_aios.hub_pages, pinned to a single member_name. Don't repurpose it.
//
// Requires env var HUB_DB_URL. Optional PGSSL=require.

const fs = require('fs');
const crypto = require('crypto');
const { Client } = require('pg');

const [, , memberName, pageSlug, localPath] = process.argv;
if (!memberName || !pageSlug || !localPath){
  console.error('Usage: node verify_page.js <member_name> <page_slug> <local_html_path>');
  process.exit(1);
}
if (!process.env.HUB_DB_URL){
  console.error('Missing HUB_DB_URL environment variable.');
  process.exit(1);
}

const local = fs.readFileSync(localPath, 'utf8');
const localChars = local.length;
const localSha = crypto.createHash('sha256').update(local, 'utf8').digest('hex');

const client = new Client({
  connectionString: process.env.HUB_DB_URL,
  ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : false,
});

async function main(){
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, page_slug, page_title, updated_at,
              length(html_content)                        AS chars,
              encode(sha256(convert_to(html_content, 'UTF8')), 'hex') AS sha
         FROM varman_aios.hub_pages
        WHERE member_name = $1 AND page_slug = $2`,
      [memberName, pageSlug]
    );
    if (!rows.length){
      console.error('NOT FOUND — no row for that member and slug.');
      process.exit(1);
    }
    const r = rows[0];
    const charsOk = Number(r.chars) === localChars;
    const shaOk = r.sha === localSha;
    console.log('id          :', r.id);
    console.log('slug        :', r.page_slug);
    console.log('title       :', r.page_title);
    console.log('updated_at  :', r.updated_at.toISOString());
    console.log('characters  :', Number(r.chars).toLocaleString(),
                charsOk ? '(matches local)' : '*** LOCAL IS ' + localChars.toLocaleString());
    console.log('sha256      :', r.sha.slice(0, 16) + '…', shaOk ? '(matches local)' : '*** DIFFERS');
    if (!charsOk || !shaOk){
      console.error('\nVERIFY FAILED — the stored page is not the local file.');
      process.exit(1);
    }
    console.log('\nVERIFIED — the published page is byte-for-byte the local file.');
  } finally {
    await client.end();
  }
}
main().catch(e => {
  console.error(String(e.message).replace(/(postgres(ql)?:\/\/[^:/@]+:)[^@]*@/g, '$1***REDACTED***@'));
  process.exit(1);
});
