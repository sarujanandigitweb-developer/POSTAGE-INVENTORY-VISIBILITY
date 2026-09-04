'use client';
import { useEffect, useMemo, useState } from 'react';
import { matches } from '@/lib/filter';
import { stockLevel } from '@/lib/stock';
import Sidebar, { TABS } from './Sidebar';
import Header from './Header';
import InventoryTab from './InventoryTab';
import CategoryBar from './CategoryBar';
import FixedPriceTab from './FixedPriceTab';
import SlowMovingTab from './SlowMovingTab';
import PendingDispatchTab from './PendingDispatchTab';
import RecentlyDispatchedTab from './RecentlyDispatchedTab';
import PostageTab from './PostageTab';
import ContainerDetailsTab from './ContainerDetailsTab';
import Loading from './Loading';

export default function Shell() {
  const [view, setView] = useState('inv');
  const [collapsed, setCollapsed] = useState(false);
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
  //
  // One category at a time: reading all 6,181 SKUs took ~6s before anything
  // appeared. A section is 124–1,487 rows, so the first paint is quick, and each
  // section is cached after its first visit so going back is instant.
  const [cache, setCache] = useState({});
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (cache[st.cat]) { setData(cache[st.cat]); setLoading(false); return; }
    let live = true;
    setLoading(true); setErr(null);
    fetch('/api/inventory?cat=' + encodeURIComponent(st.cat))
      .then(r => r.json())
      .then(j => {
        if (!live) return;
        if (!j.ok) { setErr(j.error); setLoading(false); return; }
        setCache(c => ({ ...c, [j.cat]: j }));
        setData(j); setLoading(false);
      })
      .catch(e => { if (live) { setErr(String(e.message || e)); setLoading(false); } });
    return () => { live = false; };
  }, [st.cat, cache]);

  // Warm the two heavy datasets in the background once Inventory has painted.
  // Fixed Price (~30k rows) and Slow-Moving (~16k) are built from several
  // whole-table queries — 4s and 10s cold — so a reader who clicks straight to
  // them waits. Prefetching means the cache is usually already warm.
  useEffect(() => {
    if (!data) return;
    // Nothing to do here any more: instrumentation.js warms these on the server
    // before a reader arrives. Warming again from the browser duplicated every
    // build — the same dataset was being read from Postgres twice, competing for a
    // role that allows ten connections.
    return () => {};
  }, [data]);

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
    if (!data || data.cat !== st.cat) return { out: 0, low: 0 };
    const rows = data.rows;
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
    const body = data.rows
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
      <Sidebar view={view} onChange={setView} collapsed={collapsed}
               onCollapse={() => setCollapsed(c => !c)} />
      <div className="main">
        <Header view={view} asOf={data?.asOf} out={alerts.out} low={alerts.low}
                order={data?.order} sections={data?.sections || {}}
                cat={st.cat} onCat={k => setSt(s => ({ ...s, cat: k, fam: '', sub2: '', attr: '' }))}
                stockFilter={st.st} onStockFilter={v => set({ st: v })}
                onExport={exportCSV} onTheme={toggleTheme}
                onMenu={() => setCollapsed(c => !c)} />

        <div className="body">
          {view === 'inv' && (
            err ? <div className="card"><div className="empty">{err}</div></div>
            : !data ? <div className="card grow"><Loading what={(data?.sections?.[st.cat]?.name) || 'inventory'} cols={16} rows={9} /></div>
            : <>
                <div className="card">
                  <CategoryBar order={data.order} sections={data.sections} counts={data.counts}
                               cat={st.cat} fam={st.fam} onPick={pickCategory} />
                </div>
                <div className={'card grow' + (loading ? ' is-loading' : '')}>
                  <InventoryTab data={data} st={st} set={set} loading={loading} />
                </div>
              </>
          )}

          {view === 'fx' && <div className="card grow"><FixedPriceTab /></div>}
          {view === 'sm' && <div className="card grow"><SlowMovingTab /></div>}
          {view === 'pd' && <div className="card grow"><PendingDispatchTab /></div>}
          {view === 'rd' && <div className="card grow"><RecentlyDispatchedTab /></div>}
          {view === 'cd' && <div className="card grow"><ContainerDetailsTab /></div>}
          {view === 'postage' && <div className="card grow"><PostageTab /></div>}
        </div>
      </div>
    </div>
  );
}
