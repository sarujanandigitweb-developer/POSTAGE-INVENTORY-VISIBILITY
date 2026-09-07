'use client';
import { perPage, useAutoRows } from '@/lib/rows';
import { useEffect, useMemo, useState } from 'react';
import { held, load } from '@/lib/client-datasets';
import { IconSearch, IconReset } from './Icons';
import Pager from './Pager';
import DispatchDialog, { Section, Field, Chip } from './DispatchDialog';
import { exportOrder } from '@/lib/export-order';
import Loading from './Loading';

// The dashboard's own vocabulary. .smpri and .pdsla were already ported into the CSS;
// the table just never used them, so Priority and SLA Breach rendered as bare bold text
// while every other column carried a badge.
const PRI = { 3: ['Critical', 'p3'], 2: ['High', 'p2'], 1: ['Normal', 'p1'] };
// Processing is the ordinary case and takes no tone — colouring 80% of the rows leaves
// nothing to signal the exceptions with.
const stCls = st => /hold/i.test(st) ? 'bad'
  : /awaiting courier/i.test(st) ? 'go'
  : /not dispatched/i.test(st) ? 'warn' : '';

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
    const h = held('/api/pending-dispatch');
    if (h) setD(h);
    load('/api/pending-dispatch')
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
                  <span className={'bdg' + (stCls(r.s) ? ' ' + stCls(r.s) : '')}>{r.s}</span>
                  {/* The shipping error is a NOTE under the status, not part of it.
                      Inline it ran into the badge and, on a long B&Q message, pushed
                      the column wide enough to shove Days Pending off the row. */}
                  {r.e && <span className="pderr" title={r.e}>{r.e}</span>}
                </td>
                <td className="pd-days">{r.dy}</td>
                <td>{r.band}</td>
                <td>{PRI[r.pr]
                  ? <span className={'smpri ' + PRI[r.pr][1]}>{PRI[r.pr][0]}</span>
                  : <span className="pd-none">—</span>}</td>
                <td><span className={'pdsla ' + (r.b ? 'yes' : 'no')}>
                  {r.b ? 'Breached' : 'Within'}</span></td>
                <td>
                  <button className="pddet" type="button" onClick={() => setOpen(r)}>Detail</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && <div className="empty">No orders match the current search and filters.</div>}
      <Pager total={rows.length} page={cur} pages={pages} size={size} per={per}
             onPage={setPage} onSize={setSize} label="orders" />

      {open && (() => {
        // The same tones the dashboard uses, so the two tabs read as one system.
        const stCls = /hold/i.test(open.s) ? 'bad'
          : /awaiting courier/i.test(open.s) ? 'go'
          : /not dispatched/i.test(open.s) ? 'warn' : '';
        const ageCls = open.pr === 3 ? 'bad' : open.pr === 2 ? 'warn' : 'ok';
        const payCls = /paid|complete/i.test(open.p || '') ? 'ok' : 'warn';
        const PRI = { 3: ['Critical', 'p3'], 2: ['High', 'p2'], 1: ['Normal', 'p1'] };
        const [plabel, pcls] = PRI[open.pr] || ['', ''];
        return (
        <DispatchDialog
          title={open.o} pill="Pending Dispatch" state={open.s}
          meta={<>Ordered {open.date} · {open.dy} day{open.dy === 1 ? '' : 's'} pending
                 {open.b && <> · <span className="pdbad">Past the {d.sla}-day SLA</span></>}</>}
          onExport={() => exportOrder(open)}
          onClose={() => setOpen(null)}
          lines={open.li}
          error={open.e || null}
          sections={<>
            <Section title="The order">
              <Field icon="order" label="Order ID" value={open.o} copy />
              <Field icon="globe" label="Marketplace" value={open.m} />
              <Field icon="card" label="Payment Status"
                     value={open.p ? <Chip cls={payCls}>{open.p}</Chip> : ''} />
            </Section>
            <Section title="How long it has waited">
              <Field icon="date" label="Order Date" value={open.date} />
              <Field icon="clock" label="Days Pending" value={String(open.dy)} />
              <Field icon="tag" label="Order Age Category"
                     value={<Chip cls={ageCls}>{open.band}</Chip>} />
              <Field icon="alert" label="Priority"
                     value={plabel ? <span className={'smpri ' + pcls}>{plabel}</span> : ''} />
              {/* the SLA is a stated assumption, not a value read from the database */}
              <Field icon="alert" label="SLA Breach"
                     value={open.b ? <span className="pdbad">Breached (over {d.sla} days)</span>
                                   : <Chip cls="ok">Within {d.sla} days</Chip>} />
            </Section>
            <Section title="Where it is going">
              <Field icon="home" label="Warehouse" value={open.w} />
              <Field icon="pin" label="Ship To" value={open.c} sub={open.rg} />
            </Section>
            <Section title="Carriage">
              <Field icon="truck" label="Dispatch Status" value={<Chip cls={stCls}>{open.s}</Chip>} />
              <Field icon="flag" label="Pending Status" value="Pending Dispatch" />
              <Field icon="truck" label="Courier" value={open.cr} />
              <Field icon="box" label="Tracking Number" value={open.t} copy />
            </Section>
          </>}
        />);
      })()}
    </>
  );
}
