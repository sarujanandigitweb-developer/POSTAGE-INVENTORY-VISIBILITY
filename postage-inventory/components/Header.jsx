'use client';
import { TABS } from './Sidebar';

const WARN = (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
       strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
    <path d="M12 4 2.5 20h19L12 4Z" /><path d="M12 10v4M12 17.5v.01" />
  </svg>
);

// With the tab strip in the sidebar, the header names the tab you are on and
// carries everything else the live page's header carried: when the data was
// read, the two stock alerts, Export CSV and the theme toggle.
//
// One row, not two: the flex break that split the live header existed to make
// room for the tab strip, and there is no tab strip here.
export default function Header({ view, asOf, section, out, low, stockFilter, onStockFilter, onExport, onTheme }) {
  const tab = (TABS.find(t => t.id === view) || {}).label || '';
  const when = asOf
    ? new Date(asOf).toUTCString().replace(/^\w+, /, '').replace(' GMT', ' UTC')
    : 'loading…';
  return (
    <header>
      <div className="hbar">
        <div className="hleft">
          <div className="title"><h1>{tab}</h1></div>
        </div>
        <div className="prov">
          <span className="tag">{section ? section + ' · ' : ''}read {when}</span>
        </div>
        <div className="alerts">
          {out > 0 && (
            <button className="alrt alrt-r" type="button"
                    aria-pressed={stockFilter === 'out'}
                    title={`${out} SKUs in this category have 0 or less across every warehouse. Click to show them.`}
                    aria-label={`${out} out of stock SKUs — click to show them`}
                    onClick={() => onStockFilter(stockFilter === 'out' ? '' : 'out')}>
              {WARN}<span className="alrt-n">{out}</span><span className="alrt-w">out of stock</span>
            </button>
          )}
          {low > 0 && (
            <button className="alrt alrt-y" type="button"
                    aria-pressed={stockFilter === 'low'}
                    title={`${low} SKUs in this category have between 1 and 10 units in total. Click to show them.`}
                    aria-label={`${low} low stock SKUs — click to show them`}
                    onClick={() => onStockFilter(stockFilter === 'low' ? '' : 'low')}>
              {WARN}<span className="alrt-n">{low}</span><span className="alrt-w">low stock</span>
            </button>
          )}
        </div>
        <div className="hdr-actions">
          <button className="hbtn" type="button" onClick={onExport}
                  title="Download the rows currently shown on this tab">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M4 20h16" />
            </svg>
            <span>Export CSV</span>
          </button>
          <button className="hbtn" type="button" onClick={onTheme}
                  title="Switch colour mode" aria-label="Switch colour mode">
            <span>Dark mode</span>
          </button>
        </div>
      </div>
    </header>
  );
}
