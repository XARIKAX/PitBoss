'use client';

/**
 * Typed contract helpers — one place that pairs deployed addresses with ABIs.
 *
 * `getContracts(chainId)` returns wagmi-ready `{ address, abi }` configs for
 * every core contract on that chain (placeholder-safe: check `isDeployed`
 * before reading/writing). `useContracts()` resolves the connected chain and
 * falls back to Robinhood Chain (4663).
 */
import { useMemo } from 'react';
import { useChainId, useReadContract } from 'wagmi';
import type { Abi, Address } from 'viem';
import { CHAINS, ROBINHOOD_CHAIN_ID, isSupported, type ChainConfig } from '@/config/chains';
import { isDeployed } from '@/lib/deployments';

import pitJson from '@/lib/abi/PIT.json';
import pitBossJson from '@/lib/abi/PitBoss.json';
import flatAmmVaultJson from '@/lib/abi/FlatAMMVault.json';
import activationManagerJson from '@/lib/abi/ActivationManager.json';
import floorPositionJson from '@/lib/abi/FloorPosition.json';
import houseBookJson from '@/lib/abi/HouseBook.json';
import pitTreasuryJson from '@/lib/abi/PitTreasury.json';
import bearerCertificateJson from '@/lib/abi/BearerCertificate.json';
import certificateCounterJson from '@/lib/abi/CertificateCounter.json';
import degenRollJson from '@/lib/abi/DegenRoll.json';
import degenRollFactoryJson from '@/lib/abi/DegenRollFactory.json';
import rouletteWheelJson from '@/lib/abi/RouletteWheel.json';
import rouletteWheelFactoryJson from '@/lib/abi/RouletteWheelFactory.json';
import freeMintPassJson from '@/lib/abi/FreeMintPass.json';
import liquidityLockerJson from '@/lib/abi/LiquidityLocker.json';
import loanVaultJson from '@/lib/abi/LoanVault.json';
import launcherFactoryJson from '@/lib/abi/LauncherFactory.json';
import openingBellJson from '@/lib/abi/OpeningBell.json';
import seasonEngineJson from '@/lib/abi/SeasonEngine.json';
import mockEntropyConductorJson from '@/lib/abi/MockEntropyConductor.json';
import mockOracleJson from '@/lib/abi/MockOracle.json';
import mockSwapRouterJson from '@/lib/abi/MockSwapRouter.json';
import mockStockTokenJson from '@/lib/abi/MockStockToken.json';

/** All ABIs, cast once. Reads/writes cast their results at the call site. */
export const ABIS = {
  pit: pitJson as unknown as Abi,
  pitBoss: pitBossJson as unknown as Abi,
  flatAmmVault: flatAmmVaultJson as unknown as Abi,
  activationManager: activationManagerJson as unknown as Abi,
  floorPosition: floorPositionJson as unknown as Abi,
  houseBook: houseBookJson as unknown as Abi,
  pitTreasury: pitTreasuryJson as unknown as Abi,
  bearerCertificate: bearerCertificateJson as unknown as Abi,
  certificateCounter: certificateCounterJson as unknown as Abi,
  degenRoll: degenRollJson as unknown as Abi,
  degenRollFactory: degenRollFactoryJson as unknown as Abi,
  rouletteWheel: rouletteWheelJson as unknown as Abi,
  rouletteWheelFactory: rouletteWheelFactoryJson as unknown as Abi,
  freeMintPass: freeMintPassJson as unknown as Abi,
  liquidityLocker: liquidityLockerJson as unknown as Abi,
  loanVault: loanVaultJson as unknown as Abi,
  launcherFactory: launcherFactoryJson as unknown as Abi,
  openingBell: openingBellJson as unknown as Abi,
  seasonEngine: seasonEngineJson as unknown as Abi,
  // MockEntropyConductor's surface matches the conductor interface (healthy /
  // isReady / isFulfilled) so it doubles as the generic conductor ABI.
  entropyConductor: mockEntropyConductorJson as unknown as Abi,
  oracle: mockOracleJson as unknown as Abi,
  swapRouter: mockSwapRouterJson as unknown as Abi,
  erc20: mockStockTokenJson as unknown as Abi,
} as const;

export type ContractRef = { address: Address; abi: Abi };

export type Contracts = {
  pit: ContractRef;
  pitBoss: ContractRef;
  flatAmmVault: ContractRef;
  activationManager: ContractRef;
  floorPosition: ContractRef;
  houseBook: ContractRef;
  pitTreasury: ContractRef;
  bearerCertificate: ContractRef;
  certificateCounter: ContractRef;
  degenRollFactory: ContractRef;
  rouletteWheelFactory: ContractRef;
  freeMintPass: ContractRef;
  loanVault: ContractRef;
  locker: ContractRef;
  launcher: ContractRef;
  openingBell: ContractRef;
  seasonEngine: ContractRef;
  entropyConductor: ContractRef;
  oracle: ContractRef;
  swapRouter: ContractRef;
};

