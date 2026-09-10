import { withClient, query } from '@/lib/db';
import { getOrBuild, fromSnapshot, builtAt } from '@/lib/dataset';
import { textMatches, matches } from '@/lib/filter';
import { STOCK_KEYS, stockLevel } from '@/lib/stock';
import { pageParams, runQuery, optionsFor, applyFilters, sortRows } from '@/lib/query';
import { classification, CATEGORY_ORDER, skusIn, sectionCounts, imgURL } from '@/lib/classification';
import { sectionOf } from '@/lib/section-of';
import { classifySKU } from '@/lib/classify-sku';
import { shopifyPricing } from '@/lib/shopify-price';

const SECTION_KEYS = new Set(CATEGORY_ORDER);
import { parseLine, region as histRegion } from '@/lib/history-parser';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from '@/lib/data-dir';

// PRICE COMMENT IS NOT IN POSTGRES. It is produced by a separate pass of the
// 2-hourly pipeline (sql/build-shopify-comments.js), which reads a Trello export —
// there is no query that returns it. The pipeline's own output is reused rather
// than the value being invented or the column quietly dropped. It is the one field
// on this tab that is file-sourced, and only as fresh as the last pipeline run:
// re-copy sql/refresh/out/shopify-comments.json to data/price-comments.json.
//
// The PRICE follows the same route, and for the same reason. It is not `min(price)`
// over the UK channels — that is what this route used to do, and it left LSFC160BT
// blank where the dashboard shows £12.22. The real rule is a five-tier match:
//   1 exact SKU · 2 a combo with exactly ONE '+' · 3 a pack · 4 a larger combo · 5 none
// with LEDSone winning at EVERY tier before price is considered, and combos
// decomposed to find which listing actually contains this SKU. Roughly 200 lines.
//
// A £ figure may only come from a UK channel. A euro or dollar listing is a
// DIFFERENT number, not a cheaper one, so it goes to its own column carrying its
// currency — which is why LSFC300BG reads "€12.89 EUR" and not "£12.89".
//
// Re-deriving that here would be a second implementation of a validated rule, free
// to drift. These three files are the pipeline's own output; re-copy them from
// sql/refresh/out/ when it next runs.
// The three pipeline files this route used to read — price, alt price and price
// comment — are gone: lib/shopify-price.js derives all three live, and reproduces the
// pipeline's own output with zero differences on 6,183 SKUs. data/price.json is left on
// disk as a record of the last pipeline run; nothing reads it.

// The browser calls this route; only this route touches PostgreSQL.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// --- SQL ported from ../sql/refresh/extract/{products,stock,price}.js ---------
//
// The products filter is load-bearing, not tidiness. inventory.products holds
// ~16.4k single SKUs of which ~10.2k are ENC* eBay combo placeholders, all
// described "Combo Default Title." and all inventory_bool = false. 479 of them
// even carry stock mirrored from their components, so filtering on stock would
// not catch them.
// EVERY CATALOGUE SKU, so a product added since the last export still appears.
// FILTERED EXACTLY AS PRODUCTS IS, all four conditions. The first version carried only
// inventory_bool, so this list offered SKUs the row query then dropped — packs, combos
// and two DUMMY test rows — and the "placed by rule" count overstated by 275. The two
// must agree on what counts as a product or the section's list and its rows disagree.
const ALL_SKUS_LIVE = `
  SELECT DISTINCT upper(pr.sku) AS sku
    FROM inventory.products pr
   WHERE pr.inventory_bool
     AND pr.sku IS NOT NULL AND pr.sku <> ''
     AND pr.sku NOT LIKE '%+%'
     AND pr.sku !~ '[0-9A-Z]PK$'
     AND upper(pr.sku) NOT LIKE '%DUMMY%'`;

const PRODUCTS = `
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
     AND upper(pr.sku) = ANY($1)
     AND pr.sku NOT LIKE '%+%'
     AND pr.sku !~ '[0-9A-Z]PK$'
     AND upper(pr.sku) NOT LIKE '%DUMMY%'
   ORDER BY upper(pr.sku)`;

const STOCK = `
  SELECT inventory, warehouse, quantity,
         NULLIF(NULLIF(trim(product_shelf_location), ''), '-') AS loc
    FROM inventory.physical_product_stock
   WHERE inventory = ANY($1)`;

// SKU column only, over the whole catalogue. Scoping the main query to one
// category means it can no longer notice a SKU that Postgres has and the curated
// arrays do not — and build.js's contract is that those are reported, never
// silently dropped. This is cheap and cached, so the contract survives.
const ALL_SKUS = `
  SELECT DISTINCT upper(pr.sku) AS sku
    FROM inventory.products pr
   WHERE pr.inventory_bool
     AND pr.sku NOT LIKE '%+%'
     AND pr.sku !~ '[0-9A-Z]PK$'
     AND upper(pr.sku) NOT LIKE '%DUMMY%'`;

// Containers a SKU has actually arrived on, newest last. "Latest" is ORDER BY
// order_date — never a text maximum of the name ('Container 9' > 'Container 16'
// under a text maximum, wrong on 39% of pairs).
const ARRIVED = `
  SELECT DISTINCT upper(oi.sku) AS sku,
         CASE WHEN COALESCE(fc.main_container, cc.main_container) IN ('DE','GERMAN') THEN 'DE'
              ELSE COALESCE(fc.main_container, cc.main_container) END AS region,
         COALESCE(fc.name, cc.name) AS cname,
         o.order_date::text AS od
    FROM suppliers.order_items oi
    JOIN suppliers.orders o ON o.id = oi.order_id
    LEFT JOIN suppliers.final_containers fc ON fc.id = oi.final_container_id
    LEFT JOIN suppliers.containers      cc ON cc.id = oi.assigned_container_id
   WHERE o.status_arrived
     AND upper(oi.sku) = ANY($1)
     AND COALESCE(fc.name, cc.name) IS NOT NULL
     AND upper(trim(COALESCE(fc.name, cc.name))) NOT IN ('UNASSIGN','UNASSIGNED','N/A','-')
     AND o.order_date IS NOT NULL`;

