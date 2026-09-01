/** @type {import('next').NextConfig} */
const nextConfig = {
  // `pg` is a native-ish driver: keep it on the server, never bundled for the
  // browser. The standing rule on this project is that PostgreSQL is never
  // reached from browser-side JavaScript.
  serverExternalPackages: ['pg'],
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
};
export default nextConfig;
