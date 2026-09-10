'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { matches } from '@/lib/filter';
import { stockLevel } from '@/lib/stock';
import Sidebar, { ALL_VIEWS } from './Sidebar';
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
import { load, warmOthers } from '@/lib/client-datasets';

// One probe per tab, in the order they cost. Postage is a Google Sheets read with its own
// 60s server cache and no pagination, so it is fetched whole; everything else asks for one
// row and leaves the payload to the tab itself. Inventory is not here: it is the Shell's
// own dataset and is keyed per category, so warming one category would guess wrong.
const WARM = [
  { view: 'pd',      url: '/api/pending-dispatch' },
  { view: 'postage', url: '/api/postage' },
  { view: 'rd',      url: '/api/recent-dispatch' },
  { view: 'fx',      url: '/api/fixed-price?size=1' },
  { view: 'cd',      url: '/api/container-details' },
  { view: 'sm',      url: '/api/slow-moving?size=1' },
];

export default function Shell() {
  const [view, setView] = useState('inv');
  // DECLARED HERE, NOT BESIDE THE EFFECT THAT SETS IT. The inventory effect below lists
  // `booted` in its dependency array, and a dependency array is evaluated during render —
  // so a `const` declared further down would be in its temporal dead zone and throw before
  // the component could paint. The reasoning for the flag itself is with that effect.
  const [booted, setBooted] = useState(false);
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
  // the same map, reachable from the effect without making it a dependency
  const cacheRef = useRef(cache);
  useEffect(() => { cacheRef.current = cache; }, [cache]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    // ONLY WHEN INVENTORY IS THE TAB BEING LOOKED AT. This effect used to run on every
    // open regardless of `view`, so restoring on Slow-Moving started TWO cold builds at
    // once: inventory-CR, which nobody was going to see, and slow-moving, which the
    // reader was waiting for. They took two of three pool clients and competed for a
    // ten-connection role. Measured: 4.34s of work for a tab that was not on screen.
    //
    // `booted` is in the test because `view` is 'inv' until the saved tab is restored;
    // without it the first frame fires the fetch this guard exists to prevent.
    if (!booted || view !== 'inv') return;
    // A SEARCH IS ITS OWN REQUEST, ACROSS EVERY SECTION. The browser is only ever sent
    // one section, so it cannot answer "which SKUs anywhere match this" — searching what
    // it happened to hold is why a Lampshade SKU returned nothing while Ceiling Rose was
    // open. The route reads all twelve, through the same cache the category view uses.
    const q = st.q.trim();
    const url = '/api/inventory?cat=' + encodeURIComponent(st.cat) +
                (q ? '&q=' + encodeURIComponent(q) : '');
    // A CACHED RESULT IS SHOWN, THEN RE-CHECKED. Keeping it for the whole session made
    // going back instant and also meant a tab left open all morning never saw a new
    // figure. The held copy paints immediately — no spinner, no flicker — and the request
    // still goes out behind it, so the next render is current. Searches are held under
    // their term so retyping one is instant; sections stay keyed by section.
    const held = cacheRef.current[q ? 'q:' + q : st.cat];
    if (held) { setData(held); setLoading(false); }
    let live = true;
    if (!held) setLoading(true);
    setErr(null);
    const go = () => load(url)
      .then(j => {
        if (!live) return;
        if (!j.ok) { setErr(j.error); setLoading(false); return; }
        setCache(c => ({ ...c, [j.search ? 'q:' + j.search : j.cat]: j }));
        setData(j); setLoading(false);
      })
      .catch(e => { if (live) { setErr(String(e.message || e)); setLoading(false); } });
    // TYPING IS NOT A REQUEST PER KEYSTROKE. A search reads every section, so firing on
    // each character would queue twelve-section reads behind each other for terms nobody
    // finished typing. Browsing a category still goes immediately.
    if (!q) { go(); return () => { live = false; }; }
    const t = setTimeout(go, 300);
    return () => { live = false; clearTimeout(t); };
    // DEPS ARE THE CATEGORY, THE SEARCH, THE TAB AND THE BOOT GATE. `cache` must NOT be
    // here: this effect always fetches and always setCache()s, so listing it would
    // retrigger the effect on its own result — an endless fetch loop against the
    // database. The held copy is read through a ref, which does not take part in the
    // dependency check.
  }, [st.cat, st.q, view, booted]);

  // WARM THE OTHER TABS, AFTER THE VISIBLE ONE HAS PAINTED — never before.
  //
  // The expensive part of opening a tab is the dataset BUILD, not the transfer: cold,
  // Slow-Moving is 13.97s and Container Details 4.54s; warm, both are 0.02s. So each
  // entry below is `size=1` — the routes already paginate, so the server builds and
  // caches the whole dataset and ships one row. That is the same probe
  // instrumentation.js uses, and it means nothing large is pulled into the browser for
  // a tab nobody has opened. When the reader does open one, it fetches its own real
  // page against a server cache that is already warm.
  //
  // The delay is not politeness, it is the connection budget. `booted` and the first
  // payload only tell us the visible tab has its data; the pool is max 3 locally and 1
  // on a serverless host, against a role that allows ten in total. warmOthers() runs
  // strictly one at a time for the same reason — see the note in lib/client-datasets.js.
  //
  // Anything the reader has already opened is skipped: warmOthers() checks held() and
  // inFlight() per URL, so a click that lands mid-prefetch attaches to the request in
  // the air instead of starting a second.
  useEffect(() => {
    if (!booted) return;
    const others = WARM.filter(w => w.view !== view).map(w => w.url);
    const t = setTimeout(() => { warmOthers(others); }, 1500);
    return () => clearTimeout(t);
  }, [booted, view]);

  // RESOLVE THE TAB BEFORE ANYTHING PAINTS. useState('inv') is what the server renders
  // and what the client hydrates, so restoring the saved tab in an effect means render 1
  // shows Inventory — and starts its ~5s query — before render 2 switches to the tab you
  // were actually on. That flash is what a refresh on SKU Fixed Price looked like.
  //
  // `booted` gates the body: nothing paints until the saved tab is known. It cannot be a
  // lazy useState initialiser instead, because reading localStorage during render would
  // make the client's first render disagree with the server's and break hydration.
  useEffect(() => {
    const saved = typeof localStorage !== 'undefined' && localStorage.getItem('piv.view');
    // ALL_VIEWS, NOT TABS. TABS holds the six top-level entries; the two dispatch
    // views live inside Dispatch's `kids` as 'pd' and 'rd'. Checking against TABS meant
    // a saved 'pd' failed the guard and was silently dropped — so refreshing on
    // Dispatch Queue always landed you back on Inventory. ALL_VIEWS is the flattened
    // list and was already exported for exactly this.
    if (saved && ALL_VIEWS.includes(saved)) setView(saved);
    setBooted(true);
  }, []);
  // Only after the restore has run. On mount this effect fires with view still at its
  // default, so without the guard it writes 'inv' over the tab that was saved.
  useEffect(() => {
    if (!booted) return;
    try { localStorage.setItem('piv.view', view); } catch {}
  }, [view, booted]);

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
    // CATEGORY COMES FROM THE ROW, not from the open tab. It used to stamp the open
    // category onto every line, which was right while browsing one section and wrong the
    // moment a search returned rows from several — a Lampshade SKU filed under Ceiling
    // Rose in the file. Every row carries its own `key`; the route sets it.
    const nameOf = r => (data.sections[r.key] || data.sections[st.cat] || {}).name || r.key || st.cat;
    const body = data.rows
      .filter(r => matches(r, data.sections[st.cat], st))
      .map(r => [r.s, nameOf(r), r.t, r.a, r.al || '', r.b, r.bl || '',
        r.c, r.u5, r.price ?? '', r.k, r.kl || '', r.m, r.ml || '', r.ca, r.us].map(esc).join(','));
    const blob = new Blob([[head.map(esc).join(','), ...body].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    // A search is not one section, so it must not be filed under one section's name.
    const stem = data.search
      ? 'inventory-search-' + data.search.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
      : (data.sections[st.cat] || {}).file || 'inventory';
    a.download = `${stem}-${new Date().toISOString().slice(0, 10)}.csv`;
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
      {/* Until `booted`, NOTHING may claim a tab. Gating only the body left the header
          printing "Inventory" and the sidebar highlighting it for the same frame — which
          is the whole flash the gate was meant to remove. */}
      <Sidebar view={booted ? view : null} onChange={setView} collapsed={collapsed}
               onCollapse={() => setCollapsed(c => !c)} />
      <div className="main">
        <Header view={booted ? view : null} asOf={booted ? data?.asOf : null} out={alerts.out} low={alerts.low}
                order={data?.order} sections={data?.sections || {}}
                cat={st.cat} onCat={k => setSt(s => ({ ...s, cat: k, fam: '', sub2: '', attr: '' }))}
                stockFilter={st.st} onStockFilter={v => set({ st: v })}
                onExport={exportCSV} onTheme={toggleTheme}
                onMenu={() => setCollapsed(c => !c)} />

        <div className="body">
          {/* Nothing until the saved tab is known — see `booted` above. One skeleton
              beats painting Inventory and then replacing it. */}
          {!booted ? <div className="card grow"><Loading what="your last view" cols={16} rows={9} /></div> : <>
          {view === 'inv' && (
            err ? <div className="card"><div className="empty">{err}</div></div>
            // NEVER RENDER ONE CATEGORY'S ROWS UNDER ANOTHER'S HEADING. While a
            // switch is in flight `data` still holds the section just left, and the
            // new section's filters were being applied to it — Clothes selected,
            // Cosmetics' 124 rows underneath, "Showing 0 of 0 … filtered from 124".
            : (!data || data.cat !== st.cat)
              ? <div className="card grow"><Loading what={(data?.sections?.[st.cat]?.name) || 'inventory'} cols={16} rows={9} /></div>
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
          </>}
        </div>
      </div>
    </div>
  );
}
