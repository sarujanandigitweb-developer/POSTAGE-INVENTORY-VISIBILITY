'use client';
import { useEffect, useState } from 'react';

// "Auto" means: as many rows as the window can show without the page itself scrolling.
// The published dashboard measures its scroll box and clamps to 15–24; this measures the
// window, which is the part that actually varies, and clamps the same way. A guess of a
// fixed number would leave a half-empty table on a tall screen and a scrollbar on a short
// one — the two things Auto exists to avoid.
const ROW_PX = 54;        // a table row at this density
const CHROME_PX = 330;    // header, toolbar, coverage strip, table head, pager
export const AUTO_MIN = 15, AUTO_MAX = 24;

export function useAutoRows() {
  const [n, setN] = useState(AUTO_MIN);
  useEffect(() => {
    const fit = () => {
      const fits = Math.floor((window.innerHeight - CHROME_PX) / ROW_PX);
      setN(Math.max(AUTO_MIN, Math.min(AUTO_MAX, isFinite(fits) ? fits : AUTO_MIN)));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return n;
}

// Number('auto') is NaN, and NaN silently turns every page calculation into nothing.
// Every place that reads a page size goes through here.
export function perPage(size, total, auto) {
  if (size === 'all') return Math.max(1, total || 1);
  if (size === 'auto') return auto || AUTO_MIN;
  const n = Number(size);
  return isFinite(n) && n > 0 ? n : (auto || AUTO_MIN);
}

// MEASURED, not modelled. useAutoRows() estimates from the window using a fixed row
// height, and the tables differ: a container row is ~40px, a Slow-Moving row with a
// 52px thumbnail and a two-line name is ~64px. One constant cannot serve both, and the
// estimate left a 230px empty band under the last container row on a tall screen.
//
// This measures the scroll box and its own first row, which is what the published page
// does. It falls back to the estimate before the first paint, when there is nothing to
// measure yet.
export function useFitRows(ref, fallback, rows) {
  const [n, setN] = useState(fallback || AUTO_MIN);
  useEffect(() => {
    const fit = () => {
      const box = ref.current;
      if (!box) return;
      const avail = box.clientHeight;
      if (!avail) return;
      const head = box.querySelector('thead');
      const row = box.querySelector('tbody tr');
      const headH = head ? head.getBoundingClientRect().height : 46;
      const rowH = row ? row.getBoundingClientRect().height : ROW_PX;
      if (!rowH) return;
      const fits = Math.floor((avail - headH) / rowH);
      if (isFinite(fits)) setN(Math.max(AUTO_MIN, Math.min(AUTO_MAX, fits)));
    };
    fit();
    // THE FIRST MEASUREMENT HAPPENS BEFORE THERE ARE ANY ROWS. On mount the tbody is
    // empty — the data is still being fetched — so there is no row to measure and the
    // fallback (a modelled 54px) stands, which is exactly the 15 rows and the empty band
    // this was meant to fix. Observing the TABLE as well as the box means the rows
    // arriving is itself a resize, and the real height gets measured then.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    if (ro && ref.current) {
      ro.observe(ref.current);
      const table = ref.current.querySelector('table');
      if (table) ro.observe(table);
    }
    window.addEventListener('resize', fit);
    return () => { window.removeEventListener('resize', fit); if (ro) ro.disconnect(); };
  }, [ref, fallback, rows]);
  return n;
}
