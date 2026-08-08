/**
 * wagmi v2 configuration — driven by Reown AppKit.
 *
 * The wagmi Config is created by AppKit's WagmiAdapter, which also wires the
 * full connector set (injected / MetaMask / Phantom / Coinbase / WalletConnect)
 * behind AppKit's "Connect a Wallet" modal. This is what makes both desktop
 * extensions AND mobile wallets work from one button.
 *
 * Chains: Robinhood Chain (primary) and Base (fallback), defined from
 * config/chains.ts so there is one source of truth. When
 * NEXT_PUBLIC_ENABLE_ANVIL=1 a local anvil fork (31337) is added first.
 *
 * The WalletConnect project id comes from env
 * (NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID). A build-safe placeholder keeps local
 * builds working; the real id is injected at build time on the host.
 */
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { defineChain } from '@reown/appkit/networks';
import type { AppKitNetwork } from '@reown/appkit/networks';
import { http } from 'wagmi';
import {
  CHAINS,
  ROBINHOOD_CHAIN_ID,
  BASE_CHAIN_ID,
  ANVIL_CHAIN_ID,
  ANVIL_ENABLED,
  RPC_ANVIL,
} from '@/config/chains';

// Canonical Multicall3 — deployed at the same address on virtually every chain.
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11' as const;

export const robinhood = defineChain({
  id: ROBINHOOD_CHAIN_ID,
  caipNetworkId: `eip155:${ROBINHOOD_CHAIN_ID}`,
  chainNamespace: 'eip155',
  name: CHAINS[ROBINHOOD_CHAIN_ID].name,
  nativeCurrency: CHAINS[ROBINHOOD_CHAIN_ID].nativeCurrency,
  rpcUrls: { default: { http: [CHAINS[ROBINHOOD_CHAIN_ID].rpcUrl] } },
  blockExplorers: {
    default: { name: 'Explorer', url: CHAINS[ROBINHOOD_CHAIN_ID].explorerUrl },
  },
  contracts: { multicall3: { address: MULTICALL3 } },
});

export const base = defineChain({
  id: BASE_CHAIN_ID,
  caipNetworkId: `eip155:${BASE_CHAIN_ID}`,
  chainNamespace: 'eip155',
  name: CHAINS[BASE_CHAIN_ID].name,
  nativeCurrency: CHAINS[BASE_CHAIN_ID].nativeCurrency,
  rpcUrls: { default: { http: [CHAINS[BASE_CHAIN_ID].rpcUrl] } },
  blockExplorers: { default: { name: 'Basescan', url: CHAINS[BASE_CHAIN_ID].explorerUrl } },
  contracts: { multicall3: { address: MULTICALL3 } },
});

export const anvil = defineChain({
  id: ANVIL_CHAIN_ID,
  caipNetworkId: `eip155:${ANVIL_CHAIN_ID}`,
  chainNamespace: 'eip155',
  name: 'Anvil (local)',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC_ANVIL] } },
  contracts: { multicall3: { address: MULTICALL3 } },
});

// Anvil first when enabled so disconnected reads default to the local fork.
export const networks = (
  ANVIL_ENABLED ? [anvil, robinhood, base] : [robinhood, base]
) as [AppKitNetwork, ...AppKitNetwork[]];

// WalletConnect / Reown project id. Non-empty placeholder keeps builds from
// crashing when the env var is absent; the real id is injected at build time.
export const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? 'PLACEHOLDER_PROJECT_ID';

const transports: Record<number, ReturnType<typeof http>> = {
  [ROBINHOOD_CHAIN_ID]: http(CHAINS[ROBINHOOD_CHAIN_ID].rpcUrl),
  [BASE_CHAIN_ID]: http(CHAINS[BASE_CHAIN_ID].rpcUrl),
};
if (ANVIL_ENABLED) transports[ANVIL_CHAIN_ID] = http(RPC_ANVIL);

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: true,
  transports,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;

export const APP_CHAINS = { robinhood, base, anvil };

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
