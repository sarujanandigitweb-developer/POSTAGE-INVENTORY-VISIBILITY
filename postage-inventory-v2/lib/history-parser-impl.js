// Parser for inventory.product_history — REWRITTEN to the four history types the team
// actually uses. Everything else in that table (catalogue edits, product flags, CSV
// location moves, order cancellations, "low inventory checkup") is not a warehouse
// stock movement and is no longer carried.
//
//   1  UK stock changes   "UK stock changes: Unit3(Quantity) from 203 to 303,…"
//   2  Supply             "Supply - SU1201 loaded by … - Quantity changed from 15 to 215"
//   3  German Inventory   "germanInventory changed from 73 to 5 (…) by … On …"
//                         "German Inventory Changed from 9 to 209 by … on …"
//   4  German Supply      "German Supply - SU383 loaded by … germanInventory Inventory
//                          changed from 2 to 102"
//
// THE WAREHOUSE IS NAMED BY THE FIELD, NOT BY THE LABEL. The source writes the field in
// brackets and its own label outside them, and the two do not use the same numbering:
//
//     field       warehouse      measured pairs
//     Quantity -> Unit 3         6,309   (source label "Unit3")
//     unit1    -> Unit 18        2,473   (source label "Unit18")
//     unit3    -> Unit 4         3,891   (source label "Unit4")
//     unit2    -> Mark             757
//     unit5    -> Unit 5            24
//
// Every one of the 13,454 labelled segments agrees with that table, which is why the
// FIELD is treated as authoritative: a Supply line carries the field with no label at
// all, so without this mapping `unit3 changed from 100 to 38` would be filed under
// Unit 3 when it is Unit 4.
//
// Matching is case-insensitive throughout: the source writes germanInventory,
// German Inventory, unit3 and Unit3 interchangeably.

const WAREHOUSE = {                   // field name (lower-cased) -> warehouse shown
  quantity: 'Unit 3',
  unit1:    'Unit 18',
  unit3:    'Unit 4',
  unit2:    'Mark',
  unit5:    'Unit 5'
};
const GERMAN = 'German';
// The German inventory field is written four ways in the source. `tros_kronen` names
// the Kronen warehouse and is the same German stock figure, not a separate place.
const GINV_FIELD = '(?:german\\s*Inventory(?:\\s+Inventory)?|tros_kronen\\s+Inventory)';
// `from 0to 200` — the source drops the space on 64 lines. `from  to 60` — the before
// value is simply missing on 27 more. Both are real records and both are kept.
const PAIR = '(-?\\d*)\\s*to\\s+(-?\\d+)';

const clean = v => v === undefined || v === null ? '' : String(v).replace(/\s+/g, ' ').trim();
const tidy  = v => clean(v).replace(/[\s.,;:\]\[)\-]+$/, '').trim();
const num   = v => /^-?\d+$/.test(String(v).trim()) ? parseInt(v, 10) : null;
function qty(sb, sa){ const a = num(sb), b = num(sa); return (a === null || b === null) ? '' : b - a; }

// "<x> informed …" — the informed person is what precedes the word. A hyphen glued to
// it ("-informed") is not a name boundary.
function informed(rm){
  const s = clean(rm);
  const i = s.search(/\s+informed/i);
  return i > 0 ? s.slice(0, i).trim() : '';
}
const warehouseOf = (field, label) => WAREHOUSE[clean(field).toLowerCase()] || tidy(label) || '';

const DATE = '(\\d{4}-\\d{2}-\\d{2})';
const TIME = '(?:\\s+(\\d{1,2}:\\d{2}:\\d{2}))?';

const mv = o => ({ dt: o.dt || '', tm: o.tm || '', ac: o.ac || '', tl: o.tl || '',
                   sb: o.sb === undefined ? '' : o.sb, sa: o.sa === undefined ? '' : o.sa,
                   qt: o.qt === undefined ? '' : o.qt,
                   cp: o.cp || '', ip: o.ip || '', rm: o.rm || '',
                   cn: o.cn || '', fl: '', sr: o.sr || '' });

