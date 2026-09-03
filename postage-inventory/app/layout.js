import './dashboard.css';   // the live page's stylesheet, ported verbatim — owns the TABLE
import './theme.css';       // chrome only: sidebar, top bar, cards, toolbar, pager

export const metadata = {
  title: 'Postage Inventory Visibility',
  description: 'Stock, pricing, slow-moving lines and pending dispatch, read live from LEDSone.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
