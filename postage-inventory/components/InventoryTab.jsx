'use client';
import { useEffect, useMemo, useState } from 'react';
import { matches, extraOptions } from '@/lib/filter';
import { IconSearch, IconReset } from './Icons';
import Pager from './Pager';

const n = v => (v === 0 ? <span style={{ opacity: .45 }}>0</span>
                        : <b style={{ color: v < 0 ? '#a51111' : '#0a7d33' }}>{v}</b>);
const dash = () => <span className="dash" title="Not recorded for this SKU at this unit.">-</span>;
const loc = v => (v ? <span className="loc">{v}</span> : dash());

export default function InventoryTab({ data, st, set, loading }) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState('15');   // page one first, not 6,181 rows at once

  const cfg = data.sections[st.cat] || null;
  const catRows = data.rows;   // the API returns only the active category
  const rows = useMemo(() => catRows.filter(r => matches(r, cfg, st)), [catRows, cfg, st]);

  const sub2Opts = useMemo(() => extraOptions(catRows, cfg?.sub2), [catRows, cfg]);
  const attrOpts = useMemo(() => extraOptions(catRows, cfg?.attr), [catRows, cfg]);

  // changing category, search or any filter resets the reader to page 1, so they
  // are never left looking at an empty page 9 of a narrower result set
  useEffect(() => { setPage(1); }, [st.cat, st.fam, st.sub2, st.attr, st.q, st.wh, st.st]);

  const per = size === 'all' ? (rows.length || 1) : Number(size);
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const cur = Math.min(page, pages);
  const shown = size === 'all' ? rows : rows.slice((cur - 1) * per, cur * per);

  return (
    <div className="wrap" id="invwrap">
      <div className="tbar">
        <div className="status">
          <span>Showing <b>{shown.length.toLocaleString()}</b> of <b>{rows.length.toLocaleString()}</b> SKUs</span>
          {loading && <span className="muted">refreshing…</span>}
          {rows.length !== catRows.length &&
            <span>filtered from {catRows.length.toLocaleString()}</span>}
        </div>
        <div className="tools">
          <span className="tsearch">
            <input type="search" value={st.q} onChange={e => set({ q: e.target.value })}
                   placeholder={cfg?.placeholder || 'Search SKU or description…'}
                   autoComplete="off" aria-label="Search SKU or description" />
            <span className="tsearch-ic"><IconSearch size={15} /></span>
          </span>
          {cfg?.sub2 && sub2Opts && (
            <select value={st.sub2} onChange={e => set({ sub2: e.target.value })} aria-label={cfg.sub2.label}>
              <option value="">All {cfg.sub2.label.toLowerCase()}s</option>
              {sub2Opts.map(o => <option key={o.value} value={o.value}>{o.value} ({o.count})</option>)}
            </select>
          )}
          {cfg?.attr && attrOpts && (
            <select value={st.attr} onChange={e => set({ attr: e.target.value })} aria-label={cfg.attr.label}>
              <option value="">All {cfg.attr.label.toLowerCase()}s</option>
              {attrOpts.map(o => <option key={o.value} value={o.value}>{o.value} ({o.count})</option>)}
            </select>
          )}
          <select value={st.wh} onChange={e => set({ wh: e.target.value })} aria-label="Warehouse / location">
            <option value="">All warehouses</option>
            <option value="a">UK — Unit 3</option><option value="b">UK — Unit 4</option>
            <option value="c">UK — Unit 18</option><option value="u5">UK — Unit 5</option>
            <option value="k">German — Kronen</option><option value="m">German — Schmutter</option>
            <option value="ca">Canada</option><option value="us">US</option>
          </select>
          <select value={st.st} onChange={e => set({ st: e.target.value })} aria-label="Stock condition">
            <option value="">Any stock level</option>
            <option value="pos">In stock (&gt; 0)</option>
            <option value="zero">Zero</option>
            <option value="neg">Negative</option>
            <option value="low">Low stock (1–10)</option>
            <option value="out">Out of stock (0 or less)</option>
          </select>
          <button className="btn" type="button"
                  onClick={() => set({ fam: '', sub2: '', attr: '', q: '', wh: '', st: '' })}>
            <IconReset size={14} />Reset
          </button>
        </div>
      </div>

      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th className="sku grp-pd" rowSpan={3}>SKU</th>
              <th className="grp-pd" colSpan={2}>Product</th>
              <th className="grp-uk" colSpan={7}>UK</th>
              <th className="grp-de" colSpan={4}>German</th>
              <th className="grp-om" colSpan={2}>Other markets</th>
            </tr>
            <tr>
              <th rowSpan={2}>Type</th><th rowSpan={2}>Image</th>
              <th colSpan={2}>Unit 3</th><th colSpan={2}>Unit 4</th>
              <th>Unit 18</th><th>Unit 5</th><th rowSpan={2}>Shopify Price</th>
              <th colSpan={2}>Kronen</th><th colSpan={2}>Schmutter</th>
              <th rowSpan={2}>Canada</th><th rowSpan={2}>US</th>
            </tr>
            <tr>
              <th>Stock</th><th>Location</th><th>Stock</th><th>Location</th>
              <th>Stock</th><th>Stock</th>
              <th>Stock</th><th>Location</th><th>Stock</th><th>Location</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.s}>
                <td className="sku">{r.s}</td>
                <td>{r.t || dash()}</td>
                <td style={{ textAlign: 'center' }}>
                  {r.i ? <img src={r.i} alt="" width={34} height={34} loading="lazy"
                              style={{ objectFit: 'contain', borderRadius: 4 }} />
                       : <span style={{ opacity: .4 }}>—</span>}
                </td>
                <td className="num">{n(r.a)}</td><td>{loc(r.al)}</td>
                <td className="num">{n(r.b)}</td><td>{loc(r.bl)}</td>
                <td className="num">{n(r.c)}</td><td className="num">{n(r.u5)}</td>
                <td className="num">{r.price != null ? '£' + r.price.toFixed(2) : dash()}</td>
                <td className="num">{n(r.k)}</td><td>{loc(r.kl)}</td>
                <td className="num">{n(r.m)}</td><td>{loc(r.ml)}</td>
                <td className="num">{n(r.ca)}</td><td className="num">{n(r.us)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && <div className="empty">No SKUs match the current search and filters.</div>}

      <Pager total={rows.length} page={cur} pages={pages} size={size}
             onPage={setPage} onSize={setSize} label="SKUs" />
    </div>
  );
}
