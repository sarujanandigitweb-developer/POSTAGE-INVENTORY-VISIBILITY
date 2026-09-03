'use client';
import { useEffect } from 'react';

// The stock-history dialog, matching the published dashboard: the same ten columns
// in the same order, the same widths, and the same notes when a SKU has none or has
// more than the dialog shows.
const COLS = [
  ['dt', 'Date', 'd', 9], ['fl', 'From Location', '', 7], ['tl', 'To Location', '', 11],
  ['sb', 'Stock Before', 'n', 7], ['sa', 'Stock After', 'n', 7], ['qt', 'Qty', 'n', 6],
  ['ac', 'Action', 'a', 15], ['ip', 'Informed Person', '', 9],
  ['cp', 'Changed Person', '', 9], ['rm', 'Remarks', 'r', 20],
];
const REGION = { UK: 'UK', DE: 'German' };

export default function HistoryDialog({ sku, region, data, other, onClose }) {
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const rows = data?.rows || [];
  const total = data?.n || 0;
  const name = REGION[region] || region;

  return (
    <div className="hmodal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="hmbox" onClick={e => e.stopPropagation()}>
        <button type="button" className="hmx" onClick={onClose} aria-label="Close">×</button>
        <h3>Stock History</h3>
        <p className="hmsku">
          SKU: <b className="s">{sku}</b> · Region: <b>{name}</b>
          {total > 0 && (total > rows.length
            ? <> · <b>{rows.length}</b> most recent of <b>{total}</b> movements</>
            : <> · <b>{rows.length}</b> movement{rows.length === 1 ? '' : 's'}</>)}
        </p>

        <div className="hmscroll">
          <table className="htab">
            <colgroup>{COLS.map(c => <col key={c[0]} style={{ width: c[3] + '%' }} />)}</colgroup>
            <thead><tr className="hh">{COLS.map(c => <th key={c[0]}>{c[1]}</th>)}</tr></thead>
            <tbody>
              {rows.length ? rows.map((m, i) => (
                <tr className="hr" key={i}>
                  {COLS.map(([k, , kind]) => (
                    <td key={k} className={kind === 'n' ? 'n' : undefined}>
                      {m[k] === '' || m[k] === null || m[k] === undefined
                        ? <span className="hdash">—</span> : String(m[k])}
                    </td>
                  ))}
                </tr>
              )) : (
                <tr className="hr"><td className="hgap" colSpan={COLS.length}>
                  No {name} movement is recorded for this SKU.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* UK and German are separate dialogs, so a SKU's movements in the OTHER
            region would simply disappear. Naming them means splitting the two views
            never hides a movement; it only puts it behind the right button. */}
        {!rows.length && other > 0 && (
          <p className="hmnote">
            This SKU also has <b>{other}</b> {REGION[region === 'UK' ? 'DE' : 'UK']} movement
            {other === 1 ? '' : 's'} recorded.
          </p>
        )}
        {rows.length > 0 && total > rows.length && (
          <p className="hmnote">
            Showing the <b>{rows.length}</b> most recent of <b>{total}</b> recorded {name} movements.
          </p>
        )}
      </div>
    </div>
  );
}
