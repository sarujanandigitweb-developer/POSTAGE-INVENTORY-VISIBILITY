// Reading the team's postage workbooks. Every rule here was established against the real
// sheets on the HTML dashboard; the reasoning is kept because none of it is guessable.

// TWO WORKBOOKS, because no single one holds everything. The prices moved to a new
// workbook with a tab per table; postage Dimensions, Contact Details, Box Sizes and Box
// Purchase History were never carried over and still live only in the original.
export const BOOKS = {
  live:   '1o66uEfGhqlgKQZO5MXkzsRLRWTyAnq-niloNBhcx99g',
  legacy: '1-4AnU5osx50_LRwwBPXwtVYWG_dk09psx8Jgsd3mYHI',
};

// what counts as a number in these sheets — declared above its first use
export const NUM = /^[£$€]?\s*-?[\d,]+(\.\d+)?\s*%?$/;
const LINK = /^https?:\/\//i;
// a phone number or an email is a value, never a sub-heading
const CONTACT = /@|^[\d +()\-]{6,}$/;

// ENDPOINT CHOICE MATTERS. `gviz/tq?tqx=out:csv` is the usual trick and it SILENTLY
// LOSES DATA on these sheets: it returned 281 rows against the export's 352 and
// collapsed the international pricing rows to a single cell. `/export?format=csv`
// returns the true grid.
export const csvUrl = (gid, book) =>
  'https://docs.google.com/spreadsheets/d/' + (BOOKS[book] || BOOKS.live) +
  '/export?format=csv&gid=' + gid;
export const editUrl = (gid, book) =>
  'https://docs.google.com/spreadsheets/d/' + (BOOKS[book] || BOOKS.live) +
  '/edit?gid=' + gid + '#gid=' + gid;

export const TABS = [
  { book: 'live', gid: '33893969', title: 'Postage Prices', cols: 5,
    // A-E only. From column F the sheet carries working notes — a "BT POSTCODE" aside,
    // a stray 4.53, a sentence in Tamil. The table ends at the last row priced in C, D
    // or E; below it sit a scratch "amazon prime" block and three box DIMENSIONS
    // ("120 X 60 X 45") typed into the price column.
    last: r => [2, 3, 4].some(j => NUM.test(String(r[j] ?? '').trim())) },
  { book: 'live', gid: '1953526121', title: 'International Prices', cols: 0,
    // One country per row across stacked bands, so a real row is wide. Ten blank rows
    // separate the table from four carrier notes, each only two cells wide. NOTE the
    // last real row, "Extra Compensation", starts at column 28 with an EMPTY column A —
    // a first-column test would throw it away, which is why this counts cells.
    last: r => r.filter(c => String(c ?? '').trim() !== '').length >= 5 },
  // ONE request, four sections. The legacy tab also opens with its own copies of
  // postage Prices and Intenational Prices; those are superseded by the two tabs above
  // and deliberately NOT taken, or every price would be listed twice from two sources
  // that can disagree.
  { book: 'legacy', gid: '1966712240',
    take: ['postage Dimensions', 'Contact Details', 'Box Sizes', 'Box Purchase History'] },
];

// A real CSV reader: quoted fields, embedded commas and newlines, doubled quotes,
// CR/LF/CRLF. Splitting on ',' would destroy every quoted price description.
export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  const s = String(text).replace(/^﻿/, '');       // strip the BOM Google prepends
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
      continue;
    }
    if (ch === '"') { q = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Keep only the real table: the declared columns, and nothing after the last row that
// passes the tab's own test. Blank rows INSIDE the table are left alone — they separate
// the carrier groups and trim() drops them afterwards.
export function clip(rows, tab) {
  const cut = tab.cols ? rows.map(r => r.slice(0, tab.cols)) : rows;
  let end = -1;
  cut.forEach((r, i) => { if (tab.last(r)) end = i; });
  return end < 0 ? [] : cut.slice(0, end + 1);
}

export function trim(rows) {
  const keep = rows.filter(r => r.some(c => String(c).trim() !== ''));
  let width = 0;
  for (const r of keep) {
    for (let j = r.length - 1; j >= 0; j--) {
      if (String(r[j]).trim() !== '') { if (j + 1 > width) width = j + 1; break; }
    }
  }
  return keep.map(r => Array.from({ length: width }, (_, j) => r[j] ?? ''));
}

// LEGACY WORKBOOK ONLY: one tab, several tables, separated by numbered headings.
const HEAD = /^\s*\d+\s*[.)]\s*[A-Za-z]/;
const unnumber = t => String(t).replace(/^\s*\d+\s*[.)]\s*/, '').trim();
export function splitSections(rows) {
  const marks = [];
  rows.forEach((r, i) => {
    for (let j = 0; j < r.length; j++) {
      if (r[j] && HEAD.test(r[j])) { marks.push({ i, title: r[j].trim() }); return; }
    }
  });
  if (!marks.length) return rows.length ? [{ title: '', rows }] : [];
  return marks.map((m, n) => ({
    title: unnumber(m.title),
    rows: trim(rows.slice(m.i + 1, n + 1 < marks.length ? marks[n + 1].i : rows.length)),
  })).filter(s => s.rows.length);
}

