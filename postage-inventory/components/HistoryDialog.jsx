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

// SPEC 8.3 — what the requirement says MUST be logged. Named separately from what the
// source actually records (Goods received / Manual correction / Stock change), so the
// two are never confused: this is what SHOULD be there, not what is.
const SPEC = ['Unit-to-Unit Transfer', 'Manual Stock Correction', 'Stock Increase',
              'Stock Decrease', 'Goods Received from Container', 'Warehouse Change'];

// The action's tone, and the container reference that rides beside it.
const ACT = { 'Goods received': 'recv', 'CSV upload': 'csv',
              'Manual correction': 'man', 'Stock change': 'stk' };

// One cell, ported from the dashboard's histCellHTML. Every class it uses was already
// in the stylesheet; this component simply printed String(value) for all ten columns,
// so Qty came out as plain "-100" and Action as plain text where the published page
// shows a red figure and a toned badge.
function Cell({ m, k, kind }) {
  const v = m[k];
  // A BLANK HERE IS NORMAL, NOT A FAULT. A CSV upload has no informed person and a
  // goods receipt has no before/after — 40.5% of cells. A quiet dash carrying the
  // explanation on hover, rather than a loud "Unavailable" chip burying the real values.
  if (v === null || v === undefined || v === '')
    return <td><span className="hblank" title="Not recorded for this movement.">—</span></td>;

  if (kind === 'a') return (
    <td>
      <span className={'hact ' + (ACT[v] || '')} title={m.sr ? 'Source: ' + m.sr : undefined}>{v}</span>
      {m.cn && <span className="hcont">{m.cn}</span>}
    </td>
  );
  // The source records a time as well as a date. This column is 9% wide and the spec
  // calls it "Date", so the time rides in the tooltip rather than widening it.
  if (kind === 'd') return <td className="dt" title={m.tm ? v + ' ' + m.tm : undefined}>{v}</td>;
  if (kind === 'r') return <td className="rm">{v}</td>;
  if (kind === 'n') {
    // Stock Before/After hold a SHELF CODE on a location move ("L-A-02-A"), so the
    // numeric style is decided by the value, not by the column.
    if (!/^-?\d+$/.test(String(v))) return <td>{v}</td>;
    if (k === 'qt') {
      const n = Number(v);
      return <td className="n">
        <span className={'hqty ' + (n > 0 ? 'up' : n < 0 ? 'dn' : '')}>{n > 0 ? '+' : ''}{v}</span>
      </td>;
    }
    return <td className="n">{v}</td>;
  }
  return <td>{v}</td>;
}

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
                  {COLS.map(([k, , kind]) => <Cell key={k} m={m} k={k} kind={kind} />)}
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
        {/* WHERE THE ROWS CAME FROM, and what is not on screen. The dashboard says both
            in one line: how many of how many, that they are PARSED out of a free-text
            column rather than read from typed fields, and that the other region has its
            own movements behind its own button. Saying only "12 of 17" leaves a reader
            wondering where the rest went. */}
        {rows.length > 0 && (
          <p className="hmnote">
            {total > rows.length
              ? <>Showing the <b>{rows.length}</b> most recent of <b>{total}</b> recorded {name} movements, </>
              : <>All <b>{rows.length}</b> recorded {name} movement{rows.length === 1 ? '' : 's'}, </>}
            parsed from the free-text <code>inventory.product_history</code> log.
            {other > 0 && <> This SKU also has <b>{other}</b> {REGION[region === 'UK' ? 'DE' : 'UK']} movement
              {other === 1 ? '' : 's'} recorded.</>}
          </p>
        )}
        <details className="hmspec">
          <summary>What must be recorded (spec 8.3)</summary>
          <ul>
            {SPEC.map(a => <li key={a}>{a}</li>)}
            <li><em>Rule: every stock movement, without exception, writes one row.
              No stock change may occur without a corresponding audit record.</em></li>
          </ul>
        </details>
      </div>
    </div>
  );
}
