// MAIN CATEGORY FROM THE SKU PREFIX, for the Fixed Price and Slow-Moving filters.
//
// These two tables list the whole catalogue, so they carry no section of their own the
// way Inventory does. This is the team's own prefix list, supplied as the grouping they
// use when looking at prices and dead stock.
//
// It is NOT lib/classify-sku.js. That one reproduces the published dashboard's twelve
// sections from validated data and is the authority for Inventory. This is a coarser,
// hand-given grouping — it has a Transformers category the dashboard does not, and it
// files LB under Home Appliances where the dashboard uses LB for Bulbs. Keeping them
// apart means neither is bent to fit the other.
const MAP = {
  'Ceiling Rose': ['CR'],
  'Pendant Lamp Holder': ['PH'],
  'Lamp Shade': ['LS', 'WC', 'BL'],
  'Lamp Holders': ['LH'],
  'Lighting': ['WS', 'PS', 'PL', 'TP', 'WL'],
  'BULBS': ['LD', 'IC', 'LL', 'LP', 'LQ'],
  'Transformers': ['12IP', '24IP', '5IP', 'CC', 'CH', '12', '24'],
  'Lamp Spares': ['RP', 'SC', 'CN', 'CL', 'SP', 'CB', 'NT', 'WR', 'RD', 'CO', 'BC', 'CG',
                  'HK', 'HR', 'PC', 'WJ', 'SD', 'SW', 'SO', 'IM', 'CM', 'RW', 'SL', 'CE',
                  'TS', 'LC', 'NF', 'ST'],
  'Home Appliances': ['LB', 'SB', 'HB', 'MB', 'SS', 'BS', 'CK', 'WM', 'MA', 'WB', 'FCB',
                      'AF', 'FW', 'TC', 'SU', 'WK', 'BTR', 'PM', 'HL'],
  'Cosmetics': ['CS'],
  'Clothes': ['CT', 'AP'],
  'Refurbished': ['RB'],
};

// PH WAS GIVEN TO TWO CATEGORIES — Pendant Lamp Holder and Lighting. It is filed under
// Pendant Lamp Holder, which is a category of its own and whose name IS the prefix;
// Lighting keeps WS/PS/PL/TP/WL. That covers 1,642 SKUs on Fixed Price, so if the team
// means them under Lighting, move 'PH' between the two lists above — nothing else needs
// to change.

// Longest first, so 12IP is tested before 12 and a transformer SKU is never taken by
// the shorter rule. Order within a length does not matter: no two categories share a
// prefix once PH is resolved.
const RULES = Object.entries(MAP)
  .flatMap(([cat, ps]) => ps.map(p => [p.toUpperCase(), cat]))
  .sort((a, b) => b[0].length - a[0].length);

export const CATEGORIES = [...Object.keys(MAP), 'Others'];

/** The category a SKU falls in. Anything no prefix claims is 'Others' — which on this
 *  catalogue is almost entirely the ENC* eBay combo placeholders, ~6,100 of them. */
export function skuCategory(sku) {
  const s = String(sku ?? '').trim().toUpperCase();
  if (!s) return 'Others';
  for (const [p, cat] of RULES) if (s.startsWith(p)) return cat;
  return 'Others';
}
