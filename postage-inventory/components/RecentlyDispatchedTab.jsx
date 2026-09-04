'use client';
import { useEffect, useMemo, useState } from 'react';
import { IconSearch, IconReset } from './Icons';
import Pager from './Pager';
import Loading from './Loading';
import { perPage, useAutoRows } from '@/lib/rows';
import { turnaround } from '@/lib/dates';

// A tone means the same thing wherever it appears. "Label Created" deliberately takes
// none: it is ~80% of these rows and the ordinary outcome, and colouring the ordinary
// case leaves nothing for the exceptions to say.
const stCls = s =>
  /deliver/i.test(s) ? 'ok'
  : /transit|out for/i.test(s) ? 'go'
  : /problem|return|delet|fail|cancel/i.test(s) ? 'bad'
  : /no tracking/i.test(s) ? 'dash'
  : '';
// Turnaround is the number the team is measured on, so it carries a tone.
const turnCls = h => (h <= 24 ? 'ok' : h <= 72 ? 'warn' : 'bad');
// Prime is the only service here with a marketplace-enforced deadline.
const priCls = p => (/prime/i.test(p) ? 'go' : '');
// Channel identity, told apart by a dot rather than a tone — an Amazon badge in the
// amber of "needs attention" would read as a warning about Amazon.
const CH = { Amazon: 'a', eBay: 'e', Website: 'w', 'B&Q': 'b', Wayfair: 'y' };