// Stock on a container that has NOT arrived yet — kept visually distinct from
// stock on the shelf so a picker cannot mistake one for the other.
const INCOMING = `
  SELECT DISTINCT upper(oi.sku) AS sku,
         COALESCE(fc.name, cc.name) AS cname,
         CASE WHEN o.status_shipped             THEN 'Shipped'
              WHEN o.status_finished_production THEN 'Production done'
              WHEN o.status_confirmed           THEN 'Confirmed'
              ELSE 'Ordered' END AS stage
    FROM suppliers.order_items oi
    JOIN suppliers.orders o ON o.id = oi.order_id
    LEFT JOIN suppliers.final_containers fc ON fc.id = oi.final_container_id
    LEFT JOIN suppliers.containers      cc ON cc.id = oi.assigned_container_id
   WHERE NOT o.status_arrived
     AND upper(oi.sku) = ANY($1)
     AND COALESCE(fc.name, cc.name) IS NOT NULL
     AND upper(trim(COALESCE(fc.name, cc.name))) NOT IN ('UNASSIGN','UNASSIGNED','N/A','-')`;

// Stock-movement history. There is no movement table — the lines live as free text
// on inventory.product_history, which is why the shipped parser is reused.
const HISTORY = `
  SELECT upper(p.sku) AS sku, trim(l.line) AS line
    FROM inventory.products p
    JOIN inventory.product_history h ON h.inventory_id = p.id,
    LATERAL unnest(string_to_array(h.history, E'\\n')) WITH ORDINALITY AS l(line, ord)
   WHERE upper(p.sku) = ANY($1)
     AND trim(l.line) <> ''
     AND (l.line ILIKE '%UK stock changes%'
       OR trim(l.line) ILIKE 'Supply%'
       OR trim(l.line) ILIKE 'German Supply%'
       OR l.line ~* 'german ?Inventory +Changed +from')`;

const WAREHOUSES = `
  SELECT warehouse, warehouse_name, warehouse_location
    FROM inventory.warehouse ORDER BY warehouse`;

// Shopify price: LEDSone first, then the other UK stores. Only a UK channel may
// fill the £ column — a euro or dollar figure is a different number, not a
// cheaper one.

// dashboard column -> warehouse id, and which of those also carry a shelf location
const COL = { a: 1, b: 8, c: 6, u5: 33, k: 10, m: 7, ca: 4, us: 32 };

// ---------------------------------------------------------------------------------
// THE PAGE, CHOSEN BY THE DATABASE.
//
// Filtering, ordering, counting and cutting all happen here, in SQL, over the candidate
// SKUs — so the detail queries below run for the 25 rows on screen instead of the 1,487
// in the section.
//
// WHY THE CANDIDATES ARE PASSED IN RATHER THAN SELECTED. An Inventory row draws on three
// sources, and only one of them is this database. Section, family, sub-category, type and
// fitting come from data/classification.json; the Shopify price comes from
// data/price.json. There is no column to filter or ORDER BY for any of them, and
// `tech_user` cannot create one — it has no CREATE on the schema. So the local half is
// resolved locally, for free, and arrives as three parallel arrays: the SKU, the value to
// order by, and the text those local fields contribute to a search. The database does the
// half that is genuinely its own — description, stock, ordering, counting, LIMIT.
//
// EVERY PREDICATE MIRRORS lib/filter.js EXACTLY, and the differences matter:
//   * `pos` / `neg` ask whether ANY selected warehouse column holds such a value, and a
//     warehouse with no row counts as 0 — so they can only be true where a row exists.
//   * `zero` asks whether EVERY selected column is 0, which includes columns with no row
//     at all; it is written as "no non-zero exists", not as "sum = 0", because +5 and -5
//     sum to zero and are not two zeroes.
//   * `low` / `out` read the TOTAL across all eight columns and ignore the warehouse
//     filter entirely, exactly as stockLevel() does.
// The WHERE clause on inventory.products repeats ALL_SKUS_LIVE's own exclusions so the
// candidate set cannot widen: no combos, no pack codes, no DUMMY.
const PAGE_SKUS = `
  WITH cand AS (
    SELECT * FROM unnest($1::text[], $2::float8[], $3::text[]) AS t(sku, ord, hay)
  ), base AS (
    SELECT DISTINCT ON (upper(pr.sku))
           upper(pr.sku) AS sku, pr.id AS pid, c.ord, c.hay,
           lower(COALESCE(regexp_replace(trim(COALESCE(pr.description,'')), '\\s+', ' ', 'g'), '')) AS d
      FROM inventory.products pr
      JOIN cand c ON c.sku = upper(pr.sku)
     WHERE pr.inventory_bool
       AND pr.sku IS NOT NULL AND pr.sku <> ''
       AND pr.sku NOT LIKE '%+%'
       AND pr.sku !~ '[0-9A-Z]PK$'
       AND upper(pr.sku) NOT LIKE '%DUMMY%'
     ORDER BY upper(pr.sku)
  ), agg AS (
    SELECT b.sku, b.ord, (b.hay || ' ' || b.d) AS hay,
           COALESCE(sum(st.quantity) FILTER (WHERE st.warehouse = ANY($4::int[])), 0) AS tot,
           COALESCE(bool_or(st.quantity > 0) FILTER (WHERE st.warehouse = ANY($5::int[])), false) AS any_pos,
           COALESCE(bool_or(st.quantity < 0) FILTER (WHERE st.warehouse = ANY($5::int[])), false) AS any_neg,
           COALESCE(bool_or(st.quantity <> 0) FILTER (WHERE st.warehouse = ANY($5::int[])), false) AS any_nonzero
      FROM base b
      LEFT JOIN inventory.physical_product_stock st ON st.inventory = b.pid
     GROUP BY b.sku, b.ord, b.hay, b.d
  ), hit AS (
    SELECT * FROM agg
     WHERE ($6::text[] IS NULL OR hay LIKE ALL ($6::text[]))
       AND ($7::text IS NULL
            OR ($7 = 'pos'  AND any_pos)
            OR ($7 = 'neg'  AND any_neg)
            OR ($7 = 'zero' AND NOT any_nonzero)
            OR ($7 = 'low'  AND tot > 0 AND tot <= 10)
            OR ($7 = 'out'  AND tot <= 0))
  )
  SELECT sku, tot, count(*) OVER () AS total
    FROM hit
   ORDER BY
     -- TEXT SORTS ARRIVE AS NUMBERS. ord is a rank the route computed with the very
     -- comparator lib/query.js uses, because SQL's collation is not JavaScript's
     -- localeCompare(numeric:true) and "LSFC10" would land either side of "LSFC9"
     -- depending on which did the sorting. Ranking in JS and ordering by the rank keeps
     -- one comparator in the system.
     CASE WHEN $8 = 'ord_asc'  THEN ord END ASC  NULLS LAST,
     CASE WHEN $8 = 'ord_desc' THEN ord END DESC NULLS LAST,
     CASE WHEN $8 = 'tot_asc'  THEN tot END ASC  NULLS LAST,
     CASE WHEN $8 = 'tot_desc' THEN tot END DESC NULLS LAST,
     CASE WHEN $8 = 'sku_desc' THEN sku END DESC,
     sku            -- the tie-break: unique, so no row can move between pages
   LIMIT $9 OFFSET $10`;

