import 'server-only';
import { classification } from './classification.js';
import { classifySKU } from './classify-sku.js';

// WHICH SECTION DOES THIS SKU BELONG TO — including one nobody has classified yet.
//
// classification.json is the authority for every SKU that existed when it was exported.
// It cannot answer for a SKU added to inventory.products since, and the Inventory page
// used to scope its query to that file alone — so new stock never appeared. A dashboard
// that silently omits a product you just added is failing at its job.
//
// Three sources, in descending order of evidence. Nothing is guessed: a SKU that none of
// them can place is reported, not filed somewhere plausible.
let prefixMap = null;
function byPrefix() {
  if (prefixMap) return prefixMap;
  const { cls } = classification();
  const use = new Map();                       // 4-char prefix -> Set of section keys
  for (const sku of Object.keys(cls)) {
    const p4 = sku.slice(0, 4).toUpperCase();
    if (p4.length < 4) continue;
    (use.get(p4) || use.set(p4, new Set()).get(p4)).add(cls[sku].key);
  }
  // Only a prefix the whole catalogue uses for ONE section is evidence. 16 of 1,000 are
  // shared — WS covers both Wall Arm and Lighting — and those must never be guessed.
  prefixMap = new Map();
  for (const [p, keys] of use) if (keys.size === 1) prefixMap.set(p, [...keys][0]);
  return prefixMap;
}

/**
 * @returns {{ key: string|null, how: 'curated'|'prefix'|'rule'|'unplaced' }}
 */
export function sectionOf(sku) {
  const s = String(sku ?? '').trim().toUpperCase();
  if (!s) return { key: null, how: 'unplaced' };

  // 1. the curated placement — "an existing SKU keeps the classification it already has"
  const { cls } = classification();
  const known = cls[s];
  if (known) return { key: known.key, how: 'curated' };

  // 2. a four-character prefix used by exactly one section across 6,183 curated SKUs.
  //    This covers Lamp Spares and Lighting, which the page's own classifier routes by
  //    registry key and therefore cannot place.
  const p = byPrefix().get(s.slice(0, 4));
  if (p) return { key: p, how: 'prefix' };

  // 3. the published page's own classifySKU, for anything the prefix map has not seen
  const g = classifySKU(s);
  if (g.key) return { key: g.key, how: 'rule' };

  return { key: null, how: 'unplaced' };
}