const cells = r => r.map(c => String(c ?? '').trim()).filter(Boolean);
// A sub-heading is a lone value in the FIRST column that is not a number, a link or a
// contact detail — "ROYAL MAIL", "Boxes - Double Wall". Without the first-column test the
// stray phone numbers in Contact Details would each become a heading of their own.
const isSub = r => {
  const f = cells(r);
  if (f.length !== 1 || !String(r[0] ?? '').trim()) return false;
  return !NUM.test(f[0]) && !LINK.test(f[0]) && !CONTACT.test(f[0]);
};

// Split one section into the links it opens with, its header block, and its body grouped
// under sub-headings.
export function analyse(rows) {
  const links = [], body = [];
  for (const r of rows.filter(r => cells(r).length)) {
    const u = cells(r).find(c => LINK.test(c));
    // a row whose ONLY content is a link points at another sheet; it belongs above the
    // table, not inside it
    if (u && cells(r).length === 1) links.push(u); else body.push(r);
  }
  let width = body.reduce((w, r) => Math.max(w, r.length), 0);
  // the commonest filled-cell count is what a DATA row looks like in this table
  const counts = {};
  for (const r of body) { const n = cells(r).length; counts[n] = (counts[n] || 0) + 1; }
  const modal = Object.keys(counts).reduce((b, n) => (counts[n] > (counts[b] || -1) ? +n : b), 0);
  // the header is the run of label rows the section opens with — International Prices
  // stacks five levels, most tables have one
  const head = [];
  for (const r of body) {
    const f = cells(r);
    if (f.length < 2 || f.some(c => NUM.test(c))) break;
    head.push(r);
    if (f.length >= modal) break;
  }
  // a column empty in EVERY row is a gap the sheet left behind, not a field
  const keep = [];
  for (let j = 0; j < width; j++) {
    if (body.some(r => String(r[j] ?? '').trim() !== '')) keep.push(j);
  }
  let B = body, H = head;
  if (keep.length && keep.length < width) {
    const squeeze = r => keep.map(j => r[j] ?? '');
    B = body.map(squeeze); H = head.map(squeeze); width = keep.length;
  }
  // Group the remainder under its sub-headings. NOTHING is nested: in this sheet a
  // heading and a priced-service-with-no-price look identical ("SMART TRACK" beside
  // "Royal Mail Internal(prime label)"), so inferring a parent would put a real service
  // in a position it does not hold.
  const groups = [];
  let cur = null;
  for (const r of B.slice(H.length)) {
    if (isSub(r)) { cur = { title: cells(r)[0], rows: [] }; groups.push(cur); continue; }
    if (!cur) { cur = { title: '', rows: [] }; groups.push(cur); }
    cur.rows.push(r);
  }
  if (!groups.length) groups.push({ title: '', rows: [] });
  return { links, head: H, groups, width, modal };
}

export const isNum = v => NUM.test(String(v ?? '').trim());

// ---------------------------------------------------------------------------
// HEADER GEOMETRY. Ported from the published dashboard, which had to solve this
// against the real sheets. A stacked header is NOT one <th> per cell per row: the
// upper rows are merged bands in the sheet, so they must span the columns they
// cover, and the deepest row names the columns one-for-one.

// A column counts as used if ANY header row names it or any data row fills it.
// Counting only the leaf row and the body was too strict: "DPD" is a real group with
// a label and no figures under it, and trimming it dropped it out of the banner above,
// which the sheet plainly shows covering it.
export function usedCols(head, groups, width) {
  const used = new Array(width).fill(false);
  const mark = r => { for (let j = 0; j < width; j++)
    if (String(r[j] ?? '').trim()) used[j] = true; };
  head.forEach(mark);
  groups.forEach(g => g.rows.forEach(mark));
  return used;
}