// The header's two figures, over the WHOLE set rather than the page, without shipping the
// set to count it. Same rule as stockLevel(): total across all eight columns, out at zero
// or below, low at ten or below.
const ALERTS = `
  WITH t AS (
    SELECT pr.id,
           COALESCE(sum(st.quantity) FILTER (WHERE st.warehouse = ANY($2::int[])), 0) AS tot
      FROM inventory.products pr
      LEFT JOIN inventory.physical_product_stock st ON st.inventory = pr.id
     WHERE upper(pr.sku) = ANY($1::text[])
     GROUP BY pr.id
  )
  SELECT count(*) FILTER (WHERE tot <= 0)                AS out,
         count(*) FILTER (WHERE tot > 0 AND tot <= 10)   AS low
    FROM t`;
const LOC = { al: 1, bl: 8, kl: 10, ml: 7 };
const WH_OVERRIDE = { 33: 'UK Unit 5' };   // no row in inventory.warehouse yet

// Cached for the process, and NEVER awaited on the request path. Awaiting it put
// the whole-catalogue scan in front of the first paint — 7.3s instead of 2.1s,
// which is exactly the delay this endpoint was scoped to avoid. It runs in the
// background instead: the first response says the check is pending, every one
// after it carries the list.
let unplacedCache = null;
let unplacedRunning = false;
function unplacedSkus(fromSnapshot) {
  // A DEPLOYMENT SERVING SNAPSHOTS MUST NOT OPEN A CONNECTION — not even in the
  // background. This check is a diagnostic (which SKUs are missing from the curated
  // classification), and it was firing one query per request against a role that allows
  // ten. It is answered by whoever builds the snapshots, not by the hosted app.
  if (fromSnapshot) return { pending: false, list: [], skipped: 'served from a snapshot' };
  const fresh = unplacedCache && Date.now() - unplacedCache.at < 10 * 60 * 1000;
  if (!fresh && !unplacedRunning) {
    unplacedRunning = true;
    query(ALL_SKUS)
      .then(rows => {
        const { cls } = classification();
        unplacedCache = { at: Date.now(), list: rows.map(r => r.sku).filter(s => !cls[s]).sort() };
      })
      .catch(e => console.error('[api/inventory] unplaced check failed:', e.message))
      .finally(() => { unplacedRunning = false; });
  }
  return unplacedCache ? unplacedCache.list : null;
}

// The classifier's answer in the shape a curated entry has, so the row builder does
// not care which of the two it got.
function derive(sku) {
  const g = classifySKU(sku);
  if (!g.key) return null;
  return { key: g.key, f: g.famCode ?? null, t: g.subCategory || 'Other' };
}

// EVERY SECTION'S OWN ROWS, FILTERED. Not a new query and not a new source of truth:
// each section is read through the SAME getOrBuild key the category view uses, so a row
// found by a search is byte-for-byte the row that section would have shown. That is why
// this loops the twelve rather than running one wider query — a second query path would
// be a second thing to keep in step with buildSnapshot().
//
// Cost is paid once. The sections are cached individually and a deployment ships all
// twelve as snapshots (scripts/build-snapshots.mjs walks CATEGORY_ORDER), so there the
// first search opens no connection at all. Locally, with no snapshots, the first search
// builds whatever sections have not been visited yet; every search after that is a
// filter over memory.
async function searchAll(openCat, q) {
  const { sections: secs } = classification();
  const rows = [];
  const perSection = {};
  let warehouses = {}, missingWarehouses = [];
  for (const k of CATEGORY_ORDER) {
    const d = await getOrBuild('inventory-' + k, () => buildSnapshot(k));
    // The section's own name, and its label for each family code — the two fields the
    // published dashboard calls `mc` and `sc`. Read once per section, not per row.
    const mc = secs[k]?.name || k;
    const famLabel = new Map((secs[k]?.fams || []).map(f => [f.code, f.label || f.value || f.code]));
    // Every row already carries `key` — its own section — because buildSnapshot writes it,
    // so a mixed result set is self-describing. `mc`/`sc` are added to the COPY that is
    // sent, never to the cached row: the snapshot is shared with the category view and
    // must stay exactly what that view was built to return.
    const hit = [];
    for (const r of d.rows) {
      const sc = r.f ? (famLabel.get(r.f) || r.f) : (r.t || '');
      if (textMatches(r, q, mc + ' ' + sc)) hit.push({ ...r, mc, sc });
    }
    if (hit.length) { rows.push(...hit); perSection[k] = hit.length; }
    // The warehouse list is the same query for every section; the first one that answers
    // is the answer. Merged rather than taken from the open category so the dropdown is
    // still populated when the open category happens to be empty.
    if (!Object.keys(warehouses).length && d.warehouses) warehouses = d.warehouses;
    if (d.missingWarehouses?.length) {
      for (const w of d.missingWarehouses) if (!missingWarehouses.includes(w)) missingWarehouses.push(w);
    }
  }
  // The MATCHING SET, not a response. The caller applies the rest of the filters, sorts
  // and cuts one page out of it — a search that matches 1,036 SKUs must not put 1,036
  // SKUs on the wire just because the reader typed four letters.
  return {
    rows, perSection, warehouses, missingWarehouses, sections: secs,
    asOf: CATEGORY_ORDER.map(k => builtAt('inventory-' + k)).filter(Boolean).sort()[0]
          || new Date().toISOString(),
  };
}

