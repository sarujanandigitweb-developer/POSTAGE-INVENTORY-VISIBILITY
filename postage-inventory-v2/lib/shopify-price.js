import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { withClient } from './db.js';
import { dataDir } from './data-dir.js';

// SHOPIFY PRICE, ALT PRICE AND PRICE COMMENT — DERIVED LIVE, not read from a file.
//
// These three were the last file-sourced fields on the Inventory tab. The route read
// data/price.json, which the 2-hourly pipeline writes; when nobody copied it the tab
// showed £47.20 for LSGL15014CL against a database saying £7.71, and a database price
// change never appeared at all.
//
// The rules are NOT re-invented here. They are ported line for line from
// sql/refresh/extract/price.js and sql/build-shopify-comments.js, which are the
// validated definition, and a check compares this against the pipeline's own output.
//
// The only input that is not the database is sql/accessory-names.txt — plain-word names
// for the accessories a comment mentions ("Universal Reducer Plate (RPR44WH)"). Those
// are names, not prices: they change when a product is named, not when it is repriced,
// and the file is in git.

const CHANNEL = [null, 'LEDSone', 'Electricalsone', 'Vintagelite', 'BesBet', 'Dcvoltage',
                 'LEDSone DE', 'LED Sone FR', 'LEDSone US', 'Relicelectrical'];
const GBP_UNTIL = 5;                    // channels 1-5 are UK stores, priced in pounds
const CURRENCY = { 'LEDSone DE': ['€', 'EUR'], 'LED Sone FR': ['€', 'EUR'],
                   'LEDSone US': ['$', 'USD'], 'Relicelectrical': ['C$', 'CAD'] };

const LISTING_SQL = `
  WITH ch(name, ord) AS (VALUES
    ('LEDSone',1),('Electricalsone',2),('Vintagelite',3),('BesBet',4),
    ('Dcvoltage',5),('dcvoltage',5),('LEDSone DE',6),('LED Sone FR',7),
    ('LEDSone US',8),('Relicelectrical',9))
  SELECT upper(COALESCE(NULLIF(l.mapped_sku,''), l.sku)) AS lsku,
         ch.ord, min(l.price) AS p
    FROM listings.shopify_listings l
    JOIN ch ON ch.name = l.channel
   WHERE COALESCE(l.wrong_sku,0) = 0 AND l.all_list = 1 AND l.price > 0
   GROUP BY 1, 2`;
// pack codes come from the database, not a regex: inventory.product_pk is authoritative
const PACK_SQL = `SELECT pack_char, pack_qty FROM inventory.product_pk ORDER BY pack_qty`;

// A pack count is a SINGLE digit, or 'A' for ten — the only two-digit size in the data
// is 10 and it is always written APK. Allowing two digits made LDCWGU1036PK read as a
// "36 Pack" when it is LDCWGU103 + 6PK.
const PACK = /^(\d|A)PK(-[A-Z]{2,3})?$/;
const PACK_A = 10;
const packOf = s => { const m = /(\d|A)PK(-[A-Z]{2,3})?$/.exec(s);
                      return m ? (m[1] === 'A' ? PACK_A : parseInt(m[1], 10)) : null; };
const base = s => s.replace(/(\d|A)PK(-[A-Z]{2,3})?$/, '');

function selfPart(part, sku) {          // is this component OUR sku, with or without a suffix?
  if (part === sku) return { self: true, pack: null };
  if (part.indexOf(sku) !== 0) return null;
  const tail = part.slice(sku.length);
  if (tail === '') return { self: true, pack: null };
  const m = PACK.exec(tail);
  if (m) return { self: true, pack: m[1] === 'A' ? PACK_A : parseInt(m[1], 10) };
  if (/^-[A-Z]{2,3}$/.test(tail)) return { self: true, pack: null };
  return null;
}

// the best channel for a listing: LEDSone if it has it, else the next store down
const bestOrd = e => { if (!e) return null;
  for (let o = 1; o < CHANNEL.length; o++) if (e[o] !== undefined) return o;
  return null; };
const priceOf = e => { const o = bestOrd(e); return o === null ? null : e[o]; };

let NAME = null;
function names() {
  if (NAME) return NAME;
  NAME = {};
  try {
    // sql/accessory-names.txt sits outside the app; dataDir() resolves the deployed
    // layout, and the file is copied in beside the other data by sync-pipeline-files.
    const txt = fs.readFileSync(path.join(dataDir(), 'accessory-names.txt'), 'utf8');
    for (const l of txt.split('\n')) {
      if (!l) continue;
      const i = l.indexOf('|');
      if (i > 0) NAME[l.slice(0, i).trim()] = l.slice(i + 1).replace(/\s+/g, ' ').trim();
    }
  } catch { /* no names file: comments fall back to bare SKU codes, never to silence */ }
  return NAME;
}

/** Resolve price, alt price and comment for a set of SKUs, live from the database.
 *  Pass the CALLER'S query function when one is already open: the inventory route holds
 *  a client for the whole build, and opening a second against a ten-connection role for
 *  the same request is how a page with six tables exhausts it. */
