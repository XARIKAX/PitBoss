import type { Metadata } from 'next';
import { IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';
import { AppShell } from '@/components/shell/AppShell';
import { Footer } from '@/components/Footer';
import { Ticker } from '@/components/Ticker';

/**
 * Terminal design system: IBM Plex Mono everywhere. One family, four weights —
 * hierarchy comes from size, case, tracking, and color, not typeface changes.
 */
const mono = IBM_Plex_Mono({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'PitBosses — Run the floor. Get paid in stock.',
  description:
    'Buy a Boss. Work the Pit. Be the House. Rewards are promotional, not dividends. A permissionless front end by MarketMaker Labs.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={mono.variable}>
      <body className="min-h-screen text-paper antialiased">
        <Providers>
          <AppShell>
            {children}
            <Footer />
          </AppShell>
          <Ticker />
        </Providers>
      </body>
    </html>
  );
}
