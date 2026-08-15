'use client';

/**
 * Top Earners — per-Boss reward leaderboard, read straight off the chain.
 *
 * Lifetime = Σ Delivered(tokenId, …) events from the House Book, exact to the
 * wei regardless of whether the holder took ETH or elected stock (the event
 * carries the ETH amount before any swap). Pending = pendingOf(tokenId), what
 * the Boss has accrued in the book but not yet pulled. Weight comes from
 * FloorPosition and explains the spread: an active Boss climbs toward the
 * 3.33x front-row cap, an idle one decays back toward 1x.
 *
 * Nothing here is seeded; an empty board just means the first crank hasn't
 * written it yet.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { formatEther, parseAbiItem } from 'viem';
import { readMany, useContracts } from '@/lib/contracts';
import { isDeployed } from '@/lib/deployments';

const OPENSEA_COLLECTION = 'https://opensea.io/collection/pitbosses';
const BOARD_SIZE = 10;

const DELIVERED_EVENT = parseAbiItem(
  'event Delivered(uint256 indexed tokenId, address indexed to, uint256 ethAmount)',
);

type Row = {
  tokenId: number;
  lifetime: bigint;
  pending: bigint;
  activated: boolean;
  /** 1e18-scaled FloorPosition weight; 0 while dormant. */
  weight: bigint;
};

function useTopEarners() {
  const { c, chainId } = useContracts();
  const client = usePublicClient();

  return useQuery({
    queryKey: ['topEarners', chainId],
    enabled: Boolean(
      client && isDeployed(c.houseBook.address) && isDeployed(c.pitBoss.address),
    ),
    refetchInterval: 60_000,
    queryFn: async (): Promise<Row[]> => {
      const minted = Number(
        ((await readMany(client, [
          { address: c.pitBoss.address, abi: c.pitBoss.abi, functionName: 'totalMinted' },
        ])) as (bigint | null)[])[0] ?? 0n,
      );
      if (minted === 0) return [];
      const ids = Array.from({ length: minted }, (_, i) => i + 1);

      // Lifetime per Boss, from the event log.
      const logs = await client!.getLogs({
        address: c.houseBook.address,
        event: DELIVERED_EVENT,
        fromBlock: 0n,
      });
      const lifetime = new Map<number, bigint>();
      for (const l of logs) {
        const id = Number((l.args.tokenId as bigint | undefined) ?? 0n);
        lifetime.set(id, (lifetime.get(id) ?? 0n) + ((l.args.ethAmount as bigint | undefined) ?? 0n));
      }

      // Pending per Boss, one multicall across the floor.
      const pendings = (await readMany(
        client,
        ids.map((id) => ({
          address: c.houseBook.address,
          abi: c.houseBook.abi,
          functionName: 'pendingOf',
          args: [BigInt(id)] as const,
        })),
      )) as (bigint | null)[];

      // Everyone with anything earned or owed, best first.
      const candidates = ids
        .map((tokenId, i) => ({
          tokenId,
          lifetime: lifetime.get(tokenId) ?? 0n,
          pending: pendings[i] ?? 0n,
        }))
        .filter((r) => r.lifetime > 0n || r.pending > 0n)
        .sort((a, b) => (b.lifetime + b.pending > a.lifetime + a.pending ? 1 : -1))
        .slice(0, BOARD_SIZE * 2); // enough for either sort order

      if (candidates.length === 0) return [];

      // Status + weight only for the board, not all 888.
      const extras = (await readMany(client, [
        ...candidates.map((r) => ({
          address: c.activationManager.address,
          abi: c.activationManager.abi,
          functionName: 'isActivated',
          args: [BigInt(r.tokenId)] as const,
        })),
        ...candidates.map((r) => ({
          address: c.floorPosition.address,
          abi: c.floorPosition.abi,
          functionName: 'weightOf',
          args: [BigInt(r.tokenId)] as const,
        })),
      ])) as (unknown | null)[];

      return candidates.map((r, i) => ({
        ...r,
        activated: extras[i] === true,
        weight: (extras[candidates.length + i] as bigint | null) ?? 0n,
      }));
    },
  });
}

