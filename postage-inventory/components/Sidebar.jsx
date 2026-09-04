'use client';
import { TAB_ICON, IconBox, IconLeft, IconDown, IconQueue, IconSent } from './Icons';


// Six entries. The two dispatch views sit under one of them: "Orders" said nothing
// next to Inventory and Postage Information — every tab here is about orders somewhere
// — so the group is named for what its two views actually are.
export const TABS = [
  { id: 'inv', label: 'Inventory' },
  { id: 'postage', label: 'Postage Information' },
  { id: 'fx', label: 'SKU Fixed Price' },
  { id: 'sm', label: 'Slow-Moving Stock' },
  { id: 'dispatch', label: 'Dispatch', kids: [
      { id: 'pd', label: 'Dispatch Queue', Icon: IconQueue },
      { id: 'rd', label: 'Recently Dispatched', Icon: IconSent },
    ] },
  { id: 'cd', label: 'Container Details' },
];
// Opening the group lands on Recently Dispatched, but pressing it while already inside
// must not throw you out of the queue you were reading.
export const DISPATCH_VIEWS = ['pd', 'rd'];
export const DISPATCH_DEFAULT = 'rd';
// A view is no longer always a top-level entry, so anything naming the current view has
// to look inside the groups too — the header title went blank the moment it did not.
export const tabLabel = id => {
  for (const t of TABS) {
    if (t.id === id) return t.label;
    for (const k of t.kids || []) if (k.id === id) return k.label;
  }
  return '';
};
// every view a control can reach, groups flattened
export const ALL_VIEWS = TABS.flatMap(t => (t.kids ? t.kids.map(k => k.id) : [t.id]));

export default function Sidebar({ view, onChange, collapsed, onCollapse }) {
  return (
    <aside className={'sidebar' + (collapsed ? ' is-collapsed' : '')}>
      <div className="sbrand">
        <span className="sbrand-mark"><IconBox /></span>
        <span className="sbrand-txt">Postage<br />Inventory<br />Visibility</span>
      </div>

      <nav className="snav" role="tablist" aria-label="Dashboard view">
        {TABS.map(t => {
          const Icon = TAB_ICON[t.id] || TAB_ICON.pd;
          if (!t.kids) return (
            <button key={t.id} type="button" role="tab" aria-selected={view === t.id}
                    className={'snav-i' + (view === t.id ? ' on' : '')}
                    title={t.label} onClick={() => onChange(t.id)}>
              <span className="snav-ic"><Icon /></span>
              <span className="snav-l">{t.label}</span>
            </button>
          );
          const inside = t.kids.some(k => k.id === view);
          return (
            <div key={t.id} className={'snav-g' + (inside ? ' on' : '')}>
              <button type="button" className={'snav-i' + (inside ? ' on' : '')}
                      aria-expanded={inside} title={t.label}
                      onClick={() => { if (!inside) onChange(DISPATCH_DEFAULT); }}>
                <span className="snav-ic"><Icon /></span>
                <span className="snav-l">{t.label}</span>
              </button>
              {/* The children are the only way between the two views, so they show
                  whenever the group is open. Collapsed, the group is one icon. */}
              {inside && (
                <div className="snav-sub" role="tablist" aria-label="Dispatch view">
                  {t.kids.map(k => (
                    <button key={k.id} type="button" role="tab" aria-selected={view === k.id}
                            className={'snav-s' + (view === k.id ? ' on' : '')}
                            title={k.label} onClick={() => onChange(k.id)}>
                      <span className="snav-ic"><k.Icon size={15} /></span>
                      <span className="snav-l">{k.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
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
