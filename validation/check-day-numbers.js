'use strict';
// Guards the ONE conversion from a database timestamp to the dashboard's day number.
//
// Two off-by-ones have already been shipped through this conversion:
//   Math.round(ms/86400000)  moved every afternoon timestamp to the next date (38% of
//                            dispatch rows, 44% of the pending queue)
//   Math.floor(ms/86400000)  looked like the fix and still moved every timestamp stored
//                            before 05:30 back a date, because these are `timestamp
//                            without time zone` columns and this host runs UTC+5:30
//
// NOTE ON WHAT CANNOT BE CHECKED. A data-level invariant does not catch either bug.
// Both dates on a row shift by the same rule, so the gap between them stays plausible
// and every row still passes. This was measured, not assumed: the invariant
// "x - d lies in [floor(th/24), floor(th/24)+1]" holds on all 2,228 rows of the
// ORIGINAL broken data. So the guard has to be at the source, and it is.
const fs=require('fs'), path=require('path');
const ROOT=path.resolve(__dirname,'..');
const { dayNum, hoursBetween } = require(path.join(ROOT,'sql','refresh','daynum.js'));

const fail=[];
const chk=(n,ok,note)=>{console.log('  '+(ok?'OK  ':'*** ')+n+(note!==undefined?'  — '+note:''));
  if(!ok)fail.push(n);};
const D=n=>new Date(n*86400000).toISOString().slice(0,10);

console.log('=== dayNum keeps the date that was stored ===');
// Dates are built the way node-postgres builds them for a timestamp-without-time-zone:
// from the stored wall clock, in the process's own timezone.
const cases=[
  ['2026-08-31T19:45:53','2026-08-31','evening — Math.round reports the next day'],
  ['2026-09-02T16:04:17','2026-09-02','afternoon — Math.round reports the next day'],
  ['2026-09-02T02:00:00','2026-09-02','early — floor(epoch) reports the previous day here'],
  ['2026-09-02T00:00:00','2026-09-02','midnight exactly'],
  ['2026-09-02T23:59:59','2026-09-02','last second of the day'],
  ['2026-09-02T09:59:19','2026-09-02','control, unaffected by either bug']
];
cases.forEach(([iso,want,why])=>{
  const got=D(dayNum(new Date(iso)));
  chk(iso+' -> '+want,got===want,got===want?why:'*** got '+got+' — '+why);
});
chk('an absent timestamp is 0, not a date',dayNum(null)===0&&dayNum(undefined)===0&&dayNum('')===0);
chk('an unparseable timestamp is 0, not NaN',dayNum('not a date')===0);

console.log('\n=== a duration is a difference, and stays one ===');
chk('11 hours across midnight',hoursBetween(new Date('2026-08-31T19:45:53'),
    new Date('2026-09-01T07:01:59'))===11);
chk('95 hours across four days',hoursBetween(new Date('2026-08-27T14:11:03'),
    new Date('2026-08-31T12:50:05'))===95);
chk('a dispatch before its order clamps to 0, never negative',
    hoursBetween(new Date('2026-09-02T10:00:00'),new Date('2026-09-01T10:00:00'))===0);

console.log('\n=== every extract that stores a date uses it ===');
const EXTRACT=path.join(ROOT,'sql','refresh','extract');
const files=fs.readdirSync(EXTRACT).filter(f=>f.endsWith('.js'));
// the one legitimate division: a difference of two values already aligned to midnight
const ALLOWED=[/const days = Math\.round\(\(today\.getTime\(\) - day0\) \/ 86400000\);/];
let scanned=0;
files.forEach(f=>{
  const src=fs.readFileSync(path.join(EXTRACT,f),'utf8');
  const lines=src.split('\n');
  const offenders=[];
  lines.forEach((l,i)=>{
    if(l.indexOf('86400000')===-1) return;
    if(ALLOWED.some(re=>re.test(l))) return;
    offenders.push((i+1)+': '+l.trim());
  });
  scanned++;
  chk(f+' does not hand-roll a day number',offenders.length===0,
      offenders.length?offenders.join(' | '):'clean');
});
chk('every extract was scanned',scanned===files.length,scanned+' files');

const NEEDS=['pending-dispatch.js','recent-dispatch.js','slow-moving.js','fixed-price.js'];
NEEDS.forEach(f=>{
  const src=fs.readFileSync(path.join(EXTRACT,f),'utf8');
  chk(f+' imports dayNum',/require\('\.\.\/daynum\.js'\)/.test(src)&&/dayNum\(/.test(src));
});

console.log('\n=== the dashboard reads the number back the way it is written ===');
const html=fs.readFileSync(process.env.DASHBOARD||
  path.join(ROOT,'dashboard','inventory-dashboard.html'),'utf8');
// dayNum anchors to UTC midnight, so smDate must read UTC fields or the date drifts again
const sm=html.slice(html.indexOf('const smDate'),html.indexOf('const smDate')+400);
chk('smDate reads the day number in UTC',/getUTCDate\(\)/.test(sm)&&/getUTCMonth\(\)/.test(sm),
    'dayNum anchors to UTC midnight; a local getter here would undo it');

console.log('\n'+(fail.length?'*** '+fail.length+' CHECK(S) FAILED':'ALL CHECKS PASSED'));
process.exit(fail.length?1:0);
