import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './data-dir.js';

// classifySKU, ported from the published dashboard.
//
// WHY THIS EXISTS. classification.json lists the SKUs that existed when it was made.
// The Inventory page scoped its query to that list, so a SKU added to
// inventory.products afterwards never appeared — the dashboard silently omitted new
// stock, which is the one thing it must not do. The published page does not have that
// problem: it derives rules from the data and places any SKU on sight. This is that
// same routine, reading indexes the export now emits.
let idx = null;
const load = () => (idx ||= JSON.parse(
  fs.readFileSync(path.join(dataDir(), 'classifier.json'), 'utf8')));

export function classifySKU(sku) {
  const { names, classify, sub4, sub4Ambiguous, prefixRules } = load();
  // Normalise: trim + uppercase ONLY. No character is removed — dots and digits inside
  // a SKU (PHSQ1.5PBRYB) are meaningful.
  const s = String(sku ?? '').trim().toUpperCase();
  const p4 = s.length >= 4 ? s.slice(0, 4) : '';

  // 1) the four-character index, before the two-character rule, so a CRFF/CRSF or LSGL
  //    SKU can never fall through and be labelled "Other".
  const hit = sub4[p4];
  if (hit) return { key: hit.key, mainCategory: names[hit.key], subCategory: hit.label,
                    famCode: hit.code, ambiguousPrefix: false, unclassified: false };

  // 2) the prefix exists but the validated data disagrees about its type. The main
  //    category is still certain; the type is not, so it is left as "Other".
  const amb = sub4Ambiguous[p4];
  if (amb) return { key: amb.key, mainCategory: names[amb.key], subCategory: 'Other',
                    famCode: null, ambiguousPrefix: true, unclassified: false };

  // 3) a prefix DECLARED by a prefix-defined section, longest match first.
  for (const pr of prefixRules) {
    if (s.slice(0, pr.p.length) === pr.p)
      return { key: pr.key, mainCategory: names[pr.key], subCategory: pr.label,
               famCode: pr.code, ambiguousPrefix: false, unclassified: false };
  }

  // 4) the two-character main category
  const c = s.length >= 2 ? classify[s.slice(0, 2)] : undefined;
  if (!c) return { key: null, mainCategory: 'Other', subCategory: 'Other',
                   famCode: null, ambiguousPrefix: false, unclassified: true };
  // A two-character rule that names its own type (the five Bulbs prefixes) gives a real
  // subcategory; the rest land on "Other", because two characters do not identify a
  // Lampshade's material or a Ceiling Rose's fitting.
  return { key: c.key, mainCategory: c.name, subCategory: c.sub || 'Other',
           famCode: c.code || null, ambiguousPrefix: false, unclassified: false };
}
