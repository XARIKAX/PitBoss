/**
 * wagmi v2 configuration.
 *
 * Two chains: Robinhood Chain (primary) and Base (fallback), both defined from
 * config/chains.ts so there is one source of truth. Connectors: injected +
 * WalletConnect. The WalletConnect project id comes from env — the connector is
 * only added when it is present so dev works without one.
 */
import { createConfig, http } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import { defineChain } from 'viem';
import { CHAINS, ROBINHOOD_CHAIN_ID, BASE_CHAIN_ID } from '@/config/chains';

const robinhood = defineChain({
  id: ROBINHOOD_CHAIN_ID,
  name: CHAINS[ROBINHOOD_CHAIN_ID].name,
  nativeCurrency: CHAINS[ROBINHOOD_CHAIN_ID].nativeCurrency,
  rpcUrls: { default: { http: [CHAINS[ROBINHOOD_CHAIN_ID].rpcUrl] } },
  blockExplorers: {
    default: { name: 'Explorer', url: CHAINS[ROBINHOOD_CHAIN_ID].explorerUrl },
  },
});

const base = defineChain({
  id: BASE_CHAIN_ID,
  name: CHAINS[BASE_CHAIN_ID].name,
  nativeCurrency: CHAINS[BASE_CHAIN_ID].nativeCurrency,
  rpcUrls: { default: { http: [CHAINS[BASE_CHAIN_ID].rpcUrl] } },
  blockExplorers: { default: { name: 'Basescan', url: CHAINS[BASE_CHAIN_ID].explorerUrl } },
});

const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

const connectors = [
  injected({ shimDisconnect: true }),
  ...(wcProjectId
    ? [
        walletConnect({
          projectId: wcProjectId,
          metadata: {
            name: 'PitBosses',
            description: 'Run the floor. Get paid in stock.',
            url: 'https://pitbosses.example',
            icons: [],
          },
          showQrModal: true,
        }),
      ]
    : []),
];

export const wagmiConfig = createConfig({
  chains: [robinhood, base],
  connectors,
  transports: {
    [robinhood.id]: http(CHAINS[ROBINHOOD_CHAIN_ID].rpcUrl),
    [base.id]: http(CHAINS[BASE_CHAIN_ID].rpcUrl),
  },
  ssr: true,
});

export const APP_CHAINS = { robinhood, base };

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
