'use client';
import { TAB_ICON, IconBox, IconLeft, IconDown } from './Icons';

export const TABS = [
  { id: 'inv', label: 'Inventory' },
  { id: 'postage', label: 'Postage Information' },
  { id: 'fx', label: 'SKU Fixed Price' },
  { id: 'sm', label: 'Slow-Moving Stock' },
  { id: 'pd', label: 'Pending Dispatch' },
  { id: 'cd', label: 'Container Details' },
];

export default function Sidebar({ view, onChange, collapsed, onCollapse }) {
  return (
    <aside className={'sidebar' + (collapsed ? ' is-collapsed' : '')}>
      <div className="sbrand">
        <span className="sbrand-mark"><IconBox /></span>
        <span className="sbrand-txt">Postage<br />Inventory<br />Visibility</span>
      </div>

      <nav className="snav" role="tablist" aria-label="Dashboard view">
        {TABS.map(t => {
          const Icon = TAB_ICON[t.id];
          return (
            <button key={t.id} type="button" role="tab" aria-selected={view === t.id}
                    className={'snav-i' + (view === t.id ? ' on' : '')}
                    title={t.label} onClick={() => onChange(t.id)}>
              <span className="snav-ic"><Icon /></span>
              <span className="snav-l">{t.label}</span>
            </button>
          );
        })}
      </nav>

      <button type="button" className="scollapse" onClick={onCollapse}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand' : 'Collapse'}>
        <IconLeft />
      </button>

      <div className="suser">
        <span className="suser-av">L</span>
        <span className="suser-txt">
          <b>Live from LEDSone</b>
          <i>read-only</i>
        </span>
        <IconDown />
      </div>
    </aside>
  );
}
