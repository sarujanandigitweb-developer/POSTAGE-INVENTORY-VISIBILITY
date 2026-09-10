'use client';

// The category bar, rebuilt to the page's own rules:
//   * exactly ONE category can be active — choosing a type elsewhere resets the
//     previous one to "Select";
//   * each select offers "Select" (not a filter state), "All <name>", then the
//     section's declared families;
//   * the count beside each label is the section's WHOLE population, never the
//     filtered view, so it can never disagree with "Showing N of M" below.
export default function CategoryBar({ order, sections, counts, cat, fam, onPick }) {
  return (
    <div className="catbar">
      <h2>Inventory</h2>
      <div className="cats" id="cats">
        {order.map(key => {
          const cfg = sections[key];
          if (!cfg) return null;
          const on = cat === key;
          return (
            <div className={on ? 'cat on' : 'cat'} key={key}>
              <span className="cat-l" title={cfg.name}>
                <span className="cat-t">{cfg.name}</span>
                {' '}<span className="cat-n">{counts[key] ?? 0}</span>
              </span>
              <select
                aria-label={`${cfg.name} product type`}
                value={on ? (fam === '' ? '*' : fam) : ''}
                onChange={e => onPick(key, e.target.value)}
              >
                <option value="">Select</option>
                <option value="*">All {cfg.name}</option>
                {cfg.fams.map(f => (
                  <option key={f.code} value={f.code}>{f.label}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
