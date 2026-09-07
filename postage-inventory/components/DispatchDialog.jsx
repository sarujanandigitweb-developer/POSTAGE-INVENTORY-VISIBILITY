'use client';
import { useEffect } from 'react';

// The dispatch detail dialog, ported from the published dashboard's pdOpen/rdOpen.
//
// BOTH VIEWS USE THE SAME COMPONENT, and that is the point of it. The queue and the
// dispatched tab group their facts into the same four named blocks in the same order,
// so a reader learns the shape once and does not go hunting when they switch tabs.
// Only the block titles and which fields go in them differ.

const ICON = {
  order: <><path d="M4 4h10l6 6v10H4z" /><path d="M14 4v6h6" /></>,
  date:  <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" /></>,
  pin:   <><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  home:  <><path d="M4 21V9l8-6 8 6v12" /><path d="M9 21v-7h6v7" /></>,
  card:  <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>,
  truck: <><path d="M3 7h11v10H3z" /><path d="M14 10h4l3 3v4h-7z" /><circle cx="7" cy="18" r="1.6" /><circle cx="17" cy="18" r="1.6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  flag:  <><path d="M5 21V4h13l-2.5 4L18 12H5" /></>,
  tag:   <><path d="M3 12l9-9h8v8l-9 9z" /><circle cx="16.5" cy="7.5" r="1.4" /></>,
  alert: <><path d="M12 3l9 17H3z" /><path d="M12 9v5M12 17.2v.1" /></>,
  box:   <><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /></>,
};
const Ico = ({ k }) => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON[k]}</svg>
);
const CopyIco = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
);

export const Chip = ({ cls, children }) => <span className={'bdg' + (cls ? ' ' + cls : '')}>{children}</span>;

// A value that is genuinely absent says so, rather than rendering an empty box that
// looks like a value nobody filled in.
export function Field({ icon, label, value, copy, sub }) {
  const has = value !== undefined && value !== null && value !== '' &&
              (typeof value !== 'string' || value.trim() !== '');
  return (
    <div>
      <div className="f"><Ico k={icon} />{label}</div>
      <div className={'v' + (has ? '' : ' na')}>
        {has ? value : <span className="pdchip mute">— not recorded</span>}
        {copy && has && typeof value === 'string' && (
          <button type="button" className="pdcopy" title="Copy" aria-label={'Copy ' + label}
                  onClick={() => navigator.clipboard?.writeText(value)}><CopyIco /></button>
        )}
        {sub && <span className="sub">{sub}</span>}
      </div>
    </div>
  );
}

export const Section = ({ title, children }) => (
  <div className="pdmsec"><h5>{title}</h5><div className="pdmgrid">{children}</div></div>
);

export default function DispatchDialog({ title, pill, state, stateIcon = 'truck', meta,
                                         onExport, sections, lines, error, onClose }) {
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const li = lines || [];
  const qty = li.reduce((n, l) => n + (Number(l.q) || 0), 0);

  return (
    <div className="pdmodal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="pdbox" onClick={e => e.stopPropagation()}>
        <button type="button" className="smx" onClick={onClose} aria-label="Close">×</button>
        <h3 className="pdmtitle">{title}<span className="pdmpill">{pill}</span></h3>

        <div className="pdmhead">
          <div className="pdmstate"><Ico k={stateIcon} /><b>{state}</b>{meta ? <> · {meta}</> : null}</div>
          <div className="pdmacts">
            <button className="pdmbtn" type="button" onClick={() => window.print()}>
              <Ico k="order" />Print</button>
            <button className="pdmbtn" type="button" onClick={onExport}>
              <Ico k="box" />Export</button>
          </div>
        </div>

        <div className="pdmcard">{sections}</div>

        <h4 className="pdmh">Order lines{li.length ? ` (${li.length})` : ''}</h4>
        {li.length ? (
          <table className="pdlines">
            <colgroup><col className="pl-sku" /><col className="pl-name" />
                      <col className="pl-q" /><col className="pl-k" /></colgroup>
            <thead><tr><th>SKU</th><th>Product Name</th>
              <th style={{ textAlign: 'right' }}>Qty</th>
              <th style={{ textAlign: 'right' }}>Stock</th></tr></thead>
            <tbody>
              {li.map((l, i) => (
                <tr key={i}>
                  <td className="sku">{l.s || '—'}
                    {l.s && <button type="button" className="pdcopy" title="Copy SKU" aria-label="Copy SKU"
                                    onClick={() => navigator.clipboard?.writeText(l.s)}><CopyIco /></button>}
                  </td>
                  <td>{l.n || <span className="pdna">— not recorded</span>}</td>
                  <td className="n">{l.q || '—'}</td>
                  {/* a line whose stock is below what the order needs is the one to look at */}
                  <td className={'n' + (l.k !== null && l.q && l.k < l.q ? ' pdlow' : '')}>
                    {l.k === null || l.k === undefined ? '—' : l.k.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* one order carries 19 lines; the reader should not have to add them up */}
            {li.length > 1 && (
              <tfoot><tr><td colSpan={2}>{li.length} lines</td>
                <td className="n">{qty}</td><td className="n" /></tr></tfoot>
            )}
          </table>
        ) : <p className="hmsku">No order lines recorded for this order.</p>}

        {error && <p className="pdmerr"><b className="pdbad">Shipping error:</b> {error}</p>}

        <div className="pdmfoot">
          <button className="pdmbtn" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