// THE LIVE SKU UNIVERSE. One query, no category in it, so it is cached under its own key
// instead of being re-run by every section — it was 772ms of the 4.4s each one cost.
const liveSkus = () => getOrBuild('inv-live-skus',
  async () => (await query(ALL_SKUS_LIVE)).map(r => r.sku));

const WH_IDS = Object.values(COL);

// THE HALF OF THE FILTER THAT IS NOT IN THIS DATABASE.
//
// Section, family, sub-category, type and fitting live in data/classification.json, so
// they are resolved here — free, no round trip — and the survivors are handed to SQL as
// the candidate set. Both placement tests are applied, and in the same order the build
// applies them: sectionOf() chooses the section, and the curated entry (or the
// classifier) has to agree, because buildRows() drops a row whose entry disagrees. Miss
// either and the candidate set would not be the section.
function candidates({ live, cls, secs, cat, st, searching }) {
  const out = [];
  for (const sku of live) {
    const placed = sectionOf(sku);
    if (placed.how === 'unplaced') continue;
    const c = cls[sku] || derive(sku);
    if (!c || c.key !== placed.key) continue;
    if (!searching && c.key !== cat) continue;

    const cfg = secs[c.key];
    // Category-scoped, so skipped while searching — exactly as lib/filter.js skips them.
    if (!searching) {
      if (st.fam && c.f !== st.fam) continue;
      if (st.sub2 && cfg?.sub2 && c[cfg.sub2.key] !== st.sub2) continue;
      if (st.attr && cfg?.attr && c[cfg.attr.key] !== st.attr) continue;
    }
    // What the LOCAL fields contribute to a search. The description is added in SQL. mc
    // and sc only exist on a search result, so they are only offered on a search.
    const parts = [sku, c.t || '', c.f || '', c.sh || '', c.ft || ''];
    if (searching) {
      parts.push(secs[c.key]?.name || c.key);
      parts.push(c.f ? ((secs[c.key]?.fams || []).find(f => f.code === c.f)?.label || c.f) : (c.t || ''));
    }
    out.push({ sku, c, hay: parts.join(' ').toLowerCase() + ' ' });
  }
  return out;
}

/**
 * ONE PAGE, CHOSEN BY POSTGRESQL.
 *
 *   local classification  ->  candidate SKUs
 *          |
 *   PAGE_SKUS  ->  description match, stock conditions, ORDER BY, COUNT, LIMIT/OFFSET
 *          |
 *   buildRows()  ->  the SAME builder the snapshot uses, for 25 SKUs instead of 1,487
 *
 * The detail queries — products, stock, containers, history, pricing — run for the SKUs
 * on the page and nothing else. That is the whole point: the section is never assembled.
 */