/** wagmi-ready { address, abi } pairs for every contract on a chain. */
export function getContracts(chainId: number): Contracts {
  const chain = CHAINS[chainId] ?? CHAINS[ROBINHOOD_CHAIN_ID];
  const d = chain.deployments;
  return {
    pit: { address: d.pit, abi: ABIS.pit },
    pitBoss: { address: d.pitBoss, abi: ABIS.pitBoss },
    flatAmmVault: { address: d.flatAmmVault, abi: ABIS.flatAmmVault },
    activationManager: { address: d.activationManager, abi: ABIS.activationManager },
    floorPosition: { address: d.floorPosition, abi: ABIS.floorPosition },
    houseBook: { address: d.houseBook, abi: ABIS.houseBook },
    // Optional wiring: PLACEHOLDER until the treasury is deployed and added to
    // deployments.<chain>.json. The rewards page keys its PIT section off this.
    pitTreasury: { address: d.pitTreasury, abi: ABIS.pitTreasury },
    bearerCertificate: { address: d.bearerCertificate, abi: ABIS.bearerCertificate },
    certificateCounter: { address: d.certificateCounter, abi: ABIS.certificateCounter },
    degenRollFactory: { address: d.degenRollFactory, abi: ABIS.degenRollFactory },
    rouletteWheelFactory: { address: d.rouletteWheelFactory, abi: ABIS.rouletteWheelFactory },
    freeMintPass: { address: d.freeMintPass, abi: ABIS.freeMintPass },
    loanVault: { address: d.loans, abi: ABIS.loanVault },
    locker: { address: d.locker, abi: ABIS.liquidityLocker },
    launcher: { address: d.launcher, abi: ABIS.launcherFactory },
    openingBell: { address: d.openingBell, abi: ABIS.openingBell },
    seasonEngine: { address: d.seasonEngine, abi: ABIS.seasonEngine },
    entropyConductor: { address: d.entropyConductor, abi: ABIS.entropyConductor },
    oracle: { address: d.oracle, abi: ABIS.oracle },
    swapRouter: { address: d.swapRouter, abi: ABIS.swapRouter },
  };
}

export type UseContractsResult = {
  chainId: number;
  chain: ChainConfig;
  c: Contracts;
};

/** Contracts for the connected chain; falls back to Robinhood Chain (4663). */
export function useContracts(): UseContractsResult {
  const connected = useChainId();
  const chainId = isSupported(connected) ? connected : ROBINHOOD_CHAIN_ID;
  return useMemo(
    () => ({ chainId, chain: CHAINS[chainId], c: getContracts(chainId) }),
    [chainId],
  );
}

/**
 * Thin typed wrapper over useReadContract: auto-disables on placeholder
 * addresses and casts the result. Loading renders as the mono "…" style at the
 * call site.
 */
export function useRead<T = unknown>({
  contract,
  functionName,
  args,
  enabled = true,
  refetchInterval,
}: {
  contract: ContractRef;
  functionName: string;
  args?: readonly unknown[];
  enabled?: boolean;
  refetchInterval?: number;
}) {
  const res = useReadContract({
    address: contract.address,
    abi: contract.abi,
    functionName,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args: args as any,
    query: {
      enabled: enabled && isDeployed(contract.address),
      refetchInterval,
    },
  });
  return { ...res, data: res.data as T | undefined };
}

/**
 * One-off read that never throws: resolves null on placeholder addresses and
 * on revert. Used inside react-query fetchers that aggregate optional data.
 */
export async function safeRead(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  contract: ContractRef,
  functionName: string,
  args?: readonly unknown[],
): Promise<unknown | null> {
  if (!client || !isDeployed(contract.address)) return null;
  try {
    return await client.readContract({
      address: contract.address,
      abi: contract.abi,
      functionName,
      args,
    });
  } catch {
    return null;
  }
}

/**
 * Batched reads: multicall when the chain has Multicall3, chunked sequential
 * reads otherwise. Failures resolve to null (allowFailure semantics).
 */
export async function readMany(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  calls: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] }[],
  chunkSize = 250,
): Promise<(unknown | null)[]> {
  const out: (unknown | null)[] = [];
  for (let i = 0; i < calls.length; i += chunkSize) {
    const chunk = calls.slice(i, i + chunkSize);
    try {
      const res = (await client.multicall({ contracts: chunk, allowFailure: true })) as {
        status: string;
        result?: unknown;
      }[];
      out.push(...res.map((r) => (r.status === 'success' ? (r.result ?? null) : null)));
    } catch {
      const res = await Promise.all(
        chunk.map((c) => client.readContract(c).catch(() => null) as Promise<unknown | null>),
      );
      out.push(...res);
    }
  }
  return out;
}
