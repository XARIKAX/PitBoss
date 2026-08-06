/**
 * Chain configuration — single source of truth for chain-specific values.
 *
 * Solidity mirror: contracts/src/config/Chains.sol. Keep the two in sync.
 *
 * Robinhood Chain (4663) is the primary target (ETH gas, miner entropy).
 * Base (8453) is the fallback (Chainlink VRF entropy).
 *
 * Addresses are placeholders unless a deployments.<chain>.json overrides them
 * (see lib/deployments.ts). Everything marked TODO needs a real value before
 * mainnet.
 */
import type { Address } from 'viem';
import { deploymentsFor, PLACEHOLDER, type DeploymentMap } from '@/lib/deployments';

export type EntropyKind = 'miner' | 'vrf';

export type ChainConfig = {
  id: number;
  name: string;
  /** Primary target vs fallback. */
  primary: boolean;
  /** RPC URL — sourced from env, never hardcoded for mainnet. */
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  wethAddress: Address;
  oracleAddress: Address;
  /** Ticker -> ERC20 address. Placeholder mocks until deploy. */
  stockTokens: Record<string, Address>;
  entropyKind: EntropyKind;
  /** Full resolved deployment map (placeholder-safe). */
  deployments: DeploymentMap;
};

export const ROBINHOOD_CHAIN_ID = 4663;
export const BASE_CHAIN_ID = 8453;

// Env-sourced RPCs. Fall back to a public/placeholder so dev never crashes.
const RPC_ROBINHOOD =
  process.env.NEXT_PUBLIC_RPC_ROBINHOOD ?? 'https://rpc.mainnet.chain.robinhood.com'
const RPC_BASE = process.env.NEXT_PUBLIC_RPC_BASE ?? 'https://mainnet.base.org';

// Placeholder mock stock tokens per chain (tickers mirror MockStockToken.sol).
const MOCK_STOCKS: Record<string, Address> = {
  AAPL: PLACEHOLDER, // TODO: real stock-token address
  TSLA: PLACEHOLDER,
  NVDA: PLACEHOLDER,
  HOOD: PLACEHOLDER,
};

const robinhoodDeployments = deploymentsFor(ROBINHOOD_CHAIN_ID);
const baseDeployments = deploymentsFor(BASE_CHAIN_ID);

export const CHAINS: Record<number, ChainConfig> = {
  [ROBINHOOD_CHAIN_ID]: {
    id: ROBINHOOD_CHAIN_ID,
    name: 'Robinhood Chain',
    primary: true,
    rpcUrl: RPC_ROBINHOOD,
    explorerUrl: 'https://robinhoodchain.blockscout.com',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    wethAddress: robinhoodDeployments.weth,
    oracleAddress: robinhoodDeployments.oracle,
    stockTokens:
      Object.keys(robinhoodDeployments.stockTokens).length > 0
        ? robinhoodDeployments.stockTokens
        : MOCK_STOCKS,
    entropyKind: 'miner',
    deployments: robinhoodDeployments,
  },
  [BASE_CHAIN_ID]: {
    id: BASE_CHAIN_ID,
    name: 'Base',
    primary: false,
    rpcUrl: RPC_BASE,
    explorerUrl: 'https://basescan.org',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    wethAddress: baseDeployments.weth,
    oracleAddress: baseDeployments.oracle,
    stockTokens:
      Object.keys(baseDeployments.stockTokens).length > 0 ? baseDeployments.stockTokens : MOCK_STOCKS,
    entropyKind: 'vrf',
    deployments: baseDeployments,
  },
};

export const PRIMARY_CHAIN = CHAINS[ROBINHOOD_CHAIN_ID];
export const FALLBACK_CHAIN = CHAINS[BASE_CHAIN_ID];
export const SUPPORTED_CHAIN_IDS = [ROBINHOOD_CHAIN_ID, BASE_CHAIN_ID] as const;

export function getChain(chainId: number | undefined): ChainConfig | undefined {
  return chainId == null ? undefined : CHAINS[chainId];
}

export function isSupported(chainId: number | undefined): boolean {
  return chainId != null && chainId in CHAINS;
}

export function explorerTx(chainId: number, hash: string): string {
  const c = getChain(chainId) ?? PRIMARY_CHAIN;
  return `${c.explorerUrl}/tx/${hash}`;
}

export function explorerAddress(chainId: number, addr: string): string {
  const c = getChain(chainId) ?? PRIMARY_CHAIN;
  return `${c.explorerUrl}/address/${addr}`;
}
