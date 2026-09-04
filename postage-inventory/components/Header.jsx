'use client';
import { tabLabel } from './Sidebar';
import { IconMenu, IconWarn, IconExport, IconMoon, IconDown } from './Icons';

// The header names the tab, lets you jump straight to a category, says when the
// data was read, and carries the alerts and the actions.
export default function Header({
  view, asOf, order, sections, cat, onCat,
  out, low, stockFilter, onStockFilter, onExport, onTheme, onMenu,
}) {
  const tab = tabLabel(view);
  const when = asOf
    ? new Date(asOf).toUTCString().replace(/^\w+, /, '').replace(' GMT', ' UTC')
    : 'loading…';
  return (
    <header className="topbar">
      <button type="button" className="tb-menu" onClick={onMenu} aria-label="Toggle sidebar">
        <IconMenu />
      </button>

      <h1 className="tb-title">{tab}</h1>

      {view === 'inv' && order && (
        <span className="tb-sel">
          <select value={cat} onChange={e => onCat(e.target.value)} aria-label="Category">
            {order.map(k => <option key={k} value={k}>{sections[k]?.name || k}</option>)}
          </select>
        </span>
      )}

      <span className="tb-when">read {when}</span>

      <div className="tb-right">
        {out > 0 && (
          <button type="button" className={'chip chip-r' + (stockFilter === 'out' ? ' on' : '')}
                  aria-pressed={stockFilter === 'out'}
                  title={`${out} SKUs in this category have 0 or less across every warehouse. Click to show them.`}
                  onClick={() => onStockFilter(stockFilter === 'out' ? '' : 'out')}>
            <IconWarn /><b>{out}</b><span>Out of stock</span>
          </button>
        )}
        {low > 0 && (
          <button type="button" className={'chip chip-y' + (stockFilter === 'low' ? ' on' : '')}
                  aria-pressed={stockFilter === 'low'}
                  title={`${low} SKUs in this category have between 1 and 10 units in total. Click to show them.`}
                  onClick={() => onStockFilter(stockFilter === 'low' ? '' : 'low')}>
            <IconWarn /><b>{low}</b><span>Low stock</span>
          </button>
        )}
        <button type="button" className="gbtn" onClick={onExport}
                title="Download the rows currently shown on this tab">
          <IconExport /><span>Export CSV</span>
        </button>
        <button type="button" className="gbtn" onClick={onTheme}
                title="Switch colour mode" aria-label="Switch colour mode">
          <IconMoon /><span>Dark mode</span>
        </button>
        <span className="tb-av">
          <span className="tb-av-c" aria-hidden="true">S</span><IconDown />
        </span>
      </div>
    </header>
  );
}
