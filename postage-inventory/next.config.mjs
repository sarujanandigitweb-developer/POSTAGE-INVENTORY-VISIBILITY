/** @type {import('next').NextConfig} */
const nextConfig = {
  // `pg` is a native-ish driver: keep it on the server, never bundled for the
  // browser. The standing rule on this project is that PostgreSQL is never
  // reached from browser-side JavaScript.
  serverExternalPackages: ['pg'],

  // WITHOUT THIS THE DEPLOYED FUNCTIONS SHIP WITHOUT THEIR DATA. Next traces which files
  // each route needs and bundles only those, and it can only trace what it can see
  // statically. Every data file here is read at RUNTIME through a path built from
  // process.cwd() — the snapshots, the curated classification, the pipeline price files —
  // so the tracer finds no reference to any of them and leaves them out.
  //
  // Locally that is invisible: `next start` runs in the project directory and the files
  // are simply there. On Vercel the function gets its own bundle, the read throws ENOENT,
  // and every route silently falls back to querying the database — the exact thing the
  // snapshots exist to prevent, against a role that allows ten connections.
  // A NOTE FOR THE NEXT PERSON: do NOT pin outputFileTracingRoot to this directory.
  // It looks like the obvious way to stop Next inferring the repository root, and it
  // fails the build outright — "Collecting build traces" then ENOENT on the first
  // .nft.json it tries to write. The layout is handled at runtime instead, by
  // lib/data-dir.js finding the data directory rather than assuming it.

  outputFileTracingIncludes: {
    '/api/**': ['./data/**/*.json'],
  },
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
};
export default nextConfig;
