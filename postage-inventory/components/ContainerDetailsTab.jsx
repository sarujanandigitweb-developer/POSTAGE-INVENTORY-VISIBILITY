'use client';
import { useEffect, useMemo, useState } from 'react';
import { IconSearch, IconReset } from './Icons';
import Pager from './Pager';
import Loading from './Loading';

const n = v => (v === null || v === undefined ? '—' : Number(v).toLocaleString());
const STATUS = ['Upcoming', 'Part received', 'Received'];
const statusCls = s => (s === 'Upcoming' ? 'cst-up' : s === 'Part received' ? 'cst-part' : 'cst-ok');
const STAGE_CLS = { Arrived: 'cst-ok', Shipped: 'cst-ship', 'Production done': 'cst-prod',
                    Confirmed: 'cst-conf', Ordered: 'cst-ord' };

export default function ContainerDetailsTab() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [region, setRegion] = useState('');
  const [stage, setStage] = useState('');
  const [sort, setSort] = useState('date');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState('15');
  const [open, setOpen] = useState(null);      // the container whose manifest is showing
  const [mq, setMq] = useState('');            // manifest search
  const [mpage, setMpage] = useState(1);
  const msize = 12;

  useEffect(() => {
    let live = true;
    const p = new URLSearchParams({ q, status, region, stage, sort });
    fetch('/api/container-details?' + p).then(r => r.json())
      .then(j => { if (!live) return; j.ok ? (setD(j), setErr(null)) : setErr(j.error); })
      .catch(e => live && setErr(String(e.message || e)));
    return () => { live = false; };
  }, [q, status, region, stage, sort]);

  useEffect(() => { setPage(1); }, [q, status, region, stage, sort]);
  useEffect(() => { setMq(''); setMpage(1); }, [open]);

  const items = useMemo(() => {
    if (!open) return [];
    if (!mq) return open.it;
    const t = mq.toLowerCase().split(/\s+/).filter(Boolean);
    return open.it.filter(i =>
      t.every(x => (i.s + ' ' + (i.d || '') + ' ' + (i.sp || '')).toLowerCase().includes(x)));
  }, [open, mq]);

  if (err) return <div className="empty">{err}</div>;
  if (!d) return <Loading what="containers" cols={12} rows={8} />;

  const per = size === 'all' ? (d.rows.length || 1) : Number(size);
  const pages = Math.max(1, Math.ceil(d.rows.length / per));
  const cur = Math.min(page, pages);
  const shown = size === 'all' ? d.rows : d.rows.slice((cur - 1) * per, cur * per);

  const mpages = Math.max(1, Math.ceil(items.length / msize));
  const mcur = Math.min(mpage, mpages);
  const mshown = items.slice((mcur - 1) * msize, mcur * msize);

  return (
    <>
      <div className="tbar">
        <div className="status">
          <span>Showing <b>{shown.length}</b> of <b>{d.rows.length}</b> containers</span>
          <span>{n(d.pieces)} pieces · {d.cbm} CBM</span>
        </div>
        <div className="tools">
          <span className="tsearch">
            <input type="search" value={q} onChange={e => setQ(e.target.value)}
                   placeholder="Search container, SKU or supplier…" aria-label="Search containers" />
            <span className="tsearch-ic"><IconSearch size={15} /></span>
          </span>
          <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Status">
            <option value="">All ({d.total})</option>
            {STATUS.map(s => <option key={s} value={s}>{s} ({d.counts[s] || 0})</option>)}
          </select>
          <select value={region} onChange={e => setRegion(e.target.value)} aria-label="Region">
            <option value="">All regions</option>
            {d.regions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={stage} onChange={e => setStage(e.target.value)} aria-label="Stage">
            <option value="">All stages</option>
            {d.stages.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort">
            <option value="date">Sort by Ordered date</option>
            <option value="pcs">Sort by Pieces</option>
            <option value="skus">Sort by SKUs</option>
            <option value="cbm">Sort by CBM</option>
            <option value="name">Sort by Container</option>
          </select>
          <button className="btn" type="button"
                  onClick={() => { setQ(''); setStatus(''); setRegion(''); setStage(''); setSort('date'); }}>
            <IconReset size={14} />Reset
          </button>
        </div>
      </div>

      <div className="scroll">
        <table className="fxtab cdtab">
          <thead>
            <tr>
              <th>Container</th><th>Region</th><th>Status</th><th>Stage</th>
              <th className="cd-num">SKUs</th><th className="cd-num">Cartons</th>
              <th className="cd-num">Pieces</th><th className="cd-num">CBM</th>
              <th>Suppliers</th><th>Ordered</th><th>Expected</th><th>Manifest</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.n}>
                <td className="fxsku cd-name">{r.n}</td>
                <td>{r.rg || '—'}</td>
                <td>
                  <span className={'cpill ' + statusCls(r.st)}>{r.st}</span>
                  {r.st === 'Part received' &&
                    <span className="cmix">{r.ar} of {r.o} orders arrived</span>}
                </td>
                <td>{r.sg || '—'}</td>
                <td className="cd-num">{n(r.k)}</td>
                <td className="cd-num">{n(r.c)}</td>
                <td className="cd-num"><b>{n(r.q)}</b></td>
                <td className="cd-num">{r.v ? r.v.toFixed(1) : '—'}</td>
                <td className="csup" title={r.sp.join(', ')}>
                  {r.sp.length ? (r.sp.length <= 2 ? r.sp.join(', ') : r.sp[0] + ' +' + (r.sp.length - 1) + ' more') : '—'}
                </td>
                <td className="fxdate">{r.d2 || '—'}</td>
                <td className="fxdate">{r.ex || '—'}</td>
                <td><button className="btn cdopen" type="button" onClick={() => setOpen(r)}>Manifest</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {d.rows.length === 0 && <div className="empty">No containers match the current search and filters.</div>}
      <Pager total={d.rows.length} page={cur} pages={pages} size={size}
             onPage={setPage} onSize={setSize} label="containers" />

      {open && (
        <div className="cdmodal" role="dialog" aria-modal="true" onClick={() => setOpen(null)}>
          <div className="cdbox" onClick={e => e.stopPropagation()}>
            <div className="cdhead">
              <div className="cdhead-t">
                <h3>{open.n} <span className={'cpill ' + statusCls(open.st)}>{open.st}</span></h3>
                {/* NOT an arrival date — none exists in this database. */}
                <p className="cdsub">
                  Ordered {open.d1 && open.d2 && open.d1 !== open.d2 ? `${open.d1} – ${open.d2}` : (open.d2 || open.d1 || '—')}
                  {open.st === 'Part received' && ` · ${open.ar} of ${open.o} orders arrived`}
                </p>
              </div>
              <button className="cdx" type="button" onClick={() => setOpen(null)} aria-label="Close">×</button>
            </div>

            <div className="cdstats">
              {[['Region', open.rg || '—'], ['Stage', open.sg || '—'], ['SKUs', n(open.k)],
                ['Cartons', n(open.c)], ['Pieces', n(open.q)], ['CBM', open.v ? open.v.toFixed(1) : '—'],
                ['Orders', `${open.o}`], ['Suppliers', `${open.sp.length}`]].map(([k, v]) => (
                <div className="cdstat" key={k}><i>{k}</i><b>{v}</b></div>
              ))}
            </div>

            <div className="cdmtools">
              <span className="tsearch cdmsearch">
                <input type="search" value={mq} onChange={e => { setMq(e.target.value); setMpage(1); }}
                       placeholder="Search SKU, product or supplier…" aria-label="Search this manifest" />
                <span className="tsearch-ic"><IconSearch size={15} /></span>
              </span>
              <span className="cdmcount">
                {items.length
                  ? `Showing ${(mcur - 1) * msize + 1} to ${Math.min(mcur * msize, items.length)} of ${items.length} items`
                  : '0 items match'}
                {mq && items.length !== open.it.length && ` (filtered from ${open.it.length})`}
              </span>
            </div>

            <div className="cdmscroll">
              <table className="fxtab cdmtab">
                <thead>
                  <tr><th>SKU</th><th>Product</th><th className="cd-num">Cartons</th>
                      <th className="cd-num">Pcs / Carton</th><th className="cd-num">Pieces</th>
                      <th className="cd-num">CBM</th><th>Supplier</th><th>Stage</th></tr>
                </thead>
                <tbody>
                  {mshown.map(i => (
                    <tr key={i.s}>
                      <td className="fxsku">{i.s}</td>
                      <td className="fxname"><span className="cdclamp" title={i.d || ''}>{i.d || 'Not recorded'}</span></td>
                      <td className="cd-num">{n(i.c)}</td>
                      <td className="cd-num">{i.cp ? n(i.cp) : '—'}</td>
                      <td className="cd-num"><b>{n(i.q)}</b></td>
                      <td className="cd-num">{i.v ? i.v.toFixed(2) : '—'}</td>
                      <td>{i.sp || '—'}</td>
                      <td><span className={'cpill ' + (STAGE_CLS[(i.st || '').split(',')[0].trim()] || 'cst-ord')}>{i.st || '—'}</span></td>
                    </tr>
                  ))}
                  {!mshown.length && <tr><td colSpan={8}>No line matches that search.</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="cdmfoot">
              {mpages > 1 && (
                <nav className="fxpager">
                  <button className="fxpg" type="button" onClick={() => setMpage(mcur - 1)} disabled={mcur <= 1}>&lsaquo;</button>
                  <span className="fxpgnote">Page {mcur} of {mpages}</span>
                  <button className="fxpg" type="button" onClick={() => setMpage(mcur + 1)} disabled={mcur >= mpages}>&rsaquo;</button>
                </nav>
              )}
              <button className="gbtn" type="button" onClick={() => setOpen(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
