'use client';
import { perPage, useAutoRows } from '@/lib/rows';
import { useEffect, useMemo, useState } from 'react';
import { IconSearch, IconReset } from './Icons';
import Pager from './Pager';
import Loading from './Loading';

const PRI = { 3: 'Critical', 2: 'High', 1: 'Normal' };
const priCls = p => (p === 3 ? 'cr' : p === 2 ? 'hi' : 'me');

export default function PendingDispatchTab() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState('');
  const [band, setBand] = useState('');
  const [dis, setDis] = useState('');
  const [wh, setWh] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState('25');
  const [open, setOpen] = useState(null);
  const autoRows = useAutoRows();

  useEffect(() => {
    let live = true;
    fetch('/api/pending-dispatch').then(r => r.json())
      .then(j => { if (!live) return; j.ok ? setD(j) : setErr(j.error); })
      .catch(e => live && setErr(String(e.message || e)));
    return () => { live = false; };
  }, []);

  const rows = useMemo(() => {
    if (!d) return [];
    let r = d.rows;
    if (band) r = r.filter(x => x.band === band);
    if (wh) r = r.filter(x => x.w === wh);
    if (dis) r = r.filter(x => x.s === dis);
    if (q) {
      const t = q.toLowerCase().split(/\s+/).filter(Boolean);
      r = r.filter(x => t.every(k =>
        (x.o + ' ' + x.k + ' ' + x.m + ' ' + x.c + ' ' + x.li.map(l => l.n).join(' ')).toLowerCase().includes(k)));
    }
    return r;
  }, [d, band, wh, dis, q]);

  useEffect(() => { setPage(1); }, [q, band, wh, dis]);

  if (err) return <div className="empty">{err}</div>;
  if (!d) return <Loading what="open orders" cols={13} rows={9} />;

  const per = perPage(size, rows.length, autoRows);
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const cur = Math.min(page, pages);
  const shown = size === 'all' ? rows : rows.slice((cur - 1) * per, cur * per);
  const states = [...new Set(d.rows.map(r => r.s))].sort();
  // warehouse decides who packs the order, and it is recorded on every row
  const whs = [...new Set(d.rows.map(r => r.w).filter(Boolean))].sort();

  return (
    <>
      <div className="tbar">
        <div className="status">
          <span>Showing <b>{shown.length.toLocaleString()}</b> of <b>{rows.length.toLocaleString()}</b> open orders</span>
          <span>{d.breached.toLocaleString()} past the {d.sla}-day SLA</span>
        </div>
        <div className="tools">
          <span className="tsearch">
            <input type="search" value={q} onChange={e => setQ(e.target.value)}
                   placeholder="Search order ID, SKU or product name…" aria-label="Search" />
            <span className="tsearch-ic"><IconSearch size={15} /></span>
          </span>
          <select value={band} onChange={e => setBand(e.target.value)} aria-label="Order age">
            <option value="">All orders</option>
            {['4+ days', '2-3 days', '0-1 days'].map(b =>
              <option key={b} value={b}>{b} ({(d.bands[b] || 0).toLocaleString()})</option>)}
          </select>
          <select value={wh} onChange={e => setWh(e.target.value)} aria-label="Warehouse">
            <option value="">All warehouses</option>
            {whs.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
          <select value={dis} onChange={e => setDis(e.target.value)} aria-label="Dispatch state">
            <option value="">All dispatch states</option>
            {states.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn" type="button" onClick={() => { setQ(''); setBand(''); setWh(''); setDis(''); }}>
            <IconReset size={14} />Reset
          </button>
        </div>
      </div>

      <div className="scroll">
        <table className="fxtab pdtab">
          <colgroup>
            <col className="p-ord" /><col className="p-date" /><col className="p-sku" />
            <col className="p-mkt" /><col className="p-to" /><col className="p-wh" />
            <col className="p-pay" /><col className="p-disp" /><col className="p-days" />
            <col className="p-age" /><col className="p-pri" /><col className="p-sla" />
            <col className="p-det" />
          </colgroup>
          <thead>
            <tr>
              <th>Order ID</th><th>Order Date</th><th>SKU</th><th>Marketplace</th>
              <th>Ship To</th><th>Warehouse</th><th>Payment Status</th><th>Dispatch Status</th>
              <th className="pd-days">Days Pending</th><th>Order Age</th>
              <th>Priority</th><th>SLA Breach</th><th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.o}>
                <td className="pd-ord">{r.o}</td>
                <td className="fxdate">{r.date || <span className="fxnone">—</span>}</td>
                <td className="pd-sku">{r.k
                  ? <span className="rdclip" title={r.k}>{r.k}</span>
                  : <span className="fxnone">—</span>}</td>
                <td>{r.m || <span className="fxnone">—</span>}</td>
                <td className="pd-to">{r.c || <span className="fxnone">—</span>}</td>
                <td className="pd-to">{r.w || <span className="fxnone">—</span>}</td>
                <td>{r.p || <span className="fxnone">—</span>}</td>
                <td>
                  {r.s}
                  {r.e && <span className="smnever" style={{ display: 'block' }}>{r.e}</span>}
                </td>
                <td className="pd-days">{r.dy}</td>
                <td>{r.band}</td>
                <td><b className={priCls(r.pr)}>{PRI[r.pr]}</b></td>
                <td>{r.b ? <b className="cr">Breached</b> : 'Within'}</td>
                <td>
                  <button className="pbtn" type="button" onClick={() => setOpen(r)}>Detail</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && <div className="empty">No orders match the current search and filters.</div>}
      <Pager total={rows.length} page={cur} pages={pages} size={size} per={per}
             onPage={setPage} onSize={setSize} label="orders" />

      {open && (
        <div className="pdmodal" role="dialog" aria-modal="true" onClick={() => setOpen(null)}>
          <div className="pdbox" onClick={e => e.stopPropagation()}>
            <h3>Order {open.o}</h3>
            <div className="pdmeta">
              <span><i>Marketplace</i>{open.m || '—'}</span>
              <span><i>Warehouse</i>{open.w || '—'}</span>
              <span><i>Ship to</i>{open.c || '—'}{open.rg ? ', ' + open.rg : ''}</span>
              <span><i>Courier</i>{open.cr || '—'}</span>
              <span><i>Tracking</i>{open.t || '—'}</span>
              <span><i>Days pending</i>{open.dy}</span>
            </div>
            <table className="pdlines">
              <thead><tr><th>SKU</th><th>Product Name</th><th>Qty</th><th>Stock</th></tr></thead>
              <tbody>
                {open.li.length ? open.li.map((l, i) => (
                  <tr key={i}>
                    <td className="fxsku">{l.s || '—'}</td>
                    <td>{l.n || '—'}</td>
                    <td>{l.q}</td>
                    <td>{l.k === null ? '—' : l.k}</td>
                  </tr>
                )) : <tr><td colSpan={4}>No lines recorded for this order.</td></tr>}
              </tbody>
            </table>
            <button className="gbtn" type="button" onClick={() => setOpen(null)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}