export function shopifyPricing(wanted, qIn) {
  const run = async q => {
    const listing = {};
    for (const r of await q(LISTING_SQL)) {
      const by = listing[r.lsku] || (listing[r.lsku] = {});
      const v = Number(r.p);
      if (by[r.ord] === undefined || v < by[r.ord]) by[r.ord] = v;
    }
    const packs = {};
    for (const r of await q(PACK_SQL)) packs[String(r.pack_char).toUpperCase()] = Number(r.pack_qty);

    const skus = Object.keys(listing);
    const parts = {}; for (const s of skus) parts[s] = s.split('+');
    const combos = skus.filter(s => parts[s].length > 1);
    const byComponent = {};
    for (const s of combos) for (const p of parts[s]) (byComponent[p] ||= []).push(s);

    // ---- decide the match, five tiers, in order -----------------------------
    const match = {};
    for (const sku of wanted) {
      if (listing[sku]) { match[sku] = { tier: 'exact', lsku: sku, extras: [], n: 1 }; continue; }

      const pool = [...new Set((byComponent[sku] || []).concat(
        combos.filter(s => s.indexOf(sku) !== -1 && parts[s].some(p => selfPart(p, sku)))))];
      const shaped = pool.map(s => {
        const own = parts[s].map(p => selfPart(p, sku));
        if (!own.some(Boolean)) return null;
        return { lsku: s, extras: parts[s].filter((p, i) => !own[i]),
                 pack: own.find(Boolean).pack, n: parts[s].length };
      }).filter(Boolean);

      // 2. exactly one '+', neither side a pack
      const two = shaped.filter(x => x.n === 2 && !x.pack && !packOf(x.extras[0]));
      if (two.length) {
        // channel first, price second: a LEDSone combo beats a cheaper Vintagelite one
        two.sort((a, b) => (bestOrd(listing[a.lsku]) || 99) - (bestOrd(listing[b.lsku]) || 99) ||
                           (priceOf(listing[a.lsku]) || 1e9) - (priceOf(listing[b.lsku]) || 1e9));
        match[sku] = { tier: 'combo2', ...two[0] };
        continue;
      }
      // 3. a pack — standalone (<SKU>2PK) or paired (<SKU>2PK+RPR44WH2PK). A four-item
      //    kit that merely CONTAINS a pack is a complex combo and belongs in tier 4.
      const packMatches = skus.filter(s => { const p = selfPart(s, sku); return p && p.pack; })
        .map(s => ({ lsku: s, extras: [], pack: selfPart(s, sku).pack, n: 1 }))
        .concat(shaped.filter(x => x.n === 2 && (x.pack || packOf(x.extras[0]))));
      if (packMatches.length) {
        packMatches.sort((a, b) => a.n - b.n ||
          (bestOrd(listing[a.lsku]) || 99) - (bestOrd(listing[b.lsku]) || 99) ||
          (a.pack || 99) - (b.pack || 99));
        match[sku] = { tier: 'pack', ...packMatches[0] };
        continue;
      }
      // 4. the smallest, then cheapest, complex combo
      if (shaped.length) {
        shaped.sort((a, b) => a.n - b.n ||
          (bestOrd(listing[a.lsku]) || 99) - (bestOrd(listing[b.lsku]) || 99) ||
          (priceOf(listing[a.lsku]) || 1e9) - (priceOf(listing[b.lsku]) || 1e9));
        match[sku] = { tier: 'combo3', alt: shaped.length, ...shaped[0] };
        continue;
      }
      match[sku] = { tier: 'none' };
    }

    // ---- price, alt price and comment --------------------------------------
    const NM = names();
    const strip = s => base(s).replace(/-(IDE|CA|US|DE|FR|NL)$/, '').replace(/_\d*$/, '');
    const label = s => { const nm = NM[base(s)] || NM[strip(s)]; return nm ? nm + ' (' + s + ')' : s; };
    const list = a => a.length === 1 ? label(a[0])
      : a.slice(0, -1).map(label).join(', ') + ' and ' + label(a[a.length - 1]);
    const packFor = s => { const m = /(\d|A)PK(-[A-Z]{2,3})?$/.exec(s);
                           return m ? (m[1] === 'A' ? (packs.A ?? PACK_A) : parseInt(m[1], 10)) : null; };

    const PRICE = {}, ALT = {}, COMMENT = {};
    for (const sku of wanted) {
      const m = match[sku];
      if (m.tier === 'none') { COMMENT[sku] = 'Not listed on Shopify'; continue; }
      const e = listing[m.lsku];
      const ord = bestOrd(e);
      const chan = ord ? CHANNEL[ord] : null;

      // Only a UK store's figure reaches the price column: it is labelled in pounds,
      // and a euro or Canadian dollar amount rendered as "£31.49" is a wrong number.
      if (ord && ord <= GBP_UNTIL) PRICE[sku] = e[ord];
      else if (ord) { const cur = CURRENCY[chan] || ['', '']; ALT[sku] = [e[ord], cur[0], cur[1], chan]; }

      let txt;
      if (m.tier === 'exact')       txt = 'Standalone — no extra item';
      else if (m.tier === 'combo2') txt = 'Combined with ' + label(m.extras[0]);
      else if (m.tier === 'pack')   txt = 'Sold as ' + (m.pack || packFor(m.lsku)) + ' Pack' +
                                          (m.extras && m.extras.length ? ', combined with ' + list(m.extras) : '');
      else                          txt = 'Combined with ' + list(m.extras) +
                                          (m.alt > 1 ? ' (' + m.alt + ' combos)' : '');
      // LEDSone is the default and goes unsaid; anything else is named, because the
      // reader needs to know the number did not come from the house store.
      if (ord && ord !== 1) txt += ' — not on LEDSone, ' + chan + ' listing' +
                                   (ord > GBP_UNTIL ? ' (not in pounds)' : '');
      COMMENT[sku] = txt;
    }
    return { price: PRICE, alt: ALT, comment: COMMENT };
  };
  return qIn ? run(qIn) : withClient(run);
}
