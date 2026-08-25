// rename_slug.js — rename a hub page's slug IN PLACE, keeping its id.
//
// Usage:
//   node rename_slug.js <member_name> <old_slug> <new_slug> "<new_title>"
//
// Why this exists: push_to_hub.js only runs an upsert keyed on
// (member_name, page_slug). Publishing under a different slug therefore
// INSERTS a new row instead of renaming the existing one. This script does the
// real rename with an UPDATE, and removes the duplicate row the upsert created.
//
// Same safety scope as push_to_hub.js: it only ever touches
// varman_aios.hub_pages, and every statement is additionally pinned to a single
// member_name so it can never affect anyone else's pages. Don't repurpose it.
//
// Requires env var HUB_DB_URL. Optional PGSSL=require.

const { Client } = require('pg');

const [, , memberName, oldSlug, newSlug, newTitle] = process.argv;

if (!memberName || !oldSlug || !newSlug || !newTitle) {
  console.error(
    'Usage: node rename_slug.js <member_name> <old_slug> <new_slug> "<new_title>"'
  );
  process.exit(1);
}

if (!process.env.HUB_DB_URL) {
  console.error('Missing HUB_DB_URL environment variable.');
  process.exit(1);
}

const client = new Client({
  connectionString: process.env.HUB_DB_URL,
  ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : false,
});

async function main() {
  await client.connect();
  try {
    const before = await client.query(
      `SELECT id, page_slug, page_title, length(html_content) AS bytes, updated_at
         FROM varman_aios.hub_pages
        WHERE member_name = $1 AND page_slug IN ($2, $3)
        ORDER BY id;`,
      [memberName, oldSlug, newSlug]
    );
    console.log('BEFORE:');
    before.rows.forEach((r) => console.log('  ', r));

    const keep = before.rows.find((r) => r.page_slug === oldSlug);
    const dupe = before.rows.find((r) => r.page_slug === newSlug);

    if (!keep) {
      console.error(`Nothing to rename: no row with page_slug='${oldSlug}'.`);
      process.exit(1);
    }

    // Both rows must hold the same HTML before the duplicate is removed,
    // otherwise the delete would lose content that only exists in the dupe.
    if (dupe && dupe.bytes !== keep.bytes) {
      console.error(
        `REFUSED — '${newSlug}' (${dupe.bytes}B) and '${oldSlug}' (${keep.bytes}B) ` +
          'differ. Republish the same HTML to both, or rename by hand.'
      );
      process.exit(1);
    }

    await client.query('BEGIN');
    // Drop the duplicate first: (member_name, page_slug) is unique, so the
    // rename below would collide with it.
    if (dupe) {
      const del = await client.query(
        `DELETE FROM varman_aios.hub_pages
          WHERE member_name = $1 AND page_slug = $2
          RETURNING id;`,
        [memberName, newSlug]
      );
      console.log(`deleted duplicate row id=${del.rows[0].id} (${newSlug})`);
    }
    const upd = await client.query(
      `UPDATE varman_aios.hub_pages
          SET page_slug = $3, page_title = $4, updated_at = now()
        WHERE member_name = $1 AND page_slug = $2
        RETURNING id, member_name, page_slug, page_title, updated_at;`,
      [memberName, oldSlug, newSlug, newTitle]
    );
    await client.query('COMMIT');
    console.log('AFTER:');
    upd.rows.forEach((r) => console.log('  ', r));

    const all = await client.query(
      `SELECT id, page_slug, page_title, length(html_content) AS bytes
         FROM varman_aios.hub_pages
        WHERE member_name = $1
        ORDER BY id;`,
      [memberName]
    );
    console.log(`\nall pages for ${memberName} (${all.rowCount}):`);
    all.rows.forEach((r) => console.log('  ', r));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
