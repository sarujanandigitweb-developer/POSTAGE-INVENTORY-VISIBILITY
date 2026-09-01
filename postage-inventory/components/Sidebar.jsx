'use client';
import Brandmark from './Brandmark';

// The tab strip, moved out of the header. Same buttons, same .vtab styling,
// stacked instead of laid out in a row — the one change asked for in this pass.
export const TABS = [
  { id: 'inv', label: 'Inventory' },
  { id: 'postage', label: 'Postage Information' },
  { id: 'fx', label: 'SKU Fixed Price' },
  { id: 'sm', label: 'Slow-Moving Stock' },
  { id: 'pd', label: 'Pending Dispatch' },
];

export default function Sidebar({ view, onChange }) {
  return (
    <aside className="sidebar">
      <div className="sbrand">
        <Brandmark size={30} />
        <h1>POSTAGE INVENTORY VISIBILITY</h1>
      </div>
      <nav className="snav" role="tablist" aria-label="Dashboard view">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            className="vtab"
            role="tab"
            aria-selected={view === t.id}
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="sfoot">Live from LEDSone</div>
    </aside>
  );
}
