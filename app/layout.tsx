import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { JetBrains_Mono, Pixelify_Sans, Silkscreen } from 'next/font/google';
import './globals.css';

// next/font downloads these at build time and serves them from this origin: no request ever reaches Google.
const pixelify = Pixelify_Sans({ subsets: ['latin'], variable: '--font-pixelify' });
const silkscreen = Silkscreen({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-silkscreen' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' });

export const metadata: Metadata = {
  title: 'Dead Drop',
  description: 'A pocket-sized fog-of-war hunt for a vault of Zcash testnet ZEC. Raise a pixel agent, sign every move, sweep the vault.',
  referrer: 'no-referrer',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${pixelify.variable} ${silkscreen.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