// Where the leaf row repeats its own first label, a NEW side-by-side table begins.
// International Prices puts "Country" at column 0 and again further right; a band from
// the left table must not bleed across that seam.
export function blockCuts(head, width) {
  const out = [];
  if (!head.length) return out;
  const leaf = head[head.length - 1];
  const first = String(leaf[0] ?? '').trim().toLowerCase();
  if (!first) return out;
  for (let j = 1; j < width; j++)
    if (String(leaf[j] ?? '').trim().toLowerCase() === first) out.push(j);
  return out;
}

// One header row as spanned cells. A label runs until the next label on its own row,
// or a seam, whichever comes first — then trailing columns nothing uses are trimmed.
function spanRow(r, width, cuts, used) {
  const at = [];
  for (let j = 0; j < width; j++) if (String(r[j] ?? '').trim()) at.push(j);
  const cells = [];
  let pos = 0;
  at.forEach((j, k) => {
    if (j > pos) cells.push({ span: j - pos, text: '', gap: true });
    let end = k + 1 < at.length ? at[k + 1] : width;
    for (const c of cuts) if (c > j && c < end) end = c;
    let last = j;
    for (let c = j; c < end; c++) if (used[c]) last = c;
    const span = Math.max(1, last - j + 1);
    cells.push({ span, text: String(r[j]).trim(), gl: true });
    pos = j + span;
  });
  if (pos < width) cells.push({ span: width - pos, text: '', gap: true });
  return cells;
}

// The whole header, as rows of {span,text} — ready to render, with no DOM in the way.
export function headerRows(head, groups, width) {
  if (!head.length) return [];
  const used = usedCols(head, groups, width);
  const cuts = blockCuts(head, width);
  const seen = [...cuts];
  return head.map((r, i) => {
    // The DEEPEST row names the columns one-for-one and must NEVER span: its "Total" at
    // column 4 is one column, not the four that follow it.
    if (i === head.length - 1) {
      const cells = [];
      for (let j = 0; j < width; j++) cells.push({ span: 1, text: String(r[j] ?? '').trim() });
      return { kind: 'main', cells };
    }
    const cells = spanRow(r, width, [...seen], used);
    // this row's own labels become boundaries for every row beneath it
    for (let j = 0; j < width; j++)
      if (String(r[j] ?? '').trim() && !seen.includes(j)) seen.push(j);
    seen.sort((a, b) => a - b);
    // the first row is the sheet's banner ("(SMALL PARCELS) 0-2KG"); the rows between it
    // and the leaf names are carrier/service groups
    return { kind: i === 0 ? 'banner' : 'sub', cells };
  });
}

// A "Monthly Total" / "Sub Total" column marks its rows as summary rows.
export function totalCol(head, width) {
  if (!head.length) return -1;
  const main = head[head.length - 1];
  for (let j = 0; j < width; j++)
    if (/^\s*(monthly\s*total|sub\s*total)\s*$/i.test(String(main[j] ?? ''))) return j;
  return -1;
}

// Column names for the search-in-column control. They come from the table ITSELF: the
// deepest header row names each column, and the merged group rows above say which carrier
// it belongs to. On a 36-column table "Price per kilo" appears four times, so the group
// prefix is what makes the choice mean anything. Nothing is invented — a column the sheet
// does not name is offered by position.
export function colLabels(head, width) {
  const main = head.length ? head[head.length - 1] : null;
  const groups = head.slice(0, -1);
  // for each group row, which label covers column j
  const cover = groups.map(r => {
    const at = [];
    for (let j = 0; j < width; j++) if (String(r[j] ?? '').trim()) at.push(j);
    const m = [];
    at.forEach((j, k) => {
      const end = k + 1 < at.length ? at[k + 1] : width;
      for (let c = j; c < end; c++) m[c] = String(r[j]).trim();
    });
    return m;
  });
  const out = [];
  for (let j = 0; j < width; j++) {
    const own = main ? String(main[j] ?? '').trim() : '';
    let grp = '';
    for (let g = cover.length - 1; g >= 0; g--) if (cover[g][j]) { grp = cover[g][j]; break; }
    const name = own || grp || 'Column ' + (j + 1);
    out.push({ i: j, label: (grp && own && grp !== own ? grp + ' › ' + own : name).replace(/\s+/g, ' ') });
  }
  return out;
}

// A search is either across the whole row or inside one column. Restricting it matters on
// these tables: "Total" appears in four places on International Prices, so an unscoped
// search for a figure returns rows that match a different carrier's column.
export function rowMatches(r, q, col) {
  if (!q) return true;
  const cells = col === null || col === undefined ? r : [r[col]];
  return cells.some(c => String(c ?? '').toLowerCase().includes(q));
}
