// ONE conversion from a database timestamp to the date string the UI shows.
//
// Every date column this app reads is `timestamp without time zone`. node-postgres
// builds the JS Date from the stored wall clock in THIS process's timezone, and the
// server runs UTC+5:30 — so `new Date(v).toISOString().slice(0,10)` shifts the value
// back across midnight and reports the PREVIOUS day for anything stored before 05:30.
//
// That is not a rare edge: the marketplace listing sync runs in the small hours, so it
// was mis-dating 100% of Amazon rows, 99.9% of eBay and 83% of Shopify on the SKU Fixed
// Price tab. Reading the calendar fields back returns exactly what was stored, whatever
// the server's timezone.
export function ymd(v) {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  if (!isFinite(d.getTime())) return null;
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// Whole hours between two timestamps. Unlike the date, this IS a plain difference:
// both instants carry the same offset, so it cancels.
export function hoursBetween(from, to) {
  const a = from instanceof Date ? from : new Date(from);
  const b = to instanceof Date ? to : new Date(to);
  if (!isFinite(a.getTime()) || !isFinite(b.getTime())) return null;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 3600000));
}

// hours -> the shortest true reading of it. A same-day dispatch reads "6h", never "0 days".
export function turnaround(h) {
  if (h === null || h === undefined || !isFinite(h)) return '';
  if (h < 24) return h + 'h';
  const d = Math.floor(h / 24), r = h % 24;
  return d + 'd' + (r ? ' ' + r + 'h' : '');
}
