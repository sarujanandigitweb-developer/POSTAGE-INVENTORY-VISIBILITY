import { stockLevel, STOCK_KEYS } from './stock.js';

// THE TEXT RULE, IN ONE PLACE. The route needs it too: a search spans every section, and
// only the server holds all twelve, so the server is what narrows 6,183 SKUs down to the
// matches. Written once and imported by both, because two copies of a search rule drift
// and the drift shows up as "the count says 13 and the table shows 9".
//
// Every term must appear somewhere in the row — SKU, type, family, description, shade
// shape or fitting. Exactly the fields the published dashboard searches, in its order.
// CATEGORY AND FAMILY ARE SEARCHABLE, as they are on the published dashboard, where the
// same fields are called `mc` and `sc`. Without them "lampshade" found only the rows whose
// description happened to repeat the word — 417 of 996 — while the published page returned
// all of them, and two dashboards disagreeing about the same search reads as a fault in
// whichever one the reader checked second.
//
// `extra` exists because the SERVER knows a row's section without the row carrying it: it
// is looping the sections. The client is handed rows that already carry `mc`/`sc`, so it
// passes nothing and gets the same haystack either way. Fields stay space-separated, so a
// term can never match by spanning two of them.
export function textMatches(r, q, extra) {
  const terms = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = (r.s + ' ' + (r.t || '') + ' ' + (r.f || '') + ' ' + (r.d || '') + ' ' +
               (r.sh || '') + ' ' + (r.ft || '') + ' ' +
               (r.mc || '') + ' ' + (r.sc || '') + ' ' + (extra || '')).toLowerCase();
  return terms.every(t => hay.includes(t));
}

// Ported from the live page's matches(). Every clause is the page's, in its order.
export function matches(r, cfg, st) {
  // CATEGORY-SCOPED CLAUSES ARE SKIPPED WHILE SEARCHING. A search spans sections, and
  // `fam`, `sub2` and `attr` are declared by ONE category — Ceiling Rose's families are
  // not Lampshade's, and Lampshade's "Shade shape" means nothing for a belt. Judging a
  // foreign row by the open category's clause would silently drop every match outside it,
  // which is the bug this exists to prevent. Warehouse and stock are universal and still
  // apply, below.
  if (!st.q) {
    if (st.fam && r.f !== st.fam) return false;
    // Level-2 and attribute filters only exist for categories that declare them
    if (st.sub2 && cfg?.sub2 && r[cfg.sub2.key] !== st.sub2) return false;
    if (st.attr && cfg?.attr && r[cfg.attr.key] !== st.attr) return false;
  }
  if (!textMatches(r, st.q)) return false;
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
