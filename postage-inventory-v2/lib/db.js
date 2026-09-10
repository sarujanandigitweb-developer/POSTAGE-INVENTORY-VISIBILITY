// Server-only facade over the LEDSone connection.
//
// Importing this from a client component is a BUILD ERROR, not a silent leak —
// that is the point. The standing rule on this project is that PostgreSQL is
// never reached from browser-side JavaScript and credentials never appear in
// anything shipped to a browser.
import 'server-only';
export { query, withClient, redact } from './pg-core.js';
