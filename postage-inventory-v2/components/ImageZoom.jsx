'use client';
import { useEffect, useState } from 'react';
import { IconZoom, IconClose } from './Icons';

// A product thumbnail you can actually look at. At 30px these were unreadable — you
// could tell there was a lamp there and nothing more — so the cell shows a larger
// thumbnail, and hovering it offers a zoom control that opens the full image.
//
// The whole cell is the button, not just the icon: a 44px target is small enough to
// miss, and there is nothing else in the cell to click.
export default function ImageZoom({ src, alt = '', caption = '', size = 44 }) {
  const [open, setOpen] = useState(false);

  // Escape closes it. A dialog that can only be dismissed by mouse is a trap for anyone
  // working down the table on the keyboard.
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // an empty frame, not a bare dash — the column keeps its rhythm down the page
  if (!src) return <span className="fxfr empty" aria-hidden="true" />;

  return (
    <>
      {/* .fxfr / .fxthumb are the published page's own frame, already ported into
          dashboard.css. Reusing them keeps ONE definition; a parallel .imgz box would
          drift from it the first time either is touched. */}
      <button type="button" className="fxfr imgz" onClick={() => setOpen(true)}
              title={caption ? 'Zoom ' + caption : 'Zoom image'}
              aria-label={caption ? 'Zoom image of ' + caption : 'Zoom image'}>
        <img className="fxthumb" src={src} alt={alt} loading="lazy" />
        <span className="imgz-ov" aria-hidden="true"><IconZoom size={15} /></span>
      </button>

      {open && (
        <div className="imgz-modal" role="dialog" aria-modal="true"
             aria-label={caption ? 'Image of ' + caption : 'Image'}
             onClick={() => setOpen(false)}>
          <div className="imgz-box" onClick={e => e.stopPropagation()}>
            <button type="button" className="imgz-x" onClick={() => setOpen(false)}
                    aria-label="Close">
              <IconClose />
            </button>
            {/* The image is served at whatever size the catalogue holds; it is shown at
                its natural size up to the viewport, never upscaled into a blur. */}
            <img src={src} alt={alt} className="imgz-full" />
            {caption && <p className="imgz-cap">{caption}</p>}
          </div>
        </div>
      )}
    </>
  );
}
