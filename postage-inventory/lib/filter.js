import { stockLevel, STOCK_KEYS } from './stock.js';

// Ported from the live page's matches(). Every clause is the page's, in its order.
export function matches(r, cfg, st) {
  if (st.fam && r.f !== st.fam) return false;
  // Level-2 and attribute filters only exist for categories that declare them
  if (st.sub2 && cfg?.sub2 && r[cfg.sub2.key] !== st.sub2) return false;
  if (st.attr && cfg?.attr && r[cfg.attr.key] !== st.attr) return false;
  if (st.q) {
    const hay = (r.s + ' ' + (r.t || '') + ' ' + (r.f || '') + ' ' + (r.d || '') + ' ' +
                 (r.sh || '') + ' ' + (r.ft || '')).toLowerCase();
    if (!st.q.toLowerCase().split(/\s+/).filter(Boolean).every(t => hay.includes(t))) return false;
  }
  if (st.wh || st.st) {
    const keys = st.wh ? [st.wh] : STOCK_KEYS;
    const vals = keys.map(k => r[k]).filter(v => v !== null && v !== undefined);
    if (st.wh && vals.length === 0) return false;
    if (st.st === 'pos' && !vals.some(v => v > 0)) return false;
    if (st.st === 'neg' && !vals.some(v => v < 0)) return false;
    if (st.st === 'zero' && !vals.every(v => v === 0)) return false;
    if (st.st === 'low' && stockLevel(r) !== 'low') return false;
    if (st.st === 'out' && stockLevel(r) !== 'out') return false;
  }
  return true;
}

// Level-2 / attribute options come from the ACTIVE category's own rows, so every
// option shown is a value that actually exists. Listed exactly as stored — no
// normalising, no merging of near-duplicate spellings.
export function extraOptions(rows, spec) {
  if (!spec) return null;
  const counts = new Map();
  for (const r of rows) {
    const v = r[spec.key];
    if (v !== null && v !== undefined && v !== '') counts.set(v, (counts.get(v) || 0) + 1);
  }
  return [...counts.keys()].sort((a, b) => String(a).localeCompare(String(b)))
    .map(v => ({ value: v, count: counts.get(v) }));
}
