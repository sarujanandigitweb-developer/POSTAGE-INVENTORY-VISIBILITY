import { TABS, csvUrl, editUrl, parseCSV, clip, trim, splitSections, analyse,
         headerRows, totalCol, colLabels } from '@/lib/sheet';

// POSTAGE INFORMATION — read live from the team's Google Sheets, never stored.
//
// Fetched on the SERVER rather than from the browser. It is still a direct read of the
// sheet with nothing in between, but it keeps the workbook ids out of the client, avoids
// depending on Google's CORS headers, and lets one short cache serve every viewer
// instead of each of them hitting Google on every tab switch.
export const dynamic = 'force-dynamic';

// The sheet is edited by hand a few times a day. A minute of cache turns a burst of tab
// switches into one upstream read while still being far fresher than anyone edits.
const CACHE_MS = 60 * 1000;
let cache = null;

async function readTab(tab) {
  const res = await fetch(csvUrl(tab.gid, tab.book) + '&_=' + Date.now(), {
    cache: 'no-store',
    headers: { 'user-agent': 'postage-inventory-dashboard' },
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + res.statusText);
  const rows = parseCSV(await res.text());

  if (!tab.take) return [{ title: tab.title, gid: tab.gid, book: tab.book,
                           rows: trim(clip(rows, tab)) }];
  // Named, not positional: the legacy numbering has a gap (there is no 4) and a typo,
  // so taking "the third section" would quietly pick the wrong table.
  const found = splitSections(rows);
  return tab.take.map(want => {
    const s = found.find(x => x.title.toLowerCase() === want.toLowerCase());
    return { title: want, gid: tab.gid, book: tab.book,
             rows: s ? s.rows : [], missing: !s };
  });
}

export async function GET() {
  try {
    if (cache && Date.now() - cache.at < CACHE_MS) return Response.json(cache.body);

    // One request per entry, in parallel. A tab that fails does NOT take the others
    // down — it becomes a section that says so, which is more useful than a blank page.
    const chunks = await Promise.all(TABS.map(tab =>
      readTab(tab).catch(e => (tab.take || [tab.title]).map(t => ({
        title: tab.take ? t : tab.title, gid: tab.gid, book: tab.book,
        rows: [], err: e.message || String(e),
      })))));

    const sections = chunks.flat().map(s => {
      const a = analyse(s.rows);
      return {
        title: s.title, gid: s.gid, book: s.book,
        edit: editUrl(s.gid, s.book),
        err: s.err || (s.missing ? 'not found in the sheet' : null),
        links: a.links,
        // The header is computed HERE, once, rather than in the browser for every group
        // table: the geometry is the same for all of them, and getting it wrong is the
        // difference between a stacked header and a slab of dark blue.
        header: headerRows(a.head, a.groups, a.width),
        cols: colLabels(a.head, a.width),
        totalCol: totalCol(a.head, a.width),
        groups: a.groups,
        width: a.width,
        count: a.groups.reduce((n, g) => n + g.rows.length, 0),
      };
    });

    if (sections.every(s => s.err)) throw new Error(sections[0].err);

    const body = {
      ok: true,
      asOf: new Date().toISOString(),
      sections,
      total: sections.reduce((n, s) => n + s.count, 0),
    };
    cache = { at: Date.now(), body };
    return Response.json(body);
  } catch (e) {
    console.error('[api/postage]', e.message);
    return Response.json(
      { ok: false, error: 'Could not read the postage sheet: ' + e.message },
      { status: 502 });
  }
}
