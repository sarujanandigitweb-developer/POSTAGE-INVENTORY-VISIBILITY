'use client';
import { useEffect } from 'react';

// The comment dialog, matching the published page's: SKU, then the comment in full.
// That page reaches it through a `.cmb` button in the cell for the same reason — the
// sentence does not fit a column, and truncating it without somewhere to read it in
// full would lose the one thing it says.
export default function CommentDialog({ sku, text, onClose }) {
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <div className="smod" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="smbox" onClick={e => e.stopPropagation()}>
        <button type="button" className="smx" onClick={onClose} aria-label="Close">×</button>
        <p className="smsku">{sku}</p>
        <p className="smtxt">{text || 'Not listed'}</p>
      </div>
    </div>
  );
}
