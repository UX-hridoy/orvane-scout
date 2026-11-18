import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/urbanist';
import '@fontsource-variable/figtree';
import './globals.css';

export const metadata: Metadata = {
  title: 'Scout · Orvane Sourcing',
  description: 'A sourcing agent that works out what a product really earns, checks who is safe to buy from, and gets the quotes for you. Concept prototype on simulated data.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f5f5f5' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
