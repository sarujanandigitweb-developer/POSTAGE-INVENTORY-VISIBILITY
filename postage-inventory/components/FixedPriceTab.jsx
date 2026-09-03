'use client';
import { useEffect, useState } from 'react';
import { IconSearch, IconReset } from './Icons';
import Pager from './Pager';

const gbp = p => (p == null ? null : '£' + (p / 100).toFixed(2));

export default function FixedPriceTab() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(true);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [mk, setMk] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState('25');

  useEffect(() => {
    let live = true; setBusy(true);
    const p = new URLSearchParams({ q, type, mk, page: String(page), size: String(size) });
    fetch('/api/fixed-price?' + p)
      .then(r => r.json())
      .then(j => { if (!live) return; j.ok ? (setD(j), setErr(null)) : setErr(j.error); setBusy(false); })
      .catch(e => { if (live) { setErr(String(e.message || e)); setBusy(false); } });
    return () => { live = false; };
  }, [q, type, mk, page, size]);

  useEffect(() => { setPage(1); }, [q, type, mk]);

  if (err) return <div className="empty">{err}</div>;
  if (!d) return <div className="empty">Reading fixed prices from LEDSone…</div>;

  return (
    <>
      <div className="tbar">
        <div className="status">
          <span>Showing <b>{d.rows.length.toLocaleString()}</b> of <b>{d.total.toLocaleString()}</b> SKUs</span>
          <span>{d.single.toLocaleString()} single · {d.combo.toLocaleString()} combo</span>
          {busy && <span className="muted">loading…</span>}
        </div>
        <div className="tools">
          <span className="tsearch">
            <input type="search" value={q} onChange={e => setQ(e.target.value)}
                   placeholder="Search SKU or product name…" aria-label="Search SKU or product name" />
            <span className="tsearch-ic"><IconSearch size={15} /></span>
          </span>
          <select value={type} onChange={e => setType(e.target.value)} aria-label="SKU type">
            <option value="">All types</option>
            <option value="single">Single</option>
            <option value="combo">Combo</option>
          </select>
          <select value={mk} onChange={e => setMk(e.target.value)} aria-label="Listed on">
            <option value="">Listed anywhere</option>
            {d.markets.map(m => <option key={m.key} value={m.key}>Listed on {m.name}</option>)}
          </select>
          <button className="btn" type="button" onClick={() => { setQ(''); setType(''); setMk(''); }}>
            <IconReset size={14} />Reset
          </button>
        </div>
      </div>

      <div className="scroll">
        <table className="fxtab">
          <thead>
            <tr>
              <th>SKU</th><th>Image</th><th>Product Name</th><th>Type</th>
              {d.markets.map(m => <th key={m.key} className="fxprice">{m.name}</th>)}
              {d.absent.map(a => <th key={a} className="fxprice">{a}</th>)}
              <th>Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map(r => (
              <tr key={r.s}>
                <td className="fxsku">{r.s}</td>
                <td className="fximg">
                  {r.i ? <img src={r.i} alt="" width={30} height={30} loading="lazy"
                              style={{ objectFit: 'contain', borderRadius: 4 }} />
                       : <span className="fxnone">—</span>}
                </td>
                <td className="fxname">{r.n || <span className="fxna">Not recorded</span>}</td>
                <td>{r.combo ? 'Combo' : 'Single'}</td>
                {d.markets.map(m => (
                  <td key={m.key} className="fxprice">{gbp(r[m.key]) || <span className="fxnone">—</span>}</td>
                ))}
                {/* Wayfair and Temu hold no listing table, price column or channel
                    value anywhere in this database. Declared empty, never blank. */}
                {d.absent.map(a => (
                  <td key={a} className="fxna" title={`No ${a} data source exists in the database.`}>
                    No data source
                  </td>
                ))}
                <td className="fxdate">
                  {Object.values(r.d || {}).sort().slice(-1)[0] || <span className="fxnone">—</span>}
                </td>
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
