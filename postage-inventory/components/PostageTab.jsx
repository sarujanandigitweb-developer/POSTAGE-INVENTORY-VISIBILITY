'use client';
import { useEffect, useMemo, useState } from 'react';
import { IconSearch, IconReset } from './Icons';
import Loading from './Loading';

const NUM = /^[£$€]?\s*-?[\d,]+(\.\d+)?\s*%?$/;
const isNum = v => NUM.test(String(v ?? '').trim());
const LINK = /^https?:\/\//i;

// A cell is right-aligned when it holds a number, so a price column lines up on the
// decimal without anyone having to declare which columns are prices — these sheets are
// hand-edited and their shapes differ from tab to tab.
function Cell({ v }) {
  const t = String(v ?? '').trim();
  if (!t) return <td className="pg-e">—</td>;
  if (LINK.test(t)) return (
    <td><a href={t} target="_blank" rel="noopener noreferrer" className="pg-a">{t}</a></td>);
  return <td className={isNum(t) ? 'pg-n' : undefined}>{t}</td>;
}

export default function PostageTab() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [sel, setSel] = useState(0);
  const [q, setQ] = useState('');
  const [col, setCol] = useState('');   // '' = every column

  const load = () => {
    setD(null); setErr(null);
    fetch('/api/postage').then(r => r.json())
      .then(j => (j.ok ? setD(j) : setErr(j.error)))
      .catch(e => setErr(String(e.message || e)));
  };
  useEffect(load, []);
  // a column index means nothing in the next table, so the scope resets with the section
  useEffect(() => { setQ(''); setCol(''); }, [sel]);

  const sec = d?.sections?.[sel] ?? null;

  // Search matches a whole ROW, so "royal mail 2kg" finds the row that carries both,
  // and a group keeps its heading only while it still has rows under it.
  const groups = useMemo(() => {
    if (!sec) return [];
    const t = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!t.length) return sec.groups;
    const c = col === '' ? null : Number(col);
    // Restricting the search to one column matters here: "Total" appears in four places
    // on International Prices, so an unscoped search for a figure returns rows that
    // matched a different carrier's column entirely.
    return sec.groups
      .map(g => ({ ...g, rows: g.rows.filter(r => {
        const hay = (c === null ? r : [r[c]]).map(x => String(x ?? '')).join(' ').toLowerCase();
        return t.every(k => hay.includes(k));
      }) }))
      .filter(g => g.rows.length);
  }, [sec, q, col]);

  const shown = groups.reduce((n, g) => n + g.rows.length, 0);

  if (err) return (
    <div className="empty">
      <p>{err}</p>
      <button className="btn" type="button" onClick={load} style={{ marginTop: 12 }}>
        <IconReset size={14} />Try again
      </button>
    </div>
  );
  if (!d) return <Loading what="the postage sheet" cols={6} rows={10} />;

  return (
    <>
      {/* The six tables live in two different workbooks and are read live on every
          view. The chips carry their row counts so the shape of the sheet is legible
          before you open anything. */}
      <div className="pg-secs" role="tablist" aria-label="Postage section">
        {d.sections.map((s, i) => (
          <button key={s.title} type="button" role="tab" aria-selected={i === sel}
                  className={'pg-sec' + (i === sel ? ' on' : '') + (s.err ? ' bad' : '')}
                  onClick={() => setSel(i)}>
            <span className="pg-sec-t">{s.title}</span>
            <span className="pg-sec-n">{s.err ? '!' : s.count.toLocaleString()}</span>
          </button>
        ))}
      </div>

      <div className="tbar">
        <div className="status">
          <span>Showing <b>{shown.toLocaleString()}</b> of <b>{(sec?.count ?? 0).toLocaleString()}</b> rows</span>
          <span>read {new Date(d.asOf).toLocaleTimeString()} · live from Google Sheets</span>
        </div>
        <div className="tools">
          <span className="tsearch">
            <input type="search" value={q} onChange={e => setQ(e.target.value)}
                   placeholder={'Search ' + (sec?.title ?? 'this table') + '…'} aria-label="Search" />
            <span className="tsearch-ic"><IconSearch size={15} /></span>
          </span>
          {/* Search in one column, named the way the sheet names it — the group prefix
              is what makes "Price per kilo" mean a particular carrier. */}
          <select value={col} onChange={e => setCol(e.target.value)} aria-label="Search in column">
            <option value="">All columns</option>
            {(sec?.cols || []).map(c => (
              <option key={c.i} value={c.i}>{c.label}</option>
            ))}
          </select>
          {(q || col) && <button className="btn" type="button"
                                 onClick={() => { setQ(''); setCol(''); }}>
            <IconReset size={14} />Clear
          </button>}
          <button className="btn" type="button" onClick={load} title="Read the sheet again">
            <IconReset size={14} />Refresh
          </button>
          {sec && <a className="btn" href={sec.edit} target="_blank" rel="noopener noreferrer">
            Open sheet
          </a>}
        </div>
      </div>

      {sec?.err ? (
        <div className="empty">This table could not be read: {sec.err}</div>
      ) : (
        <>
          {!!sec?.links?.length && (
            <div className="pg-links">
              {sec.links.map(u => (
                <a key={u} href={u} target="_blank" rel="noopener noreferrer">{u}</a>
              ))}
            </div>
          )}

          {/* ONE TABLE PER GROUP, each carrying its own header — the way the published
              dashboard does it. A carrier band inside a shared table looked tidy and was
              wrong: by the time you have scrolled to SMART TRACK the column names are
              gone, and these tables have five stacked header levels. */}
          {groups.map((g, gi) => (
            <div className="pggrpblk" key={gi}>
              {/* when the table has no header of its own the title moves INTO the
                  header bar below, so it must not also sit above it */}
              {g.title && sec.header.length > 0 && <h4 className="pggrp">{g.title}</h4>}
              {g.rows.length > 0 && (
                <div className="pgscroll">
                  <table className="pgtab">
                    {/* A section whose sheet carries no header row still gets a header
                        bar: the group's own name, spanning the table. Box Sizes has five
                        such tables, and without this they were the only ones on the page
                        with no header at all — see §Box Sizes in the sheet. */}
                    {sec.header.length === 0 && g.title && (
                      <thead>
                        <tr className="hmain">
                          <th colSpan={sec.width}>{g.title}</th>
                        </tr>
                      </thead>
                    )}
                    {sec.header.length > 0 && (
                      <thead>
                        {sec.header.map((hr, i) => (
                          <tr key={i} className={
                            hr.kind === 'main' ? 'hmain'
                            : hr.kind === 'banner' ? 'hsub hban' : 'hsub'}>
                            {hr.cells.map((c, k) => (
                              <th key={k} colSpan={c.span > 1 ? c.span : undefined}
                                  className={c.gl ? 'gl' : undefined}>{c.text}</th>
                            ))}
                          </tr>
                        ))}
                      </thead>
                    )}
                    <tbody>
                      {g.rows.map((r, i) => (
                        <tr key={i} className={
                          sec.totalCol >= 0 && String(r[sec.totalCol] ?? '').trim()
                            ? 'sum' : undefined}>
                          {Array.from({ length: sec.width }, (_, j) => <Cell key={j} v={r[j]} />)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}

          {shown === 0 && (
            <div className="empty">Nothing in {sec.title} matches “{q}”.</div>
          )}
        </>
      )}
    </>
  );
}
