'use strict';
// Shopify price, Comments and the foreign-currency fallback.
// Pure read, deterministic.
//
// Rules preserved exactly as validated — none is re-invented here:
//   filter   wrong_sku = 0 AND all_list = 1 AND price > 0
//   SKU      upper(COALESCE(NULLIF(mapped_sku,''), sku))
//   tiers    1 exact · 2 combo with exactly ONE '+' · 3 pack · 4 larger combo · 5 none
//   channel  LEDSone first at EVERY tier, then the other UK stores, then non-UK
//   £ column only a UK channel may fill it; a euro or dollar figure goes to ALT
const { q } = require('../db.js');

const CHANNEL  = [null, 'LEDSone', 'Electricalsone', 'Vintagelite', 'BesBet', 'Dcvoltage',
                  'LEDSone DE', 'LED Sone FR', 'LEDSone US', 'Relicelectrical'];
const GBP_UNTIL = 5;
const CURRENCY  = { 'LEDSone DE': ['€', 'EUR'], 'LED Sone FR': ['€', 'EUR'],
                    'LEDSone US': ['$', 'USD'], 'Relicelectrical': ['C$', 'CAD'] };

const SQL = `
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

async function extract(client){
  const listing = {};
  (await q(client, SQL)).forEach(r => {
    const by = listing[r.lsku] = listing[r.lsku] || {};
    const v = Number(r.p);
    if (by[r.ord] === undefined || v < by[r.ord]) by[r.ord] = v;
  });
  const packs = {};
  (await q(client, PACK_SQL)).forEach(r => { packs[String(r.pack_char).toUpperCase()] = Number(r.pack_qty); });
  return { listing, packs };
}

module.exports = { extract, CHANNEL, GBP_UNTIL, CURRENCY, SQL, PACK_SQL };