export default function RecentlyDispatchedTab() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState('');
  const [band, setBand] = useState('');
  const [wh, setWh] = useState('');
  const [mkt, setMkt] = useState('');
  const [dis, setDis] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState('25');
  const [open, setOpen] = useState(null);
  const autoRows = useAutoRows();

  useEffect(() => {
    let live = true;
    fetch('/api/recent-dispatch').then(r => r.json())
      .then(j => { if (!live) return; j.ok ? setD(j) : setErr(j.error); })
      .catch(e => live && setErr(String(e.message || e)));
    return () => { live = false; };
  }, []);

  const rows = useMemo(() => {
    if (!d) return [];
    let r = d.rows;
    if (band) r = r.filter(x => x.band === band);
    if (wh) r = r.filter(x => x.w === wh);
    if (mkt) r = r.filter(x => x.m === mkt);
    if (dis) r = r.filter(x => x.s === dis);
    if (q) {
      const t = q.toLowerCase().split(/\s+/).filter(Boolean);
      // tracking is searchable here in a way it never was on the queue: on this tab most
      // orders HAVE a tracking number, and "where did LED62991 go" is asked by number
      r = r.filter(x => t.every(k =>
        (x.o + ' ' + x.k + ' ' + x.t + ' ' + x.cr + ' ' + x.m + ' ' + x.c + ' ' +
         x.li.map(l => l.n).join(' ')).toLowerCase().includes(k)));
    }
    return r;
  }, [d, band, wh, mkt, dis, q]);

  useEffect(() => { setPage(1); }, [q, band, wh, mkt, dis]);

  if (err) return <div className="empty">{err}</div>;
  if (!d) return <Loading what="dispatched orders" cols={12} rows={9} />;

  const per = perPage(size, rows.length, autoRows);
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const cur = Math.min(page, pages);
  const shown = size === 'all' ? rows : rows.slice((cur - 1) * per, cur * per);
  const reset = () => { setQ(''); setBand(''); setWh(''); setMkt(''); setDis(''); };

  return (
    <>
      <div className="tbar">
        <div className="status">
          <span>Showing <b>{shown.length.toLocaleString()}</b> of <b>{rows.length.toLocaleString()}</b> dispatched orders</span>
          <span>{d.sameDay.toLocaleString()} of {d.count.toLocaleString()} went out within 24 hours</span>
        </div>
        <div className="tools">
          <span className="tsearch">
            <input type="search" value={q} onChange={e => setQ(e.target.value)}
                   placeholder="Search order ID, SKU, tracking or product name…" aria-label="Search" />
            <span className="tsearch-ic"><IconSearch size={15} /></span>
          </span>
          <select value={band} onChange={e => setBand(e.target.value)} aria-label="Dispatch day">
            <option value="">All {d.days} days</option>
            {['Today', 'Yesterday', 'Earlier'].map(b =>
              <option key={b} value={b}>{b} ({(d.bands[b] || 0).toLocaleString()})</option>)}
          </select>
          <select value={wh} onChange={e => setWh(e.target.value)} aria-label="Warehouse">
            <option value="">All warehouses</option>
            {d.warehouses.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
          <select value={mkt} onChange={e => setMkt(e.target.value)} aria-label="Marketplace">
            <option value="">All marketplaces</option>
            {d.markets.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={dis} onChange={e => setDis(e.target.value)} aria-label="Dispatch state">
            <option value="">All dispatch states</option>
            {d.states.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn" type="button" onClick={reset}><IconReset size={14} />Reset</button>
        </div>
      </div>

      <div className="scroll">
        <table className="fxtab rdtab">
          {/* Without this the fixed layout splits the width equally between the columns
              and every nowrap cell paints over the one beside it. */}
          <colgroup>
            <col className="r-ord" /><col className="r-date" /><col className="r-sku" />
            <col className="r-mkt" /><col className="r-to" /><col className="r-wh" />
            <col className="r-cour" /><col className="r-trk" /><col className="r-disp" />
            <col className="r-turn" /><col className="r-pri" /><col className="r-det" />
          </colgroup>
          <thead>
            <tr>
              <th>Order ID</th><th>Order Date</th><th>SKU</th><th>Marketplace</th>
              <th>Ship To</th><th>Warehouse</th><th>Courier</th><th>Tracking Number</th>
              <th>Dispatch Status</th><th className="r-turn">Turnaround</th>
              <th>Priority</th><th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.o}>
                <td className="pd-ord">{r.o}{r.l > 1 && <span className="pdsub">{r.l} lines</span>}</td>
                <td className="fxdate">{r.date || <span className="fxnone">—</span>}</td>
                <td className="pd-sku">{r.k
                  ? <span className="rdclip" title={r.k}>{r.k}</span>
                  : <span className="fxnone">—</span>}</td>
                <td>{r.m
                  ? <span className={'bdg ch ch-' + (CH[r.m] || 'x')}>{r.m}</span>
                  : <span className="fxnone">—</span>}</td>
                <td className="pd-to">{r.c || <span className="fxnone">—</span>}</td>
                <td className="pd-to">{r.w || <span className="fxnone">—</span>}</td>
                <td className="pd-to"><span className="rdclip" title={r.cr}>{r.cr || '—'}</span></td>
                <td className="r-trk">{r.t || <span className="fxnone">—</span>}</td>
                <td><span className={'bdg ' + stCls(r.s)}>{r.s}</span></td>
                <td className="r-turn"><span className={'bdg ' + turnCls(r.th)}>{turnaround(r.th)}</span></td>
                <td>{r.pr
                  ? <span className={'bdg ' + priCls(r.pr)}>{r.pr}</span>
                  : <span className="fxnone">—</span>}</td>
                <td><button className="pbtn" type="button" onClick={() => setOpen(r)}>Detail</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && <div className="empty">No dispatched order matches the current search and filters.</div>}
      <Pager total={rows.length} page={cur} pages={pages} size={size} per={per}
             onPage={setPage} onSize={setSize} label="orders" />

      {open && (
        <div className="pdmodal" role="dialog" aria-modal="true" onClick={() => setOpen(null)}>
          <div className="pdbox" onClick={e => e.stopPropagation()}>
            <h3>Order {open.o}</h3>
            <div className="pdmeta">
              {/* Dispatched is off the table — too many columns — but it is the axis this
                  tab is built on, so it stays here, in the filter and in the sort. */}
              <span><i>Dispatched</i>{open.x} ({open.band})</span>
              <span><i>Turnaround</i>{turnaround(open.th)}</span>
              <span><i>Marketplace</i>{open.m || '—'}</span>
              <span><i>Warehouse</i>{open.w || '—'}</span>
              <span><i>Ship to</i>{open.c || '—'}{open.rg ? ', ' + open.rg : ''}</span>
              <span><i>Courier</i>{open.cr || '—'}</span>
              <span><i>Tracking</i>{open.t || '—'}</span>
              <span><i>Priority</i>{open.pr || '—'}</span>
              {open.ev && <span><i>Last carrier event</i>{open.ev}</span>}
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