function parseLine(line){
  const L = String(line).replace(/\r/g, '').trim();
  if (!L) return [];

  // ---- 1. UK stock changes -------------------------------------------------
  // One line can carry SEVERAL segments; each is its own movement. Reading only the
  // first would lose the unit the stock was taken FROM.
  let m = new RegExp('^UK stock changes:\\s*(.+?)\\s*(?:\\(([^()]*)\\))?\\s*by\\s+(\\S+)\\s+on\\s+' +
                     DATE + TIME + '(?:\\s+via\\s+(.+?))?\\s*\\.?\\s*$', 'i').exec(L);
  if (m){
    const body = m[1], rm = tidy(m[2] || ''), cp = clean(m[3]);
    const out = [];
    const seg = /([A-Za-z0-9_ ]+?)\s*\(([^()]*)\)\s*from\s*([^,\s]*)\s*to\s*([^,\s]*)/g;
    let s;
    while ((s = seg.exec(body))){
      const sb = tidy(s[3]), sa = tidy(s[4]);
      // `Out Of Stock from  to Yes` is a flag, not a quantity. 79 lines, all skipped.
      if ((sb !== '' && num(sb) === null) || (sa !== '' && num(sa) === null)) continue;
      out.push(mv({ dt: m[4], tm: m[5], ac: 'Stock change',
                    tl: warehouseOf(s[2], s[1]), sb, sa, qt: qty(sb, sa),
                    cp, ip: informed(rm), rm, sr: tidy(m[6] || 'inventory CSV') }));
    }
    return out;
  }

  // ---- 4. German Supply (before plain Supply — it starts with the same word) --
  // NOT anchored: some lines glue a CSV-upload record in front of the supply record.
  m = new RegExp('German\\s+Supply\\s*-\\s*(\\S+)\\s+loaded by\\s+(.+?)\\s+On\\s+' + DATE + TIME +
                 '\\s*-?\\s*' + GINV_FIELD + '\\s+changed\\s+from\\s*' + PAIR, 'i').exec(L);
  if (m){
    return [mv({ dt: m[3], tm: m[4], ac: 'Goods received', tl: GERMAN,
                 sb: m[5], sa: m[6], qt: qty(m[5], m[6]),
                 cp: clean(m[2]), cn: m[1], sr: 'German supply' })];
  }

  // ---- 2. Supply -----------------------------------------------------------
  // A supply line lists every field it touched, most of them unchanged. The movement
  // that matters is the LAST one where the value actually moved — in
  //   "… Quantity from 15 to 15 - unit1 from 300 to 300 - unit3 from 0 to 0 -
  //     Quantity changed from 15 to 215"
  // that is the final +200 into Unit 3. The whole detail is kept as the remark so
  // nothing the source recorded is thrown away.
  m = new RegExp('(?:^|\\])\\s*Supply\\s*-\\s*(\\S+)\\s+loaded by\\s+(.+?)\\s+On\\s+' + DATE + TIME +
                 '\\s*-?\\s*(.*)$', 'i').exec(L);
  if (m){
    const detail = clean(m[5]);
    const segs = [];
    const re = /([A-Za-z0-9_]+)\s+changed\s+from\s*(-?\d*)\s*to\s+(-?\d+)/gi;
    let s;
    while ((s = re.exec(detail))) segs.push({ f: s[1], sb: s[2], sa: s[3] });
    if (!segs.length) return [];
    const moved = segs.filter(x => x.sb !== x.sa);
    const pick = moved.length ? moved[moved.length - 1] : segs[segs.length - 1];
    return [mv({ dt: m[3], tm: m[4], ac: 'Goods received',
                 tl: warehouseOf(pick.f), sb: pick.sb, sa: pick.sa, qt: qty(pick.sb, pick.sa),
                 cp: clean(m[2]), cn: m[1], rm: detail, sr: 'Supply' })];
  }

  // ---- 3. German Inventory --------------------------------------------------
  m = new RegExp(GINV_FIELD + '\\s+changed\\s+from\\s*' + PAIR +
                 '\\s*(?:\\(([^()]*)\\))?\\s*by\\s+(\\S+)\\s+On\\s+' + DATE + TIME, 'i').exec(L);
  if (m){
    // groups: 1 before, 2 after, 3 remark, 4 user, 5 date, 6 time
    const rm = tidy(m[3] || '');
    return [mv({ dt: m[5], tm: m[6], ac: 'Manual correction', tl: GERMAN,
                 sb: m[1], sa: m[2], qt: qty(m[1], m[2]),
                 cp: clean(m[4]), ip: informed(rm), rm, sr: 'German inventory' })];
  }

  return [];                                   // not one of the four types
}

// UK types are UK; German types are German. There is nothing else left to classify.
const region = tl => tl === GERMAN ? 'DE' : 'UK';

// ESM, NOT CommonJS, AND NOT LOADED THROUGH createRequire.
//
// This was a .cjs pulled in by lib/history-parser.js with
// `createRequire(import.meta.url)`. That is a RUNTIME resolution: webpack cannot
// follow it, so on Vercel the wrapper was left unbundled and its sibling .cjs was
// never copied beside it. Every request to /api/inventory died with
//
//   Error: Cannot find module './history-parser.cjs'
//   Require stack: /vercel/path0/postage-inventory/lib/history-parser.js
//
// and, because the import fails before the route's own try/catch, Next answered with
// an HTML 500 — which the browser reported as "Unexpected token '<'".
//
// Locally it worked, twice over: `next dev` resolves from the real directory, and the
// trace file even listed the .cjs. Neither is proof the deployed bundle can load it.
// A plain static export removes the question — webpack bundles this like any module.
export { parseLine, region, WAREHOUSE, clean, tidy, qty, informed, warehouseOf };