function pagedFromSql({ key, q, st, sortKey, dir, page, size }) {
  return withClient(async run => {
    const { cls, sections: secs } = classification();
    const live = await liveSkus();
    const searching = !!q;
    const cand = candidates({ live, cls, secs, cat: key, st, searching });

    // TEXT SORTS ARE RANKED HERE, WITH lib/query.js's OWN COMPARATOR, and the rank is what
    // SQL orders by. Postgres collation and JavaScript localeCompare(numeric:true) do not
    // agree about "LSFC10" against "LSFC9", and a paginated list that disagrees with
    // itself between pages is worse than either order.
    // The rank encodes BOTH the direction and the ascending SKU tie-break, so SQL only
    // ever orders by it ascending. Ranking ascending and reversing in SQL would reverse
    // the tie-break as well, putting the SKUs within one type backwards.
    const LOCAL_SORT = { sku: x => x.sku, type: x => x.c.t };
    const ordOf = new Map();
    let ranked = false;
    if (LOCAL_SORT[sortKey]) {
      const proj = cand.map(x => ({ s: x.sku, v: LOCAL_SORT[sortKey](x) }));
      sortRows(proj, { key: 'v', dir, unique: 's' }).forEach((r, i) => ordOf.set(r.s, i));
      ranked = true;
    } else if (searching && !sortKey) {
      // Unsorted, a search reads section by section in CATEGORY_ORDER — that is the order
      // searchAll builds it in, and it is what the "across N categories" line describes.
      for (const x of cand) ordOf.set(x.sku, CATEGORY_ORDER.indexOf(x.c.key));
      ranked = true;
    }

    // Every term must appear somewhere in (local fields + description). LIKE ALL() takes
    // the terms as an array, so one query serves any number of them and no term is ever
    // concatenated into the SQL.
    const terms = searching
      ? q.toLowerCase().split(/\s+/).filter(Boolean).map(t => '%' + t.replace(/([%_\\])/g, '\\$1') + '%')
      : null;

    const selWh = st.wh && COL[st.wh] !== undefined ? [COL[st.wh]] : WH_IDS;
    // A local sort is already a rank; stock is a database value and is ordered as one.
    // No sort at all falls through to the SKU tie-break, which is the order the section
    // build produces anyway (PRODUCTS is ORDER BY upper(sku)).
    const order = ranked ? 'ord_asc'
                : sortKey === 'stock' ? (dir === 'desc' ? 'tot_desc' : 'tot_asc')
                : 'sku_asc';

    const picked = cand.length ? await run(PAGE_SKUS, [
      cand.map(x => x.sku),
      cand.map(x => (ranked ? ordOf.get(x.sku) ?? null : null)),
      cand.map(x => x.hay),
      WH_IDS,                       // $4 — the eight columns stockLevel() totals
      selWh,                        // $5 — the columns pos/neg/zero look at
      terms && terms.length ? terms : null,
      st.st || null,
      order,
      size,
      (page - 1) * size,
    ]) : [];

    const total = picked.length ? Number(picked[0].total) : 0;
    const pages = Math.max(1, Math.ceil(total / size));
    // A page past the end is re-asked for rather than returned empty — narrowing a filter
    // while sitting on page 40 would otherwise show nothing under a pager saying 3.
    if (page > pages && total > 0) {
      return pagedFromSql({ key, q, st, sortKey, dir, page: pages, size });
    }

    const skus = picked.map(r => r.sku);
    const built = skus.length
      ? await buildRows(run, searching ? null : key, skus, 0, cand.map(x => x.sku))
      : { rows: [], warehouses: {}, missingWarehouses: [] };

    // buildRows() returns its rows in SKU order, because that is the order PRODUCTS
    // returns them in. The page's order is the one SQL just decided, so it is reapplied
    // here rather than re-derived.
    const bySku = new Map(built.rows.map(r => [r.s, r]));
    const rows = skus.map(k => bySku.get(k)).filter(Boolean);
    if (searching) for (const r of rows) {
      const c = cls[r.s] || derive(r.s) || {};
      r.mc = secs[c.key]?.name || c.key || '';
      r.sc = c.f ? ((secs[c.key]?.fams || []).find(f => f.code === c.f)?.label || c.f) : (c.t || '');
    }

    // The two header figures and the option lists describe the WHOLE set, not the page —
    // the alerts by one aggregate that returns two numbers, the options from the local
    // classification, which is where those values live anyway.
    const [alertRow] = cand.length ? await run(ALERTS, [cand.map(x => x.sku), WH_IDS]) : [{ out: 0, low: 0 }];
    const cfg = secs[key] || null;
    const optsFrom = f => {
      const base = candidates({ live, cls, secs, cat: key, st: { ...st, [f]: '' }, searching });
      return optionsFor(base.map(x => x.c), cfg?.[f]?.key);
    };

    const perSection = {};
    if (searching) for (const r of rows) perSection[r.key] = (perSection[r.key] || 0) + 1;

    return Response.json({
      ok: true,
      cat: key,
      search: q || null,
      // Counted over the candidate set, not the page — a search that matched 1,036 SKUs
      // has to be able to say so while shipping 25.
      perSection: searching ? sectionCountsIn(cand) : null,
      asOf: new Date().toISOString(),
      count: total, total, sectionTotal: cand.length,
      page: Math.min(page, pages), pages, size,
      sort: sortKey || null, dir,
      sub2Options: cfg?.sub2 ? optsFrom('sub2') : null,
      attrOptions: cfg?.attr ? optsFrom('attr') : null,
      alerts: { out: Number(alertRow?.out || 0), low: Number(alertRow?.low || 0) },
      unplaced: null,
      order: CATEGORY_ORDER,
      sections: secs, counts: sectionCounts(),
      uncatalogued: 0,
      warehouses: built.warehouses,
      missingWarehouses: built.missingWarehouses,
      rows,
    });
  });
}

// How many of the candidate set fall in each section, for the "across N categories" line.
function sectionCountsIn(cand) {
  const n = {};
  for (const x of cand) n[x.c.key] = (n[x.c.key] || 0) + 1;
  return n;
}

