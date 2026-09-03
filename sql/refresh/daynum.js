'use strict';
// ONE conversion from a database timestamp to the day number the dashboard stores.
//
// The dashboard holds dates as whole days since the epoch and renders them with
// smDate(), which reads the number back with getUTCDate/getUTCMonth. So the number
// must be the UTC midnight of the calendar date a person would read off the record.
//
// Getting there is not "divide by a day". Two separate off-by-ones live in that:
//
//   1. Math.round pushes any afternoon timestamp onto the NEXT date. An order placed
//      31 Aug 19:45 displayed as 1 Sep. This was 38% of the dispatch rows.
//
//   2. Math.floor of the epoch looks right and is still wrong, because these columns
//      are `timestamp without time zone`. node-postgres builds the JS Date from the
//      stored wall clock in the PROCESS's timezone, and this server runs UTC+5:30 —
//      so a row stored 02:00 becomes 20:30Z the PREVIOUS day, and floor moves it back
//      a date. 90 order dates and 276 dispatch dates in the current window are stored
//      before 05:30 and would land on the wrong day that way.
//
// Reading the calendar fields back out is immune to both. getFullYear/getMonth/getDate
// return exactly the wall clock that was stored, whatever the server's timezone, and
// Date.UTC re-anchors it to the midnight the dashboard expects.
function dayNum(v){
  if (v === null || v === undefined || v === '') return 0;
  const d = (v instanceof Date) ? v : new Date(v);
  const t = d.getTime();
  if (!isFinite(t)) return 0;
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
}

// Whole hours between two timestamps. Unlike the date, this IS a plain difference:
// both instants carry the same timezone offset, so it cancels.
function hoursBetween(from, to){
  const a = (from instanceof Date) ? from : new Date(from);
  const b = (to   instanceof Date) ? to   : new Date(to);
  if (!isFinite(a.getTime()) || !isFinite(b.getTime())) return null;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 3600000));
}

module.exports = { dayNum, hoursBetween };
