import 'server-only';
import { getOrBuild } from './dataset.js';

// THE WHOLE-CATALOGUE READS, FETCHED ONCE AND SHARED.
//
// inventory.products and inventory.product_images were each read in full by three
// routes independently — Slow-Moving, SKU Fixed Price and Container Details — at
// 44,429 and 36,550 rows, about 5.8 MB and 2 MB per copy. The measurements in
// docs/performance/postgres-loading-analysis.md show the server plans and executes
// that products query in ~108 ms: the cost is the rows crossing the network, and it
// was being paid three times for identical data.
//
// NOT A NEW SOURCE OF TRUTH. It goes through the same getOrBuild() cache as every
// other dataset, keyed and TTL'd like the rest, so there is one cache with one policy.
// The SQL below is the UNION of what the three routes already asked for, and the
// FROM / WHERE / ORDER BY are byte-identical to all three originals — only the select
// list is widened, so every row and every value is the same as before.

// `title_norm` is Container Details' NAMES column, kept as the SAME SQL EXPRESSION
// rather than re-derived in JavaScript. SQL trim() strips spaces only while JS trim()
// strips all whitespace, so a title with a leading tab would normalise differently;
// keeping the expression in the database removes the question.
const PRODUCTS = `
  SELECT DISTINCT ON (upper(sku)) upper(sku) AS sku, id, title,
         inventory_bool AS single, created_at,
         NULLIF(regexp_replace(trim(COALESCE(title,'')), '\\s+', ' ', 'g'), '') AS title_norm
    FROM inventory.products WHERE sku IS NOT NULL AND sku <> '' ORDER BY upper(sku), id`;

const IMAGES = `
  SELECT DISTINCT ON (product_id) product_id AS pid, image_path AS p, image_url AS u
    FROM inventory.product_images ORDER BY product_id, image_ordering, id`;

/**
 * The shared catalogue. Pass the CALLER'S query function: the routes already hold a
 * client for the length of their build, and tech_user allows ten connections in total
 * — opening a second for the same request is how a page with six tables exhausts it.
 */
export function catalogue(q) {
  return getOrBuild('catalogue', async () => ({
    products: await q(PRODUCTS),
    images: await q(IMAGES),
  }));
}
