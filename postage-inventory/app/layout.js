import './dashboard.css';
import './sidebar.css';

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
