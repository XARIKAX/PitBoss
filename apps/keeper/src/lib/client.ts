/**
 * viem client factory. A single public client for reads and, when a signer key
 * is configured, a wallet client for writes. Both chains PitBosses targets use
 * ETH gas, so the chain object is built from CHAIN_ID/RPC_URL directly.
 */

import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Account,
  type Chain,
  type PublicClient,
  type WalletClient,
} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import type {Config} from "./config.js";

/** Minimal chain definitions for the two supported networks. */
export function chainFor(chainId: number, rpcUrl: string): Chain {
  const known: Record<number, {name: string; explorer?: string}> = {
    4663: {name: "Robinhood Chain"},
    8453: {name: "Base", explorer: "https://basescan.org"},
  };
  const meta = known[chainId] ?? {name: `chain-${chainId}`};
  return defineChain({
    id: chainId,
    name: meta.name,
    nativeCurrency: {name: "Ether", symbol: "ETH", decimals: 18},
    rpcUrls: {default: {http: [rpcUrl]}},
    ...(meta.explorer
      ? {blockExplorers: {default: {name: "explorer", url: meta.explorer}}}
      : {}),
  });
}

export interface Clients {
  chain: Chain;
  publicClient: PublicClient;
  /** Present only when PRIVATE_KEY is configured (read-only bots don't need it). */
  walletClient?: WalletClient;
  account?: Account;
}

export function makeClients(cfg: Config): Clients {
  const chain = chainFor(cfg.chainId, cfg.rpcUrl);
  const transport = http(cfg.rpcUrl, {
    // viem retries transient transport failures; our loop backoff handles the rest.
    retryCount: 2,
    retryDelay: 500,
  });

  const publicClient = createPublicClient({chain, transport});

  if (!cfg.privateKey) {
    return {chain, publicClient};
  }

  const account = privateKeyToAccount(cfg.privateKey);
  const walletClient = createWalletClient({chain, transport, account});
  return {chain, publicClient, walletClient, account};
}

/** Assert a wallet client exists; write-capable bots call this at startup. */
export function requireWallet(c: Clients): {
  walletClient: WalletClient;
  account: Account;
} {
  if (!c.walletClient || !c.account) {
    throw new Error("PRIVATE_KEY not set — this bot sends transactions and needs a signer");
  }
  return {walletClient: c.walletClient, account: c.account};
}
