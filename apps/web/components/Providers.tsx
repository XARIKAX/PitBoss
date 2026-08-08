'use client';

import { useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { wagmiConfig } from '@/lib/wagmi';
import { ToastProvider } from '@/components/TxToast';

/**
 * Global client providers: wagmi + react-query + RainbowKit + tx-toast context.
 * Everything below the fold that touches wallet state lives inside this tree.
 *
 * RainbowKit is themed to the terminal look — lime accent, dark surfaces, sharp
 * corners. The modal font is set to IBM Plex Mono via `[data-rk]` in globals.css
 * so it matches the rest of the site.
 */
const rkTheme = darkTheme({
  accentColor: '#a3e635', // lime
  accentColorForeground: '#0a0a0a',
  borderRadius: 'small',
  fontStack: 'system',
  overlayBlur: 'small',
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rkTheme} modalSize="compact">
          <ToastProvider>{children}</ToastProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
