'use client';
import { perPage, useFitRows } from '@/lib/rows';
import { useEffect, useMemo, useRef, useState } from 'react';
import { IconSearch, IconReset } from './Icons';
import Pager from './Pager';
import Loading from './Loading';
import Segmented from './Segmented';

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
  // Auto, so the page fills the window. A fixed 15 left a 230px empty band under the
  // last row on a tall screen and hid rows that would have fitted.
  const [size, setSize] = useState('auto');
  const [open, setOpen] = useState(null);
  // measured off this table's own scroll box, not guessed from the window
  const scrollRef = useRef(null);
  const autoRows = useFitRows(scrollRef, null, d ? d.rows.length : 0);
  const [mq, setMq] = useState('');            // manifest search
  const [mtab, setMtab] = useState('items');   // 'summary' | 'items'
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

  const per = perPage(size, d.rows.length, autoRows);
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
          <Segmented label="Status" value={status} onChange={setStatus}
                     options={[{ value: '', label: 'All', n: d.total },
                               ...STATUS.map(x => ({ value: x, label: x, n: d.counts[x] || 0 }))]} />
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

      <div className="scroll" ref={scrollRef}>
        <table className="fxtab cdtab">
          {/* Cartons, CBM and Suppliers come off the summary table — all three are on
              the container's Manifest, and the CSV still carries them. */}
          <colgroup>
            <col className="cc-name" /><col className="cc-rg" /><col className="cc-st" />
            <col className="cc-sg" /><col className="cc-n" /><col className="cc-n" />
            <col className="cc-d" /><col className="cc-d" /><col className="cc-act" />
          </colgroup>
          <thead>
            <tr>
              <th>Container</th><th>Region</th><th>Status</th><th>Stage</th>
              <th className="cd-num">SKUs</th><th className="cd-num">Pieces</th>
              <th>Ordered</th><th>Expected</th><th>Manifest</th>
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
                <td className="cd-num"><b>{n(r.q)}</b></td>
                <td className="fxdate">{r.d2 || '—'}</td>
                <td className="fxdate">{r.ex || '—'}</td>
                <td><button className="btn cdopen" type="button"
                        onClick={() => { setOpen(r); setMq(''); setMpage(1); setMtab('items'); }}>Manifest</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {d.rows.length === 0 && <div className="empty">No containers match the current search and filters.</div>}
      <Pager total={d.rows.length} page={cur} pages={pages} size={size} per={per}
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
              <div className="cdhead-a">
                <button className="cdmbtn" type="button" onClick={() => window.print()}>Print</button>
                <button className="cdx" type="button" onClick={() => setOpen(null)} aria-label="Close">×</button>
              </div>
            </div>

            <div className="cdstats">
              {[['Region', open.rg || '—'], ['Status', open.st], ['Stage', open.sg || '—'],
                ['SKUs', n(open.k)], ['Cartons', n(open.c)], ['Pieces', n(open.q)],
                ['Ordered', open.d2 || open.d1 || '—']].map(([k, v]) => (
                <div className="cdstat" key={k}><i>{k}</i><b>{v}</b></div>
              ))}
            </div>

            {/* Two panes, as on the published page. The manifest opens first — it is what
                the button promises — and the summary is a click away rather than a wall of
                figures in front of it. */}
            <div className="cdtabs" role="tablist" aria-label="Container detail">
              <button type="button" role="tab" aria-selected={mtab === 'summary'}
                      className={'cdswitch' + (mtab === 'summary' ? ' on' : '')}
                      onClick={() => setMtab('summary')}>Container Summary</button>
              <button type="button" role="tab" aria-selected={mtab === 'items'}
                      className={'cdswitch' + (mtab === 'items' ? ' on' : '')}
                      onClick={() => setMtab('items')}>Items / Products ({n(open.it.length)})</button>
            </div>

            {mtab === 'summary' && <ManifestSummary r={open} n={n} />}

            <div className="cdpane" hidden={mtab !== 'items'}>
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
                      <th>Supplier</th><th>Stage</th></tr>
                </thead>
                <tbody>
                  {mshown.map(i => (
                    <tr key={i.s}>
                      <td className="fxsku">{i.s}</td>
                      <td className="fxname"><span className="cdclamp" title={i.d || ''}>{i.d || 'Not recorded'}</span></td>
                      <td className="cd-num">{n(i.c)}</td>
                      <td className="cd-num">{i.cp ? n(i.cp) : '—'}</td>
                      <td className="cd-num"><b>{n(i.q)}</b></td>
                      <td>{i.sp || '—'}</td>
                      <td><span className={'cpill ' + (STAGE_CLS[(i.st || '').split(',')[0].trim()] || 'cst-ord')}>{i.st || '—'}</span></td>
                    </tr>
                  ))}
                  {!mshown.length && <tr><td colSpan={7}>No line matches that search.</td></tr>}
                </tbody>
              </table>
            </div>

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

// Everything here is a stored figure or a count of stored figures. Nothing is estimated —
// in particular there is NO arrival date, which is why the note below says so rather than
// leaving a reader to assume the order dates are delivery dates.
function ManifestSummary({ r, n }) {
  const top = r.it[0];
  const perCarton = r.c ? Math.round(r.q / r.c) : null;
  const named = r.it.filter(i => i.d).length;
  const cell = (label, value, note) => (
    <div className="cdsum-c" key={label}>
      <i>{label}</i><b>{value}</b>{note ? <span>{note}</span> : null}
    </div>
  );
  return (
    <div className="cdpane">
      <div className="cdsum">
        {cell('Orders on this container', n(r.o),
              r.st === 'Part received' ? `${r.ar} arrived · ${r.op} still open`
                                       : (r.ar ? `${r.ar} arrived` : `${r.op} still open`))}
        {cell('Suppliers', n((r.sp || []).length))}
        {cell('Distinct SKUs', n(r.k), `${named} with a product name`)}
        {cell('Cartons', n(r.c), perCarton ? `≈ ${n(perCarton)} pieces per carton` : '')}
        {cell('Pieces', n(r.q))}
        {cell('Largest line', top ? top.s : '—', top ? `${n(top.q)} pieces` : '')}
        {cell('Ordered', r.d1 && r.d2 && r.d1 !== r.d2 ? `${r.d1} → ${r.d2}` : (r.d2 || r.d1 || '—'),
              'when the supplier order was placed')}
        {cell('Expected completion', r.ex || '—', r.ex ? 'supplier estimate' : 'not recorded')}
      </div>
      <p className="cdnote">
        No goods-receipt date exists in this database — arrival is recorded only as a flag
        on each supplier order, so there is no date to show for when this container landed.
        The dates above are the order dates.
      </p>
    </div>
  );
}
