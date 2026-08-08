'use client';

/**
 * Reown AppKit initialization.
 *
 * Creating the modal once, at module load, registers the wagmi adapter and
 * makes the "Connect a Wallet" modal available to `useAppKit()` anywhere in the
 * tree. `createAppKit` is SSR-safe and must run on both server prerender and
 * client, otherwise `useAppKit()` throws "call createAppKit before using…".
 *
 * Import this module for its side effect from a client component (Providers).
 */
import { createAppKit } from '@reown/appkit/react';
import { wagmiAdapter, networks, projectId } from '@/lib/wagmi';

export const appkitModal = createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  defaultNetwork: networks[0],
  metadata: {
    name: 'PitBosses',
    description: 'Run the floor. Get paid in stock.',
    url: 'https://pitbosses.xyz',
    icons: ['https://pitbosses.xyz/hero/icon-192.png'],
  },
  features: {
    analytics: false,
    email: false,
    socials: [],
  },
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#a3e635',
  },
});
