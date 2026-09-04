'use client';
import { MARKET_ICON } from '@/lib/marketplace-icons';
import { perPage, useAutoRows } from '@/lib/rows';
import ImageZoom from './ImageZoom';
import { useEffect, useState } from 'react';
import { IconSearch, IconReset } from './Icons';
import Pager from './Pager';
import Loading from './Loading';
import Segmented from './Segmented';

const gbp = p => (p == null ? null : '£' + (p / 100).toFixed(2));

// WITHIN a row the same SKU is priced across every marketplace, so the comparison that
// matters is horizontal: which channel is cheapest for this product, which dearest.
// Comparing DOWN a column would be meaningless — it would just rank unrelated products.
//
// A row where every channel agrees gets no colour at all. That is the desirable state
// for a fixed-price catalogue, and colouring it would leave nothing for the rows that
// genuinely disagree to say. Prices are held in pence, so this compares integers.
function spread(row, markets) {
  const vals = markets.map(m => row[m.key]).filter(v => v != null);
  if (vals.length < 2) return null;                 // nothing to compare against
  const lo = Math.min(...vals), hi = Math.max(...vals);
  return lo === hi ? null : { lo, hi };             // consistent pricing: no spread
}

export default function FixedPriceTab() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(true);
  const [q, setQ] = useState('');
  // Opens on Single. A fixed selling price is a property of a single SKU — a combo's
  // price follows from its components — and All leads with 25,472 combos in front of
  // the 4,770 rows this tab exists for.
  const [type, setType] = useState('single');
  const [mk, setMk] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState('25');
  const autoRows = useAutoRows();

  useEffect(() => {
    let live = true; setBusy(true);
    const p = new URLSearchParams({ q, type, mk, page: String(page), size: String(perPage(size, 0, autoRows)) });
    fetch('/api/fixed-price?' + p)
      .then(r => r.json())
      .then(j => { if (!live) return; j.ok ? (setD(j), setErr(null)) : setErr(j.error); setBusy(false); })
      .catch(e => { if (live) { setErr(String(e.message || e)); setBusy(false); } });
    return () => { live = false; };
  }, [q, type, mk, page, size, autoRows]);

  useEffect(() => { setPage(1); }, [q, type, mk]);

  if (err) return <div className="empty">{err}</div>;
  if (!d) return <Loading what="fixed prices" cols={11} rows={9} />;

  return (
    <>
      <div className="tbar">
        <div className="status">
          <span>Showing <b>{d.rows.length.toLocaleString()}</b> of <b>{d.total.toLocaleString()}</b> SKUs</span>
          <span>{d.single.toLocaleString()} single · {d.combo.toLocaleString()} combo</span>
          {busy && <span className="muted">loading…</span>}
          <span className="fxkey">
            <b className="fx-lo">Lowest</b><b className="fx-hi">Highest</b>
            <i>price across channels, per SKU</i>
          </span>
        </div>
        <div className="tools">
          <span className="tsearch">
            <input type="search" value={q} onChange={e => setQ(e.target.value)}
                   placeholder="Search SKU or product name…" aria-label="Search SKU or product name" />
            <span className="tsearch-ic"><IconSearch size={15} /></span>
          </span>
          <Segmented label="SKU type" value={type} onChange={setType}
                     options={[{ value: '', label: 'All', n: d.total },
                               { value: 'single', label: 'Single', n: d.single },
                               { value: 'combo', label: 'Combo', n: d.combo }]} />
          <select value={mk} onChange={e => setMk(e.target.value)} aria-label="Listed on">
            <option value="">Listed anywhere</option>
            {d.markets.map(m => <option key={m.key} value={m.key}>Listed on {m.name}</option>)}
          </select>
          <button className="btn" type="button" onClick={() => { setQ(''); setType(''); setMk(''); }}>
            <IconReset size={14} />Clear
          </button>
        </div>
      </div>

      {/* PRICE COVERAGE, laid out as the published page lays it out: a label, one tile
          per marketplace carrying its own mark, and the total pinned right. Three lines
          per tile — name, count, percent — so every tile is the same height and the row
          reads as one band rather than six differently sized blocks. */}
      <div className="fxcov">
        <div className="fxcovlab">Price coverage<span>(fixed price only)</span></div>
        <div className="fxtiles">
          {d.markets.map(m => {
            const n = (d.coverage || {})[m.key] || 0;
            const of = d.filtered ?? d.total;
            return (
              <div className="fxtile" key={m.key}>
                <span className="fxlogo"
                      dangerouslySetInnerHTML={{ __html: MARKET_ICON[m.name] || '' }} />
                <span className="t">
                  <b>{m.name}</b>
                  <span className="c"><i>{n.toLocaleString()}</i> / {of.toLocaleString()}</span>
                  <span className="p">{of ? ((100 * n) / of).toFixed(1) + '%' : '\u00a0'}</span>
                </span>
              </div>
            );
          })}
          {/* A channel the database holds nothing for is NOT 0% — that would read as a
              coverage failure. It has no data source at all, and says so. */}
          {d.absent.map(a => (
            <div className="fxtile" key={a}>
              <span className="fxlogo"
                    dangerouslySetInnerHTML={{ __html: MARKET_ICON[a] || '' }} />
              <span className="t">
                <b>{a}</b>
                <span className="c fxnosrc">No data source</span>
                <span className="p">&nbsp;</span>
              </span>
            </div>
          ))}
        </div>
        <div className="fxtot">
          <div className="l">Total SKUs</div>
          <div className="n">{(d.filtered ?? d.total).toLocaleString()}</div>
        </div>
      </div>

      <div className="scroll">
        <table className="fxtab">
          {/* One <col> per rendered column, markets and absent markets included — a
              static colgroup would go out of step the moment a marketplace appears. */}
          <colgroup>
            <col className="c-sku" /><col className="c-img" /><col className="c-name" />
            <col className="c-type" />
            {d.markets.map(m => <col key={m.key} className="c-p" />)}
            {d.absent.map(a => <col key={a} className="c-na" />)}
            <col className="c-upd" />
          </colgroup>
          <thead>
            <tr>
              <th>SKU</th><th>Image</th><th>Product Name</th><th>Type</th>
              {d.markets.map(m => <th key={m.key} className="fxprice">{m.name}</th>)}
              {d.absent.map(a => <th key={a} className="fxprice">{a}</th>)}
              <th>Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map(r => {
              const sp = spread(r, d.markets);
              return (
              <tr key={r.s}>
                <td className="fxsku">{r.s}</td>
                <td className="fximg">
                  <ImageZoom src={r.i} caption={r.s} />
                </td>
                <td className="fxname">{r.n || <span className="fxna">Not recorded</span>}</td>
                <td>{r.combo ? 'Combo' : 'Single'}</td>
                {d.markets.map(m => {
                  const v = r[m.key];
                  const tone = !sp || v == null ? ''
                    : v === sp.lo ? ' fx-lo' : v === sp.hi ? ' fx-hi' : '';
                  return (
                    <td key={m.key} className={'fxprice' + tone}
                        title={tone === ' fx-lo' ? 'Cheapest channel for this SKU'
                             : tone === ' fx-hi' ? 'Dearest channel for this SKU' : undefined}>
                      {gbp(v) || <span className="fxnone">—</span>}
                    </td>
                  );
                })}
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
              );
            })}
          </tbody>
        </table>
      </div>

      {d.rows.length === 0 && <div className="empty">No SKUs match the current search and filters.</div>}
      <Pager total={d.total} page={d.page} pages={d.pages} size={size}
             onPage={setPage} onSize={setSize} label="SKUs" />
    </>
  );
}
