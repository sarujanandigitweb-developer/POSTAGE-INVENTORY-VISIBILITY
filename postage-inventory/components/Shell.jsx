'use client';
import { useEffect, useMemo, useState } from 'react';
import { matches } from '@/lib/filter';
import { stockLevel } from '@/lib/stock';
import Sidebar, { TABS } from './Sidebar';
import Header from './Header';
import InventoryTab from './InventoryTab';
import CategoryBar from './CategoryBar';

export default function Shell() {
  const [view, setView] = useState('inv');
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  // one filter state, as the page keeps it. Ceiling Rose is the default category,
  // matching the live dashboard's opening view.
  const [st, setSt] = useState({ cat: 'CR', fam: '', sub2: '', attr: '', q: '', wh: '', st: '' });
  const set = patch => setSt(s => ({ ...s, ...patch }));

  // Exactly one category is active. Choosing a type elsewhere resets the previous
  // one, and switching category clears the level-2 and attribute filters because
  // their dimensions differ between sections.
  const pickCategory = (key, value) => {
    if (value === '') {
      setSt(s => (s.cat === key ? { ...s, fam: '' } : s));   // "Select" is not a filter state
      return;
    }
    setSt(s => ({ ...s, cat: key, fam: value === '*' ? '' : value,
                  ...(s.cat !== key ? { sub2: '', attr: '' } : {}) }));
  };

  // The browser fetches an API route. It never speaks to PostgreSQL itself.
  useEffect(() => {
    let live = true;
    fetch('/api/inventory')
      .then(r => r.json())
      .then(j => { if (!live) return; j.ok ? setData(j) : setErr(j.error); })
      .catch(e => live && setErr(String(e.message || e)));
    return () => { live = false; };
  }, []);

  // remember the tab across a reload, as the live dashboard does
  useEffect(() => {
    const saved = typeof localStorage !== 'undefined' && localStorage.getItem('piv.view');
    if (saved && TABS.some(t => t.id === saved)) setView(saved);
  }, []);
  useEffect(() => { try { localStorage.setItem('piv.view', view); } catch {} }, [view]);

  // The header alerts count the ACTIVE category's whole population, not the
  // catalogue and not the filtered view — the same scope the live page uses, and
  // the reason it reads 62 / 7 on Ceiling Rose rather than 1613 / 687 overall.
  const alerts = useMemo(() => {
    if (!data) return { out: 0, low: 0 };
    const rows = data.rows.filter(r => r.key === st.cat);
    return {
      out: rows.filter(r => stockLevel(r) === 'out').length,
      low: rows.filter(r => stockLevel(r) === 'low').length,
    };
  }, [data, st.cat]);

  const exportCSV = () => {
    if (!data) return;
    const head = ['SKU', 'Category', 'Type', 'Unit3', 'Unit3 Loc', 'Unit4', 'Unit4 Loc',
                  'Unit18', 'Unit5', 'Shopify Price', 'Kronen', 'Kronen Loc',
                  'Schmutter', 'Schmutter Loc', 'Canada', 'US'];
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    // Export what is on screen, for the tab that is on screen — not the whole file.
    const name = (data.sections[st.cat] || {}).name || st.cat;
    const body = data.rows.filter(r => r.key === st.cat)
      .filter(r => matches(r, data.sections[st.cat], st))
      .map(r => [r.s, name, r.t, r.a, r.al || '', r.b, r.bl || '',
        r.c, r.u5, r.price ?? '', r.k, r.kl || '', r.m, r.ml || '', r.ca, r.us].map(esc).join(','));
    const blob = new Blob([[head.map(esc).join(','), ...body].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(data.sections[st.cat] || {}).file || 'inventory'}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  const toggleTheme = () => {
    const root = document.documentElement;
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('piv.theme', next); } catch {}
  };
  useEffect(() => {
    try {
      const t = localStorage.getItem('piv.theme');
      if (t) document.documentElement.setAttribute('data-theme', t);
    } catch {}
  }, []);

  return (
    <div className="app">
      <Sidebar view={view} onChange={setView} />
      <div className="main">
        <Header view={view} asOf={data?.asOf} out={alerts.out} low={alerts.low}
                section={data ? (data.sections[st.cat] || {}).name : null}
                stockFilter={st.st} onStockFilter={v => set({ st: v })}
                onExport={exportCSV} onTheme={toggleTheme} />

        {view === 'inv' && (
          err ? <div className="wrap"><div className="empty">{err}</div></div>
          : !data ? <div className="wrap"><div className="empty">Loading inventory from LEDSone…</div></div>
          : <>
              <CategoryBar order={data.order} sections={data.sections} counts={data.counts}
                           cat={st.cat} fam={st.fam} onPick={pickCategory} />
              <InventoryTab data={data} st={st} set={set} />
            </>
        )}

        {view !== 'inv' && (
          <div className="fxwrap">
            <div className="fxtop">
              <h2 className="fxh2">{(TABS.find(t => t.id === view) || {}).label}</h2>
            </div>
            <div className="empty" style={{ padding: 24 }}>
              Not wired to the database yet — this pass covers the UI port, the sidebar
              and the live Inventory tab. See README.md for what each remaining tab needs.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
