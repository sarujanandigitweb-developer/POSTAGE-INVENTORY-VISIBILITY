'use client';
import { perPage, useAutoRows } from '@/lib/rows';
import ImageZoom from './ImageZoom';
import { useEffect, useState } from 'react';
import { IconSearch, IconReset } from './Icons';
import Pager from './Pager';
import Loading from './Loading';
import Segmented from './Segmented';

const BANDS = ['Critical', 'High', 'Medium'];
const bandCls = b => (b === 'Critical' ? 'cr' : b === 'High' ? 'hi' : 'me');

// 3 Critical, 2 High, 1 Normal — the same bands and the same tones the published
// dashboard uses, so the two read as one system.
const priCls = p => (p === 3 ? 'p3' : p === 2 ? 'p2' : 'p1');

export default function SlowMovingTab() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(true);
  const [q, setQ] = useState('');
  const [pri, setPri] = useState('');
  const [php, setPhp] = useState('');      // PH person
  const [ph, setPh] = useState('');        // PH category
  const [type, setType] = useState('');
  const [sort, setSort] = useState('p');
  // The published page opens on Holding stock: 16,453 rows include 13,987 that hold
  // nothing, and a picking list of things there are none of is not the first view.
  const [stock, setStock] = useState('h');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState('25');
  const autoRows = useAutoRows();
  // ONE number for both the request and the pager. The server pages this table, so
  // the size sent up and the size the footer describes must be the same value.
  const per = perPage(size, 0, autoRows);

  useEffect(() => {
    let live = true; setBusy(true);
    const p = new URLSearchParams({ q, pri, stock, type, ph, php, sort, page: String(page), size: String(per) });
    fetch('/api/slow-moving?' + p)
      .then(r => r.json())
      .then(j => { if (!live) return; j.ok ? (setD(j), setErr(null)) : setErr(j.error); setBusy(false); })
      .catch(e => { if (live) { setErr(String(e.message || e)); setBusy(false); } });
    return () => { live = false; };
  }, [q, pri, stock, type, ph, php, sort, page, size, autoRows]);

  useEffect(() => { setPage(1); }, [q, pri, stock, type, ph, php, sort]);

  // Clear returns to the view the tab OPENS on — Holding stock, worst first — not to
  // an empty filter set. "Stock and zero" is a deliberate choice, not the resting state.
  const reset = () => {
    setQ(''); setPri(''); setStock('h'); setType(''); setPh(''); setPhp(''); setSort('p');
  };

  if (err) return <div className="empty">{err}</div>;
  if (!d) return <Loading what="slow-moving stock" cols={17} rows={9}
                          note="16,000 rows are built from three movement sources; after this it is instant." />;

  return (
    <>
      <div className="tbar">
        <div className="status">
          {/* The published dashboard names BOTH numbers: what the filters left, and
              what the whole table holds. Showing only the first makes a filtered view
              look like the entire dataset. */}
          <span>Showing <b>{d.rows.length.toLocaleString()}</b> of <b>{(d.filtered ?? d.total).toLocaleString()}</b> slow-moving SKUs
            {d.filtered != null && d.filtered !== d.total &&
              <span className="muted"> (filtered from {d.total.toLocaleString()})</span>}
          </span>
          <span>{d.holding.toLocaleString()} holding stock · {d.units.toLocaleString()} units</span>
          {busy && <span className="muted">loading…</span>}
        </div>
        <div className="tools">
          <span className="tsearch">
            <input type="search" value={q} onChange={e => setQ(e.target.value)}
                   placeholder="Search by SKU or item name…" aria-label="Search by SKU or item name" />
            <span className="tsearch-ic"><IconSearch size={15} /></span>
          </span>
          {/* The chips count with the BAND filter skipped, so each one says how many rows
              it would show given every other filter — not how many are on screen now. */}
          <Segmented label="Priority band" value={pri} onChange={setPri}
                     options={[{ value: '', label: 'All', n: d.bands.All },
                               { value: '3', label: 'Critical', n: d.bands.Critical },
                               { value: '2', label: 'High', n: d.bands.High },
                               { value: '1', label: 'Medium', n: d.bands.Medium }]} />
          {/* Zero stock is kept and FLAGGED rather than dropped, so it needs its own
              choice: a slow-mover holding nothing is a different problem from one
              holding 500. */}
          <select value={stock} onChange={e => setStock(e.target.value)} aria-label="Filter by stock held">
            <option value="h">Holding stock</option>
            <option value="z">Zero stock only</option>
            <option value="a">Stock and zero</option>
          </select>
          <select value={type} onChange={e => setType(e.target.value)} aria-label="Filter by item type">
            <option value="">All item types</option>
            <option value="1">Single item</option>
            <option value="0">Combo / assembly</option>
            <option value="c">Inside a combo</option>
          </select>
          <select value={php} onChange={e => setPhp(e.target.value)} aria-label="Filter by PH person">
            <option value="">All PH people</option>
            <option value="!">Not assigned ({d.phPeople.none.toLocaleString()})</option>
            {d.phPeople.list.map(p => (
              <option key={p} value={p}>{p} ({(d.phPeople.counts[p] || 0).toLocaleString()})</option>
            ))}
          </select>
          <select value={ph} onChange={e => setPh(e.target.value)} aria-label="Filter by PH category">
            <option value="">All PH categories</option>
            <option value="!">Not assigned ({d.phCats.none.toLocaleString()})</option>
            {d.phCats.list.map(c => (
              <option key={c} value={c}>{c} ({(d.phCats.counts[c] || 0).toLocaleString()})</option>
            ))}
          </select>
          <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort by">
            <option value="p">Sort by Priority</option>
            <option value="d">Sort by Days Idle</option>
            <option value="q">Sort by Quantity</option>
            <option value="s">Sort by SKU</option>
            <option value="n">Sort by Item Name</option>
          </select>
          <button className="btn" type="button" onClick={reset}>
            <IconReset size={14} />Clear
          </button>
        </div>
      </div>

      <div className="scroll">
        <table className="fxtab smtab">
          {/* The same 17 columns the published dashboard carries, in the same order.
              Six of them — Required Action, Action Qty, Assigned Person, Target Date,
              Status, Team Notes — hold NOTHING in the database. They are the team's own
              working columns, so they render as an explicit dash rather than being
              dropped: a column that is absent looks like an oversight, one that says
              "—" says the database has no answer. */}
          <colgroup>
            <col className="s-sku" /><col className="s-img" /><col className="s-name" />
            <col className="s-type" /><col className="s-par" /><col className="s-qty" />
            <col className="s-loc" /><col className="s-date" /><col className="s-days" />
            <col className="s-act" /><col className="s-aq" /><col className="s-pri" />
            <col className="s-ph" /><col className="s-asg" /><col className="s-tgt" />
            <col className="s-st" /><col className="s-note" />
          </colgroup>
          <thead>
            <tr>
              <th>SKU / Component ID</th><th>Image</th><th>Item Name</th>
              <th>Item Type</th><th>Parent Product SKU</th>
              <th className="sm-num">Available Qty</th><th>Warehouse &amp; Location</th>
              <th>Last Movement</th><th className="sm-days">Days Without Movement</th>
              <th>Required Action</th><th>Action Qty</th><th>Priority</th>
              <th>PH</th><th>Assigned Person</th><th>Target Date</th>
              <th>Status</th><th>Team Notes</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map(r => (
              <tr key={r.s} className={r.units > 0 ? undefined : 'smz'}>
                <td className="fxsku">{r.s}</td>
                <td className="fximg">
                  <ImageZoom src={r.i} caption={r.s} />
                </td>
                <td className="fxname">{r.n || <span className="fxna">Not recorded</span>}</td>
                <td><span className={'fxtype ' + (r.t ? 'single' : 'combo')}>
                  {r.t ? 'Single' : 'Combo'}</span></td>
                {/* No bill-of-materials table exists. A combo SKU spells out its own
                    components, so a component's parents are the combos that name it —
                    derived, and shown as derived. */}
                <td className="sm-par">{r.pa.length
                  ? <>{r.pa.map((p, i) => <span className="smpar" key={i}>{p}</span>)}
                      {r.pn > r.pa.length && <span className="smmore">+{r.pn - r.pa.length} more</span>}</>
                  : <span className="fxnone">—</span>}</td>
                <td className={'sm-num' + (r.z ? ' sm-zero' : '')}>
                  {r.units.toLocaleString()}
                  {r.z ? <span className="smzero">no stock</span> : null}
                </td>
                <td className="sm-loc">
                  {r.locs.length
                    ? r.locs.map((l, i) => <span className="smloc" key={i}>{l}</span>)
                    : <span className="fxnone">—</span>}
                </td>
                <td className="fxdate">{r.never
                  ? <span className="smnever">Never sold</span>
                  : (r.last || <span className="fxnone">—</span>)}</td>
                <td className="sm-days">{r.days.toLocaleString()}</td>
                <td className="sm-none">—</td>
                <td className="sm-none">—</td>
                <td><span className={'smpri ' + priCls(r.pr)}>{r.band}</span></td>
                <td className="sm-ph">{r.phc
                  ? <>{r.phc}{r.php && <span className="smpar">{r.php}</span>}</>
                  : <span className="fxnone">—</span>}</td>
                <td className="sm-none">—</td>
                <td className="sm-none">—</td>
                <td className="sm-none">—</td>
                <td className="sm-none">—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {d.rows.length === 0 && <div className="empty">No SKUs match the current search and filters.</div>}
      <Pager total={d.total} page={d.page} pages={d.pages} size={size} per={per}
             onPage={setPage} onSize={setSize} label="SKUs" />
    </>
  );
}
