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
        <span className="skspin" aria-hidden="true" />
        <span className="sktext">
          Reading {what} from LEDSone…
          {secs >= 2 && <b> {secs}s</b>}
        </span>
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