export async function GET(request) {
  // One category per request. The whole catalogue is 6,181 SKUs and reading it
  // took ~6s before anything appeared; a section is 124–1,487, so the first paint
  // is a fraction of that. Which SKUs are in a section is known locally from the
  // curated classification, so no query is needed to work it out.
  const params = new URL(request.url).searchParams;
  const key = params.get('cat') || CATEGORY_ORDER[0];
  const q = (params.get('q') || '').trim();
  // the category must EXIST; whether it has any curated SKU is no longer the test,
  // since the rows now come from the catalogue
  if (!SECTION_KEYS.has(key)) {
    return Response.json({ ok: false, error: 'Unknown category: ' + key }, { status: 400 });
  }
  try {
    // A SEARCH IS NOT SCOPED TO THE OPEN CATEGORY. Only the server holds all twelve
    // sections, so this is where a search has to happen: the browser is sent one section
    // at a time and could not have found a Lampshade SKU while Ceiling Rose was open.
    // That was the bug — a search returned nothing unless you already knew the section.
    // One snapshot PER CATEGORY, keyed the same way the request is. A single
    // whole-catalogue snapshot would be one 6,181-row object to load for a section of
    // 124, which is the cost this route was written to avoid in the first place.
    //
    // A SEARCH IS NOT SCOPED TO THE OPEN CATEGORY. Only the server holds all twelve
    // sections, so this is where a search has to happen: the browser is sent one page at
    // a time and could not find a Lampshade SKU while Ceiling Rose was open.
    const { page, size } = pageParams(params);
    const sortKey = params.get('sort') || '';
    const dir = params.get('dir') === 'desc' ? 'desc' : 'asc';
    const wantsAll = params.get('all') === '1';
    const st = {
      q,
      fam:  params.get('fam')  || '',
      sub2: params.get('sub2') || '',
      attr: params.get('attr') || '',
      wh:   params.get('wh')   || '',
      st:   params.get('st')   || '',
    };

    // THE DATABASE CHOOSES THE PAGE — except when the sort key is not a thing it holds.
    //
    // Shopify price is not a column: lib/shopify-price.js computes it live from a
    // five-tier rule across four marketplaces, so there is nothing to ORDER BY until the
    // rows exist. Sorting by price therefore still builds the section and orders it in
    // memory, which is the proven path and produces the same rows either way. Every other
    // view — no sort, by SKU, by type, by stock, with any combination of filters and a
    // search — is filtered, ordered, counted and cut by PostgreSQL.
    // WHICH ENGINE, AND WHY THERE IS A CHOICE.
    //
    // Both produce the same bytes — 64,535 field comparisons across four sections, zero
    // differences, and 24 filter/sort/search combinations in identical order. They differ
    // only in WHERE the narrowing happens, and the measurement is not close:
    //
    //   in-memory   Ceiling Rose 42ms, Lampshade 57ms
    //   sql         Ceiling Rose 6,263ms, Lampshade 4,323ms, a search 13,958ms
    //
    // The database is 169ms away, and a page needs about eight sequential round trips —
    // the page query, then products, stock, warehouses, containers, history and the
    // five-tier pricing for the rows on it. SQL pagination pays that on EVERY request.
    // The in-memory path pays it once per section per TTL and then answers from the
    // cache, which is why it is two orders of magnitude faster despite doing more work
    // the first time. Shipping the candidate SKUs to the database is not the problem
    // (378 KB measured at 389ms); the round trips are.
    //
    // So the default is the fast one. LEDSONE_INVENTORY_ENGINE=sql selects the other, and
    // ?engine=sql does it for a single request — enough to compare them on real data
    // without a redeploy. If the database ever moves next to the app, flip the default.
    const engine = params.get('engine') || process.env.LEDSONE_INVENTORY_ENGINE || 'memory';
    // Sorting by Shopify price cannot use SQL at all: lib/shopify-price.js computes it
    // live from a five-tier rule across four marketplaces, so there is no column to
    // ORDER BY until the rows exist.
    const sqlPath = engine === 'sql' && sortKey !== 'price' && !wantsAll;
    if (sqlPath) return pagedFromSql({ key, q, st, sortKey, dir, page, size });

    const found = q ? await searchAll(key, q) : null;
    const data = found || await getOrBuild('inventory-' + key, () => buildSnapshot(key));
    const sections = found ? found.sections : classification().sections;
    const all = data.rows;
    // Populations for the whole strip come from the local classification, so every
    // category shows its real count even though only one was queried. The header's
    // stock alerts are NOT global — the page computes them from the ACTIVE
    // category, which is why it reads 62 / 7 on Ceiling Rose. The client does that.
    // The in-memory path: the predicates are lib/filter.js's own, imported rather than
    // restated, so a row is kept or dropped for exactly the reason it always was.
    const cfg = sections[key] || null;
    const matched = applyFilters(all, [r => matches(r, cfg, st)]);

    // The dropdowns are built from the MATCHING set, so every option offered is one that
    // would actually return something — but from before its OWN filter is applied, or
    // choosing a value would leave that list holding only the value chosen.
    const optBase = f => applyFilters(all, [r => matches(r, cfg, { ...st, [f]: '' })]);
    const sub2Options = cfg?.sub2 ? optionsFor(optBase('sub2'), cfg.sub2.key) : null;
    const attrOptions = cfg?.attr ? optionsFor(optBase('attr'), cfg.attr.key) : null;

    // ---- SORT, THEN COUNT, THEN CUT ONE PAGE -----------------------------------------
    // SKU is the tie-breaker on every sort: it is unique across the catalogue, so two rows
    // sharing a price or a stock figure can never swap between pages as the reader pages.
    const SORTS = {
      sku:   { key: 's',     unique: 's' },
      type:  { key: 't',     unique: 's' },
      price: { key: 'price', unique: 's' },
      stock: { key: r => STOCK_KEYS.reduce((n, c) => n + (Number(r[c]) || 0), 0), unique: 's' },
    };
    const sort = SORTS[sortKey] ? { ...SORTS[sortKey], dir } : null;
    const out = runQuery(matched, { sort, page, size });

    // THE HEADER'S STOCK ALERTS COUNT THE WHOLE SET, NOT THE PAGE. They used to be
    // counted in the browser out of `data.rows`, which WAS the whole set; it is now 25
    // rows, so counting there would report "3 out of stock" for a category that has 62.
    // Same scope as before — the section when browsing, the matches when searching.
    const alerts = all.reduce((a, r) => {
      const lvl = stockLevel(r);
      if (lvl === 'out') a.out++; else if (lvl === 'low') a.low++;
      return a;
    }, { out: 0, low: 0 });


    return Response.json({
      ok: true,
      cat: key,
      search: q || null,
      perSection: found ? found.perSection : null,
      // WHEN THE DATA WAS READ, not when this request arrived. It used to be the
      // request time, so the header's "read …" chip always looked current no matter
      // how old the rows were — the staleness had nothing showing it.
      asOf: found ? found.asOf : (builtAt('inventory-' + key) || new Date().toISOString()),
      // THE COUNT IS THE MATCHING SET — not the page, and not the section. It is what
      // "3,245 SKUs found" has to say, and it is a length: nothing is fetched for it.
      count: out.total,
      total: out.total,
      sectionTotal: all.length,
      page: out.page, pages: out.pages, size: out.size,
      sort: sortKey || null, dir,
      sub2Options, attrOptions,
      // WAS: shippedAt(...) !== null — true whenever a snapshot FILE existed, even a
      // stale one, which is why this said "served from a snapshot" on a build whose
      // data was days old. It now asks whether the row set actually came from one.
      unplaced: unplacedSkus(fromSnapshot('inventory-' + key)),
      order: CATEGORY_ORDER,
      sections, counts: sectionCounts(),
      uncatalogued: data.uncatalogued ?? 0,   // catalogue SKUs no rule could place
      alerts,
      warehouses: data.warehouses,
      missingWarehouses: data.missingWarehouses,
      // ONE PAGE. Never the section, never the whole match set — except for an export,
      // which asks for it explicitly.
      rows: wantsAll ? (sort ? sortRows(matched, sort) : matched) : out.rows,
    });
  } catch (e) {
    // the message is already scrubbed by lib/db, but never echo a query either
    console.error('[api/inventory]', e.message);
    return Response.json({ ok: false, error: 'Inventory query failed. See server log.' }, { status: 500 });
  }
}

