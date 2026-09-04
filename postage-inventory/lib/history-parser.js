import 'server-only';

// The shipped parser, reused as-is from ../sql/product-history-parser.js. It reads
// inventory.product_history free text — the dates and warehouses live INSIDE the
// text, there is no column for them — so re-implementing it would be re-deriving a
// rule that has already been validated against the live dashboard.
//
// A STATIC re-export. This used to be createRequire(import.meta.url) around a .cjs,
// which webpack cannot follow; see the note at the foot of history-parser-impl.js.
export { parseLine, region } from './history-parser-impl.js';
