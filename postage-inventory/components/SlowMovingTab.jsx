'use client';
import { useEffect, useState } from 'react';
import { IconSearch, IconReset } from './Icons';
import Pager from './Pager';

const BANDS = ['Critical', 'High', 'Medium'];
const bandCls = b => (b === 'Critical' ? 'cr' : b === 'High' ? 'hi' : 'me');

export default function SlowMovingTab() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(true);
  const [q, setQ] = useState('');
  const [band, setBand] = useState('');
  const [ph, setPh] = useState('');
  const [held, setHeld] = useState(false);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState('25');

  useEffect(() => {
    let live = true; setBusy(true);
    const p = new URLSearchParams({ q, band, ph, held: held ? '1' : '', page: String(page), size: String(size) });
    fetch('/api/slow-moving?' + p)
      .then(r => r.json())
      .then(j => { if (!live) return; j.ok ? (setD(j), setErr(null)) : setErr(j.error); setBusy(false); })
      .catch(e => { if (live) { setErr(String(e.message || e)); setBusy(false); } });
    return () => { live = false; };
  }, [q, band, ph, held, page, size]);

  useEffect(() => { setPage(1); }, [q, band, ph, held]);

  if (err) return <div className="empty">{err}</div>;
  if (!d) return <div className="empty">Reading slow-moving stock from LEDSone…</div>;

  return (
    <>
      <div className="tbar">
        <div className="status">
          <span>Showing <b>{d.rows.length.toLocaleString()}</b> of <b>{d.total.toLocaleString()}</b> SKUs</span>
          <span>{d.holding.toLocaleString()} holding stock · {d.units.toLocaleString()} units</span>
          {busy && <span className="muted">loading…</span>}
        </div>
        <div className="tools">
          <span className="tsearch">
            <input type="search" value={q} onChange={e => setQ(e.target.value)}
                   placeholder="Search SKU or product name…" aria-label="Search SKU or product name" />
            <span className="tsearch-ic"><IconSearch size={15} /></span>
          </span>
          <select value={band} onChange={e => setBand(e.target.value)} aria-label="Priority band">
            <option value="">All bands</option>
            {BANDS.map(b => <option key={b} value={b}>{b} ({(d.bands[b] || 0).toLocaleString()})</option>)}
          </select>
          <select value={ph} onChange={e => setPh(e.target.value)} aria-label="PH owner">
            <option value="">All PH owners</option>
            {d.owners.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={held ? '1' : ''} onChange={e => setHeld(e.target.value === '1')} aria-label="Stock held">
            <option value="">Any stock</option>
            <option value="1">Holding stock only</option>
          </select>
          <button className="btn" type="button"
                  onClick={() => { setQ(''); setBand(''); setPh(''); setHeld(false); }}>
            <IconReset size={14} />Reset
          </button>
        </div>
      </div>

      <div className="scroll">
        <table className="fxtab smtab">
          <thead>
            <tr>
              <th>SKU</th><th>Image</th><th>Item Name</th>
              <th className="sm-days">Days Since Sale</th><th>Priority</th>
              <th className="sm-num">Units Held</th><th>Location</th>
              <th>PH Category</th><th>PH Owner</th><th>Last Sold</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map(r => (
              <tr key={r.s} className={r.units > 0 ? undefined : 'smz'}>
                <td className="fxsku">{r.s}</td>
                <td className="fximg">
                  {r.i ? <img src={r.i} alt="" width={30} height={30} loading="lazy"
                              style={{ objectFit: 'contain', borderRadius: 4 }} />
                       : <span className="fxnone">—</span>}
                </td>
                <td className="fxname">{r.n || <span className="fxna">Not recorded</span>}</td>
                <td className="sm-days">
                  {r.never ? <span className="smnever">Never sold</span> : r.days.toLocaleString()}
                </td>
                <td><b className={bandCls(r.band)}>{r.band}</b></td>
                <td className="sm-num">{r.units > 0 ? r.units.toLocaleString() : <span className="fxnone">0</span>}</td>
                <td>
                  {r.locs.length
                    ? r.locs.map((l, i) => <span className="smloc" key={i}>{l}</span>)
                    : <span className="fxnone">—</span>}
                </td>
                <td>{r.phc || <span className="fxnone">—</span>}</td>
                <td>{r.php || <span className="fxnone">—</span>}</td>
                <td className="fxdate">{r.last || <span className="fxnone">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {d.rows.length === 0 && <div className="empty">No SKUs match the current search and filters.</div>}
      <Pager total={d.total} page={d.page} pages={d.pages} size={size}
             onPage={setPage} onSize={setSize} label="SKUs" />
    </>
  );
}
