'use client';
import { useEffect, useState } from 'react';

// A bare "Reading…" line gives a reader nothing: no shape, no sense of whether it
// has stalled. This shows the table that is coming, says what it is reading and how
// long it has been, and — past the point where a wait stops feeling normal —
// explains WHY, so a slow first load does not read as a broken page.

// ONE MARK PER TAB, because the mark is the fastest thing on the screen to read. Every
// tab used to draw the same cube, so the only way to tell which page was loading was to
// read the sentence beside it. A truck, a ship and an envelope are recognised before the
// words are, and on a cold open — which is where this component is seen at all — that is
// several seconds of knowing where you are.
//
// All of them are built the same way on purpose: a 40x24 viewBox, currentColor, stroke
// 1.9 with round joins, sized 34x22 in the bar. They are the app's existing line weight,
// not a set of borrowed icons, so they sit in the same bar without re-tuning it. Movement
// is CSS (theme.css, `.skmark` block) rather than SMIL, so one reduced-motion rule turns
// every one of them off.
const MARKS = {
  // INVENTORY keeps the app's own cube — the three faces arrive in turn, which reads as
  // assembling rather than as waiting. It is also the fallback for any caller with no kind.
  cube: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
         strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path className="f1" d="M3.5 7.5 12 3l8.5 4.5L12 12z" />
      <path className="f2" d="M3.5 7.5 12 12v9L3.5 16.5z" />
      <path className="f3" d="M20.5 7.5 12 12v9l8.5-4.5z" />
    </svg>
  ),

  // DISPATCH — a courier van. The wheels turn, the body bobs on them, and the speed
  // lines behind it stream past, so it reads as "on its way" rather than "parked".
  truck: (
    <svg viewBox="0 0 40 24" width="34" height="22" fill="none" stroke="currentColor"
         strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <g className="tkbody">
        <path d="M6 16.5V6.5h13v10" />
        <path d="M19 16.5V9.5h5.5L29 14v2.5" />
      </g>
      <g className="tkw1"><circle cx="12" cy="18.5" r="2.7" /><path d="M12 16.6v1.1" /></g>
      <g className="tkw2"><circle cx="26" cy="18.5" r="2.7" /><path d="M26 16.6v1.1" /></g>
      <path className="tkl1" d="M1.5 8.5h3.5" />
      <path className="tkl2" d="M0 12.5h3" />
      <path className="tkl3" d="M1.5 16.5h2.5" />
    </svg>
  ),

  // CONTAINER DETAILS — a container ship. The hull rocks on a swell that slides beneath
  // it, and the boxes it carries are the same rectangles the tab is about to list.
  ship: (
    <svg viewBox="0 0 40 24" width="34" height="22" fill="none" stroke="currentColor"
         strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <g className="shhull">
        <path d="M7 14.5h24l-3.2 5H10.2z" />
        <rect className="shb1" x="11" y="9.5" width="8" height="5" rx="1" />
        <rect className="shb2" x="21" y="9.5" width="8" height="5" rx="1" />
        <rect className="shb3" x="16" y="4.5" width="8" height="5" rx="1" />
      </g>
      <path className="shwave" strokeWidth="1.6"
            d="M-8 21.5c2 0 2 1.5 4 1.5s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5
               2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5" />
    </svg>
  ),

  // POSTAGE INFORMATION — an envelope with its letter rising out of it, because this tab
  // is the one thing on the page that is not the database: it is the team's own sheet.
  envelope: (
    <svg viewBox="0 0 40 24" width="34" height="22" fill="none" stroke="currentColor"
         strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <g className="envletter"><path d="M15 12V4.5h10V12" /><path d="M17.5 7h5M17.5 9.5h5" /></g>
      <path d="M9 10.5h22v10H9z" />
      <path d="M9 10.5 20 18l11-7.5" />
    </svg>
  ),

  // SKU FIXED PRICE — a price tag, swinging on its hole the way a tag on a shelf does.
  tag: (
    <svg viewBox="0 0 40 24" width="34" height="22" fill="none" stroke="currentColor"
         strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <g className="tagswing">
        <path d="M20 3.5h8.5a2 2 0 0 1 2 2V14L20 4.5z" />
        <path d="M9.5 14 20 3.5 30.5 14 20 24.5z" />
        <circle cx="26.5" cy="7.5" r="1.3" />
      </g>
    </svg>
  ),

  // SLOW-MOVING STOCK — a clock. This tab is entirely about elapsed time: days since the
  // last real sale. The hand sweeps once a cycle rather than ticking, so it does not
  // compete with the bar beside it.
  clock: (
    <svg viewBox="0 0 40 24" width="34" height="22" fill="none" stroke="currentColor"
         strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="20" cy="12" r="8.5" />
      <path d="M20 7.5V12h3.5" className="clkhand" />
    </svg>
  ),
};

export default function Loading({ what, rows = 8, cols = 8, note, kind = 'cube' }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const mark = MARKS[kind] || MARKS.cube;

  return (
    <div className="skwrap" role="status" aria-live="polite">
      <div className="skbar">
        {/* A bare rotating ring says only "something is happening"; this says WHICH page
            is assembling. `sk-<kind>` is what the CSS hangs each animation on. */}
        <span className={'skmark sk-' + (MARKS[kind] ? kind : 'cube')} aria-hidden="true">
          {mark}
        </span>
        <span className="sktext">
          Reading {what} from LEDSone…
          {secs >= 2 && <b> {secs}s</b>}
        </span>
        <span className="skprog" aria-hidden="true"><i /></span>
        {secs >= 6 && (
          <span className="sknote">
            {note || 'First open builds the whole set; every page after this is instant.'}
          </span>
        )}
      </div>

      <div className="sktable" aria-hidden="true">
        <div className="skhead">
          {Array.from({ length: cols }, (_, i) => <span key={i} className="skcell" />)}
        </div>
        {Array.from({ length: rows }, (_, r) => (
          <div className="skrow" key={r} style={{ animationDelay: (r * 70) + 'ms' }}>
            {Array.from({ length: cols }, (_, i) => (
              <span key={i} className="skcell" style={{ width: i === 1 ? '38%' : undefined }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
