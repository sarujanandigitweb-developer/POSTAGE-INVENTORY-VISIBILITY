'use client';
import { useEffect, useState } from 'react';

// A bare "Reading…" line gives a reader nothing: no shape, no sense of whether it
// has stalled. This shows the table that is coming, says what it is reading and how
// long it has been, and — past the point where a wait stops feeling normal —
// explains WHY, so a slow first load does not read as a broken page.
export default function Loading({ what, rows = 8, cols = 8, note }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="skwrap" role="status" aria-live="polite">
      <div className="skbar">
        {/* The app's own cube, drawn stroke by stroke. A bare rotating ring says only
            "something is happening"; this says WHICH page is assembling, and the three
            faces arriving in turn read as progress rather than as a wait. */}
        <span className="skmark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
               strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path className="f1" d="M3.5 7.5 12 3l8.5 4.5L12 12z" />
            <path className="f2" d="M3.5 7.5 12 12v9L3.5 16.5z" />
            <path className="f3" d="M20.5 7.5 12 12v9l8.5-4.5z" />
          </svg>
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
