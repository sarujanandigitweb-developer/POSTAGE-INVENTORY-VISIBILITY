import 'server-only';
import { createRequire } from 'node:module';

// The shipped parser, reused as-is from ../sql/product-history-parser.js. It reads
// inventory.product_history free text — the dates and warehouses live INSIDE the
// text, there is no column for them — so re-implementing it would be re-deriving a
// rule that has already been validated against the live dashboard.
const require = createRequire(import.meta.url);
const parser = require('./history-parser.cjs');

export const parseLine = parser.parseLine;
export const region = parser.region;
