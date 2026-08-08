/**
 * wagmi v2 configuration.
 *
 * Chains: Robinhood Chain (primary) and Base (fallback), both defined from
 * config/chains.ts so there is one source of truth. When
 * NEXT_PUBLIC_ENABLE_ANVIL=1 a local anvil fork (31337) is added first so dev
 * defaults to it. Connectors: injected + WalletConnect. The WalletConnect
 * project id comes from env — the connector is only added when it is present so
 * dev works without one.
 */
import { createConfig, http } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import { defineChain } from 'viem';
import {
  CHAINS,
  ROBINHOOD_CHAIN_ID,
  BASE_CHAIN_ID,
  ANVIL_CHAIN_ID,
  ANVIL_ENABLED,
  RPC_ANVIL,
} from '@/config/chains';

// Canonical Multicall3 — deployed at the same address on virtually every chain
// (and present on anvil forks of them). viem falls back gracefully when absent.
const MULTICALL3 = {
  multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' as const },
};

const robinhood = defineChain({
  id: ROBINHOOD_CHAIN_ID,
  name: CHAINS[ROBINHOOD_CHAIN_ID].name,
  nativeCurrency: CHAINS[ROBINHOOD_CHAIN_ID].nativeCurrency,
  rpcUrls: { default: { http: [CHAINS[ROBINHOOD_CHAIN_ID].rpcUrl] } },
  blockExplorers: {
    default: { name: 'Explorer', url: CHAINS[ROBINHOOD_CHAIN_ID].explorerUrl },
  },
  contracts: MULTICALL3,
});

const base = defineChain({
  id: BASE_CHAIN_ID,
  name: CHAINS[BASE_CHAIN_ID].name,
  nativeCurrency: CHAINS[BASE_CHAIN_ID].nativeCurrency,
  rpcUrls: { default: { http: [CHAINS[BASE_CHAIN_ID].rpcUrl] } },
  blockExplorers: { default: { name: 'Basescan', url: CHAINS[BASE_CHAIN_ID].explorerUrl } },
  contracts: MULTICALL3,
});

const anvil = defineChain({
  id: ANVIL_CHAIN_ID,
  name: 'Anvil (local)',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC_ANVIL] } },
  contracts: MULTICALL3,
});

type AppChain = typeof robinhood | typeof base | typeof anvil;

// Anvil first when enabled so disconnected reads default to the local fork.
const chains = (ANVIL_ENABLED ? [anvil, robinhood, base] : [robinhood, base]) as [
  AppChain,
  ...AppChain[],
];

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
            url: 'https://pitbosses.xyz',
            icons: ['https://pitbosses.xyz/hero/icon-192.png'],
          },
          showQrModal: true,
        }),
      ]
    : []),
];

export const wagmiConfig = createConfig({
  chains,
  connectors,
  transports: {
    [robinhood.id]: http(CHAINS[ROBINHOOD_CHAIN_ID].rpcUrl),
    [base.id]: http(CHAINS[BASE_CHAIN_ID].rpcUrl),
    [anvil.id]: http(RPC_ANVIL),
  },
  ssr: true,
});

export const APP_CHAINS = { robinhood, base, anvil };

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
