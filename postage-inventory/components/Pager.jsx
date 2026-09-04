'use client';
import { useEffect, useState } from 'react';
import { perPage, useAutoRows } from '@/lib/rows';

// The live dashboard's pager, ported. It shows numbered pages, first and last
// always, the current page and its neighbours, and an ellipsis where it skipped —
// and it MEASURES THE WINDOW first, so a narrow screen gets fewer numbers rather
// than a row that wraps or overflows.
function pagerRoom(w) {
  if (!w) return 7;
  if (w < 560) return 0;            // arrows only; the note gives the page
  if (w < 820) return 3;
  if (w < 1180) return 5;
  return 7;
}

export function pageList(cur, last, room) {
  if (room === 0) return [];
  if (last <= room) return Array.from({ length: last }, (_, i) => i + 1);
  if (room <= 3) return [cur];                       // just where you are
  if (room <= 5) {                                   // first, where you are, last
    const out = [1];
    if (cur > 2) out.push('…');
    if (cur !== 1 && cur !== last) out.push(cur);
    if (cur < last - 1) out.push('…');
    if (last > 1) out.push(last);
    return out;
  }
  const out = [1];
  let a = Math.max(2, cur - 1), b = Math.min(last - 1, cur + 1);
  if (cur <= 3) { a = 2; b = 4; }
  if (cur >= last - 2) { a = last - 3; b = last - 1; }
  if (a > 2) out.push('…');
  for (let i = a; i <= b; i++) out.push(i);
  if (b < last - 1) out.push('…');
  out.push(last);
  return out;
}

export default function Pager({ total, page, pages, size, onPage, onSize, label }) {
  const [room, setRoom] = useState(7);
  useEffect(() => {
    const fit = () => setRoom(pagerRoom(window.innerWidth));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const auto = useAutoRows();
  const per = perPage(size, total, auto);
  const from = total === 0 ? 0 : (page - 1) * per + 1;
  const to = size === 'all' ? total : Math.min(page * per, total);
  const nums = size === 'all' ? [] : pageList(page, pages, room);

  return (
    <div className="pbar">
      <div className="pinfo">
        {size === 'all'
          ? `All ${total.toLocaleString()} ${label || 'rows'}`
          : `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()} ${label || 'rows'}`}
      </div>
      <div className="fxpagebar">
        <label className="fxrpp" htmlFor="psize">Rows per page</label>
        <select id="psize" value={String(size)} onChange={e => { onSize(e.target.value); onPage(1); }}>
          {/* Auto is what the published dashboard defaults to: as many rows as the
              box can show without the page itself scrolling. */}
          <option value="auto">Auto</option>
          <option value="15">15</option><option value="25">25</option>
          <option value="100">100</option><option value="500">500</option>
          <option value="all">All</option>
        </select>

        {size !== 'all' && (
          <nav className="fxpager" aria-label="Table pages">
            <button type="button" className="fxpg" onClick={() => onPage(1)}
                    disabled={page <= 1} aria-label="First page">&laquo;</button>
            <button type="button" className="fxpg" onClick={() => onPage(page - 1)}
                    disabled={page <= 1} aria-label="Previous page">&lsaquo;</button>
            {nums.map((n, i) =>
              n === '…'
                ? <span className="fxgap" key={'g' + i}>…</span>
                : <button type="button" key={n} className="fxpg"
                          aria-current={n === page ? 'page' : undefined}
                          onClick={() => onPage(n)}>{n}</button>)}
            <button type="button" className="fxpg" onClick={() => onPage(page + 1)}
                    disabled={page >= pages} aria-label="Next page">&rsaquo;</button>
            <button type="button" className="fxpg" onClick={() => onPage(pages)}
                    disabled={page >= pages} aria-label="Last page">&raquo;</button>
            {/* always spelled out, so "arrows only" still tells you where you are */}
            <span className="fxpgnote">Page {page} of {pages}</span>
          </nav>
        )}
      </div>
    </div>
  );
}
