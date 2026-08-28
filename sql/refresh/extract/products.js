'use strict';
// The catalogue: every real single SKU, with its description and image.
// Pure read. No writes, no credentials, deterministic output (ordered by SKU).
//
// THE FILTER IS LOAD-BEARING. inventory.products holds 16,423 single SKUs, of which
// 10,188 are ENC1..ENC10000, every one described "Combo Default Title." and every one
// inventory_bool = false — eBay combo placeholders, not products. 479 of them even carry
// stock mirrored from their components, so a stock filter would not catch them.
//
//   inventory_bool          real product, not a placeholder
//   sku NOT LIKE '%+%'      not a bundle
//   sku !~ '[0-9A-Z]PK$'    not a pack
//   NOT LIKE '%DUMMY%'      CRSFDUMMYSKU = "Dummy SKU for eBay"
const { q } = require('../db.js');

const SQL = `
  SELECT DISTINCT ON (upper(pr.sku))
         upper(pr.sku) AS sku,
         pr.id         AS pid,
         NULLIF(regexp_replace(trim(COALESCE(pr.description,'')), '\\s+', ' ', 'g'), '') AS d,
         (SELECT regexp_replace(i.image_url, '^.*/product_images/', '')::text
            FROM inventory.product_images i
           WHERE i.product_id = pr.id
           ORDER BY i.image_ordering NULLS LAST, i.id
           LIMIT 1) AS img
    FROM inventory.products pr
   WHERE pr.inventory_bool
     AND pr.sku NOT LIKE '%+%'
     AND pr.sku !~ '[0-9A-Z]PK$'
     AND upper(pr.sku) NOT LIKE '%DUMMY%'
   ORDER BY upper(pr.sku)`;

async function extract(client){
  const rows = await q(client, SQL);
  const bySku = {};
  rows.forEach(r => { bySku[r.sku] = { pid: r.pid, d: r.d, img: r.img }; });
  return { rows, bySku, count: rows.length };
}

module.exports = { extract, SQL };
