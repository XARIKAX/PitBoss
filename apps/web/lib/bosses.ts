'use client';

/**
 * Boss (NFT) enumeration + per-boss detail reads, shared by /floor, /pit and
 * /loans. Supply is capped at 888 so scanning ownerOf over 1..totalMinted with
 * chunked multicalls is fine.
 */
import { useAccount, usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import type { Address } from 'viem';
import { readMany, safeRead, useContracts } from '@/lib/contracts';
import { isDeployed } from '@/lib/deployments';

/** Token ids of Bosses owned by the connected wallet. */
export function useMyBossIds() {
  const { address } = useAccount();
  const { c, chainId } = useContracts();
  const client = usePublicClient();

  return useQuery({
    queryKey: ['myBossIds', chainId, address ?? '0x0'],
    enabled: Boolean(address && client && isDeployed(c.pitBoss.address)),
    refetchInterval: 30_000,
    queryFn: async (): Promise<bigint[]> => {
      const total = (await safeRead(client, c.pitBoss, 'totalMinted')) as bigint | null;
      if (total == null || total === 0n) return [];
      const n = Number(total);
      const calls = Array.from({ length: n }, (_, i) => ({
        address: c.pitBoss.address,
        abi: c.pitBoss.abi,
        functionName: 'ownerOf',
        args: [BigInt(i + 1)] as const,
      }));
      const owners = await readMany(client, calls, 250);
      const me = address!.toLowerCase();
      const mine: bigint[] = [];
      owners.forEach((o, i) => {
        if (typeof o === 'string' && o.toLowerCase() === me) mine.push(BigInt(i + 1));
      });
      return mine;
    },
  });
}

export type BossInfo = {
  id: bigint;
  tba: Address | null;
  tbaBalance: bigint | null;
  activated: boolean | null;
  weight: bigint | null;
  projectedWeight: bigint | null;
  score: bigint | null;
  pending: bigint | null;
  election: { tokens: Address[]; weightsBps: number[] } | null;
};

/** Everything the floor page shows for one Boss. */
export function useBossInfo(id: bigint) {
  const { c, chainId } = useContracts();
  const client = usePublicClient();

  return useQuery({
    queryKey: ['bossInfo', chainId, id.toString()],
    enabled: Boolean(client && isDeployed(c.pitBoss.address)),
    refetchInterval: 20_000,
    queryFn: async (): Promise<BossInfo> => {
      const [tba, activated, weight, projectedWeight, score, pending, election] =
        await Promise.all([
          safeRead(client, c.pitBoss, 'accountOf', [id]),
          safeRead(client, c.activationManager, 'isActivated', [id]),
          safeRead(client, c.floorPosition, 'weightOf', [id]),
          safeRead(client, c.floorPosition, 'projectedWeightOf', [id]),
          safeRead(client, c.floorPosition, 'scoreOf', [id]),
          safeRead(client, c.houseBook, 'pendingOf', [id]),
          safeRead(client, c.houseBook, 'electionOf', [id]),
        ]);
      let tbaBalance: bigint | null = null;
      if (typeof tba === 'string' && client) {
        try {
          tbaBalance = await client.getBalance({ address: tba as Address });
        } catch {
          tbaBalance = null;
        }
      }
      const electionTuple = election as readonly [readonly Address[], readonly number[]] | null;
      return {
        id,
        tba: typeof tba === 'string' ? (tba as Address) : null,
        tbaBalance,
        activated: typeof activated === 'boolean' ? activated : null,
        weight: (weight as bigint | null) ?? null,
        projectedWeight: (projectedWeight as bigint | null) ?? null,
        score: (score as bigint | null) ?? null,
        pending: (pending as bigint | null) ?? null,
        election: electionTuple
          ? {
              tokens: [...electionTuple[0]],
              weightsBps: electionTuple[1].map((w) => Number(w)),
            }
          : null,
      };
    },
  });
}