// The snapshot builder, exported for scripts/build-snapshots.mjs. Takes the category
// because this route snapshots one section at a time: a single whole-catalogue file
// would be 6,181 rows to load for a section of 124, which is the cost the route was
// written to avoid. The route calls this same function.
export function buildSnapshot(cat) {
  if (!SECTION_KEYS.has(cat)) throw new Error('Unknown category: ' + cat);
  const key = cat;
  return withClient(async q => {
      // THE SECTION'S SKU LIST COMES FROM THE DATABASE, NOT FROM THE EXPORT.
      //
      // This used to be skusIn(cat) — the curated file alone — so a SKU added to
      // inventory.products after the last export was invisible: add a lampshade
      // today and Lampshade would not show it, however fresh the query. The
      // catalogue is asked instead, and each SKU is placed by sectionOf(): its
      // curated section if it has one, else a 4-char prefix that the whole
      // catalogue uses for exactly one section, else the page's own classifier.
      // Anything none of those can place is counted and reported, never filed
      // somewhere plausible.
      const all = await q(ALL_SKUS_LIVE);
      const wanted = [];
      let added = 0, uncatalogued = 0;
      for (const r of all) {
        const { key: sec, how } = sectionOf(r.sku);
        if (how === 'unplaced') { uncatalogued++; continue; }
        if (sec !== cat) continue;
        wanted.push(r.sku);
        if (how !== 'curated') added++;
      }
      if (added) console.log(`[inventory] ${cat}: ${added} SKU(s) not in the export, placed by rule`);
      if (!wanted.length) return { rows: [], warehouses: {}, missingWarehouses: [], uncatalogued };
      return buildRows(q, key, wanted, uncatalogued);
  });
}

