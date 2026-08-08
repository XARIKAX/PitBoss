/**
 * wagmi v2 configuration — driven by RainbowKit.
 *
 * `getDefaultConfig` builds the wagmi Config and wires RainbowKit's full
 * connector set (injected extensions + MetaMask / Rabby / Rainbow / Coinbase +
 * WalletConnect for mobile) behind the "Connect a Wallet" modal. One button
 * works for both desktop extensions and mobile wallets, with no third-party
 * badge.
 *
 * Chains: Robinhood Chain (primary) and Base (fallback), defined from
 * config/chains.ts so there is one source of truth. When
 * NEXT_PUBLIC_ENABLE_ANVIL=1 a local anvil fork (31337) is added first.
 *
 * The WalletConnect project id comes from env
 * (NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID). A build-safe placeholder keeps local
 * builds working; the real id is injected at build time on the host.
 */
import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http } from 'wagmi';
import { defineChain } from 'viem';
import type { Chain } from 'viem';
import {
  CHAINS,
  ROBINHOOD_CHAIN_ID,
  BASE_CHAIN_ID,
  ANVIL_CHAIN_ID,
  ANVIL_ENABLED,
  RPC_ANVIL,
} from '@/config/chains';

// Canonical Multicall3 — deployed at the same address on virtually every chain.
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

// Anvil first when enabled so disconnected reads default to the local fork.
const chains = (ANVIL_ENABLED ? [anvil, robinhood, base] : [robinhood, base]) as [
  Chain,
  ...Chain[],
];

// WalletConnect / Reown project id. Non-empty placeholder keeps builds from
// crashing when the env var is absent; the real id is injected at build time.
const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? 'PLACEHOLDER_PROJECT_ID';

export const wagmiConfig = getDefaultConfig({
  appName: 'PitBosses',
  appDescription: 'Run the floor. Get paid in stock.',
  appUrl: 'https://pitbosses.xyz',
  appIcon: 'https://pitbosses.xyz/hero/icon-192.png',
  projectId,
  chains,
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