/** Tiny amounts early on — show enough digits that a real value never reads 0. */
function fmtEth(v: bigint): string {
  const n = Number(formatEther(v));
  if (n === 0) return '0';
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(8).replace(/0+$/, '');
}

function fmtWeight(w: bigint): string {
  return `${(Number(formatEther(w)) || 0).toFixed(2)}x`;
}

export function TopEarners() {
  const { data, isLoading } = useTopEarners();
  const [by, setBy] = useState<'lifetime' | 'pending'>('lifetime');

  const rows = [...(data ?? [])]
    .sort((a, b) => (b[by] > a[by] ? 1 : b[by] < a[by] ? -1 : 0))
    .slice(0, BOARD_SIZE);

  return (
    <div className="dashed relative overflow-hidden bg-lime/[0.03] p-6 sm:p-8">
      <span
        aria-hidden
        className="pointer-events-none absolute -top-24 right-0 h-[300px] w-[520px] rounded-full bg-gold/[0.05] blur-3xl"
      />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="label">
            Every figure below is a{' '}
            <span className="text-mute">Delivered event or pendingOf() read</span> — verify any
            row yourself
          </p>
          <div className="flex gap-1.5">
            {(['lifetime', 'pending'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setBy(k)}
                className={`rounded-[5px] border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] transition ${
                  by === k
                    ? 'border-lime/60 bg-lime/10 text-lime'
                    : 'border-line text-mute hover:text-paper'
                }`}
              >
                {k === 'lifetime' ? 'Lifetime' : 'Pending'}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <p className="data mt-6 text-sm text-mute">Reading the event log…</p>
        ) : rows.length === 0 ? (
          <div className="mt-6 py-10 text-center">
            <p className="headline text-h2">The first crank writes this board.</p>
            <p className="mx-auto mt-3 max-w-md text-[13px] text-mute">
              The moment the House Book distributes, every payout lands here — ranked, per
              Boss, straight from the event log.
            </p>
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="border-b border-line/60">
                  {['Rank', 'Boss', 'Status', 'Weight', 'Pending Ξ', 'Lifetime Ξ', ''].map(
                    (h) => (
                      <th key={h} className="label pb-3 pr-4 text-left font-normal">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.tokenId}
                    className="border-b border-line/40 transition hover:bg-lime/[0.04]"
                  >
                    <td className="py-3 pr-4">
                      <span
                        className={`num font-mono text-[15px] font-bold tabular-nums ${
                          i === 0 ? 'text-gold' : i < 3 ? 'text-lime' : 'text-mute'
                        }`}
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/bosses/${r.tokenId}.png`}
                          alt={`PitBoss #${r.tokenId}`}
                          width={36}
                          height={36}
                          className="h-9 w-9 rounded-[5px] border border-line [image-rendering:pixelated]"
                          loading="lazy"
                        />
                        <span className="num font-mono text-[13.5px] font-semibold text-paper">
                          #{r.tokenId}
                        </span>
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      {r.activated ? (
                        <span className="chip chip-lime">
                          <span className="h-1.5 w-1.5 animate-dot rounded-full bg-acid" />
                          active
                        </span>
                      ) : (
                        <span className="chip border-line text-dim">dormant</span>
                      )}
                    </td>
                    <td className="num py-3 pr-4 font-mono text-[13px] tabular-nums text-mute">
                      {r.activated ? fmtWeight(r.weight) : '—'}
                    </td>
                    <td className="num py-3 pr-4 font-mono text-[13px] tabular-nums text-paper">
                      {fmtEth(r.pending)}
                    </td>
                    <td className="num py-3 pr-4 font-mono text-[13px] font-semibold tabular-nums text-lime">
                      {fmtEth(r.lifetime)}
                    </td>
                    <td className="py-3 text-right">
                      <a
                        href={`${OPENSEA_COLLECTION}/${r.tokenId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[11.5px] uppercase tracking-[0.1em] text-gold hover:underline"
                      >
                        OpenSea →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-[11.5px] leading-relaxed text-dim">
          Why the spread: payouts are pro rata by floor weight. Every activated Boss starts at
          1.00x and climbs toward the 3.33x cap by staying active, staking bankrolls and
          playing the floor — go idle and it decays back. Same collection, different effort.
        </p>
      </div>
    </div>
  );
}