// THE ROW BUILDER, SPLIT OUT SO BOTH PATHS SHARE IT EXACTLY.
//
// buildSnapshot() hands it a whole section; the paginated route hands it the 25 SKUs the
// database just said belong on the page. Same queries, same shaping, same row objects —
// the ONLY difference is how many SKUs go in. That is deliberate: it is what makes
// "the paginated row equals the snapshot row" true by construction rather than by
// inspection, so there is no second row-building path to keep in step.
function buildRows(q, key, wanted, uncatalogued = 0, incomingScope = null) {
  return (async () => {
      const products = await q(PRODUCTS, [wanted]);
      const pids = products.map(p => p.pid);

      // chunked: ANY($1) with 16k ids in one go is a needlessly large parameter
      const stock = {};
      for (let i = 0; i < pids.length; i += 4000) {
        for (const r of await q(STOCK, [pids.slice(i, i + 4000)])) {
          (stock[r.inventory] ||= {})[r.warehouse] = { q: Number(r.quantity), loc: r.loc };
        }
      }

      const warehouses = {};
      for (const r of await q(WAREHOUSES)) {
        warehouses[r.warehouse] = { name: r.warehouse_name, loc: r.warehouse_location };
      }
      const missingWarehouses = Object.values(COL).filter(id => !warehouses[id] && !WH_OVERRIDE[id]);

      // THE PRICE QUERY IS GONE. It ran on every build and its result was never read:
      // the row's price comes from data/price.json, because min(price) across the UK
      // channels is the WRONG rule — see the note at the top of this file, and the
      // LSFC160BT case it left blank. A query nobody uses still costs a connection
      // against a role that allows ten.

      // ---- last container, per region -------------------------------------
      // ordered by order_date so the LAST entry is the newest arrival
      const arrived = {};
      for (const r of await q(ARRIVED, [wanted])) {
        if (r.region !== 'UK' && r.region !== 'DE') continue;
        ((arrived[r.sku] ||= {})[r.region] ||= []).push({ od: r.od, name: r.cname });
      }
      for (const sku of Object.keys(arrived))
        for (const rg of Object.keys(arrived[sku]))
          arrived[sku][rg].sort((a, b) => a.od.localeCompare(b.od) || a.name.localeCompare(b.name));

      const incoming = {};
      // ASKED FOR THE WHOLE CANDIDATE SET, NOT JUST THE PAGE — and that is not laziness.
      //
      // INCOMING is SELECT DISTINCT with no ORDER BY, and the loop below keeps whichever
      // row arrives LAST, so a SKU with two pending containers takes whichever the scan
      // returned second. That order comes from the plan, and the plan changes with the
      // size of the ANY($1) array: measured on CL2RAG, an array of 2 SKUs yields "DE
      // Container 02 2026" and an array of 51 yields "01Sep2026".
      //
      // The value is therefore arbitrary in the original app too — the 2-hourly pipeline
      // carries the identical query — but it is arbitrary CONSISTENTLY, because the array
      // is always the whole section. Passing the page's 25 SKUs would have changed the
      // cell for the 11 SKUs that have more than one pending container. So the query is
      // left exactly as it was and asked the same question, and only the SKUs on the page
      // are read out of the answer. Making it deterministic is a real fix, but it is a
      // change of output and belongs in its own change, not smuggled in with pagination.
      const incScope = incomingScope || wanted;
      const onPage = new Set(wanted);
      for (const r of await q(INCOMING, [incScope])) {
        if (onPage.has(r.sku)) incoming[r.sku] = { name: r.cname, stage: r.stage };
      }

      // ---- history: movement counts, and the latest genuine goods receipt ---
      const hist = {};
      for (let i = 0; i < wanted.length; i += 800) {
        for (const r of await q(HISTORY, [wanted.slice(i, i + 800)]))
          (hist[r.sku] ||= []).push(r.line);
      }
      // The dialog shows the 12 most recent movements per region and says so when
      // there are more — the same cap the published pipeline uses, so the two agree.
      const CAP = 12;
      const moves = {}, received = {};
      for (const sku of Object.keys(hist)) {
        const mv = [];
        for (const line of hist[sku]) for (const m of parseLine(line)) mv.push(m);
        // newest first, by date then time
        mv.sort((a, b) => (b.dt + ' ' + (b.tm || '')).localeCompare(a.dt + ' ' + (a.tm || '')));
        for (const m of mv) {
          const rg = histRegion(m.tl);
          const bucket = ((moves[sku] ||= {})[rg] ||= { n: 0, rows: [] });
          bucket.n++;
          if (bucket.rows.length < CAP) bucket.rows.push({
            dt: m.dt, fl: m.fl || '', tl: m.tl || '', sb: m.sb, sa: m.sa, qt: m.qt,
            ac: m.ac || '', ip: m.ip || '', cp: m.cp || '', rm: m.rm || '',
          });
          // Received Warehouse and Received Date are NOT columns anywhere — they
          // are read out of the history text. Only a "Goods received" movement
          // counts; anything else is a correction or a pick.
          if (m.ac !== 'Goods received') continue;
          const cur = ((received[sku] ||= {})[rg]);
          const stamp = m.dt + ' ' + (m.tm || '');
          // the warehouse is the movement's TITLE (m.tl), not an m.wh field — the
          // parser names the warehouse there, e.g. "Unit 3". Reading m.wh gave a
          // blank column where the dashboard shows the unit.
          if (!cur || stamp > cur.stamp) received[sku][rg] = { stamp, wh: m.tl || '', dt: m.dt };
        }
      }

      // Join the CURATED classification on. A SKU the arrays do not know is
      // reported as unplaced, never silently dropped and never guessed at — the
      // same contract build.js keeps.
      const { cls } = classification();
      // LIVE, not from data/price.json. The five-tier rule is ported in
      // lib/shopify-price.js and checked against the pipeline's own output: on 6,183
      // SKUs it reproduces price, alt price and comment with ZERO differences. Reading
      // the file meant a database price change never appeared — the tab showed £47.20
      // for LSGL15014CL against a database saying £7.71.
      const { price: gbp, alt, comment: comments } = await shopifyPricing(wanted, q);
      const rows = [];
      for (const p of products) {
        // A SKU THE EXPORT HAS NEVER SEEN STILL GETS A ROW. This used to be
        // `if (!c) continue` — so a lampshade added after the last export was
        // fetched, then dropped here, and the section quietly showed the old list.
        // The curated entry stays the authority where it exists; where it does not,
        // the page's own classifier supplies the section and the type, and a type it
        // cannot name reads "Other" rather than being invented.
        const c = cls[p.sku] || derive(p.sku);
        // A NULL KEY MEANS "THESE SKUS ARE ALREADY THE ANSWER". A section build passes its
        // own key and drops anything the classification files elsewhere. A search page
        // spans sections by definition, and its SKUs were already placed and checked
        // before the query ran, so re-testing them here dropped every foreign match —
        // the page came back empty while the count said 1,036.
        if (!c || (key !== null && c.key !== key)) continue;
        const s = stock[p.pid] || {};
        // £ only from a UK channel; anything else keeps its own currency
        const g = gbp[p.sku];
        const a = alt[p.sku];
        const row = { s: p.sku, d: p.d, i: imgURL(p.img),
                      price: typeof g === 'number' ? g : null,
                      alt: a ? { v: a[0], sym: a[1], cur: a[2], ch: a[3] } : null,
                      key: c.key, f: c.f ?? null, t: c.t ?? null };
        // the attribute columns each section filters on
        for (const k of ['x', 'mt', 'sh', 'ft', 'sr', 'gp', 'ws']) if (c[k] !== undefined) row[k] = c[k];
        for (const [col, id] of Object.entries(COL)) row[col] = s[id] ? s[id].q : 0;
        for (const [col, id] of Object.entries(LOC)) if (s[id]?.loc) row[col] = s[id].loc;

        // last container per region: the newest arrival, and how many it has had
        for (const rg of ['UK', 'DE']) {
          const list = (arrived[p.sku] || {})[rg];
          if (list && list.length) {
            const latest = list[list.length - 1];
            row[rg === 'UK' ? 'ukc' : 'dec'] = { name: latest.name, od: latest.od, n: list.length };
          }
          const rec = (received[p.sku] || {})[rg];
          if (rec) row[rg === 'UK' ? 'ukr' : 'der'] = { wh: rec.wh, dt: rec.dt };
          const h = (moves[p.sku] || {})[rg];
          if (h) row[rg === 'UK' ? 'ukh' : 'deh'] = h;   // { n, rows }
        }
        const inc = incoming[p.sku];
        if (inc) row.inc = inc;
        const pc = comments[p.sku];
        if (pc) row.pc = pc;

        rows.push(row);
      }

      // How many catalogue SKUs no rule could place. Reported, not hidden: they are
      // free-text keys like "2 PIN CLIP TO CLIP" that are not really SKUs, and if that
      // number starts climbing it means a new prefix needs adding to the registry.
      return { rows, warehouses, missingWarehouses, uncatalogued };
  })();
}

// re-exported so the snapshot script can enumerate the sections without a second
// copy of the category list
export { CATEGORY_ORDER };
