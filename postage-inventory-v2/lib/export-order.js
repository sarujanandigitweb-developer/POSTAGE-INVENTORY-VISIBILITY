// One order as CSV — what the dashboard's Export button does. A row per order line,
// each carrying the order's own facts, so a file of several orders still says which
// line belonged to which order.
const cell = v => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export function exportOrder(r) {
  const head = ['Order ID', 'Order Date', 'Dispatched', 'Marketplace', 'Ship To', 'Region',
                'Warehouse', 'Courier', 'Tracking Number', 'Dispatch Status', 'Priority',
                'SKU', 'Product Name', 'Qty', 'Stock'];
  const base = [r.o, r.date || '', r.x || '', r.m || '', r.c || '', r.rg || '',
                r.w || '', r.cr || '', r.t || '', r.s || '', r.pr ?? ''];
  const lines = (r.li && r.li.length ? r.li : [{}]).map(l =>
    [...base, l.s || '', l.n || '', l.q ?? '', l.k ?? ''].map(cell).join(','));
  const csv = [head.join(','), ...lines].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'order-' + String(r.o).replace(/[^\w.-]+/g, '_') + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
