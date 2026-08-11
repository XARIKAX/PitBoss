'use client';

/**
 * Live protocol trackers — activated Bosses and $PITBOSS burned.
 *
 * Everything here is read straight off the chain, no cached or seeded values:
 *  - activated: isActivated(1..888) batched through multicall
 *  - burned:    $PITBOSS balanceOf(0x…dEaD), the burn sink ActivationManager uses
 *  - book:      HouseBook.bar(), ETH waiting for the next crank
 *
 * Renders "—" until a real value arrives; it never shows a placeholder number.
 */
import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { formatEther } from 'viem';
import { readMany, safeRead, useContracts, useRead } from '@/lib/contracts';
import { isDeployed } from '@/lib/deployments';

const DEAD = '0x000000000000000000000000000000000000dEaD' as const;
const SUPPLY = 1_000_000_000; // $PITBOSS total supply

/** Count activated Bosses by reading isActivated for every minted id. */
function useActivatedCount(minted: number | null) {
  const { c, chainId } = useContracts();
  const client = usePublicClient();
  return useQuery({
    queryKey: ['activatedCount', chainId, minted],
    enabled: Boolean(client && minted && isDeployed(c.activationManager.address)),
    refetchInterval: 60_000,
    queryFn: async (): Promise<number> => {
      const ids = Array.from({ length: minted ?? 0 }, (_, i) => BigInt(i + 1));
      const res = await readMany(
        client,
        ids.map((id) => ({
          address: c.activationManager.address,
          abi: c.activationManager.abi,
          functionName: 'isActivated',
          args: [id] as const,
        })),
      );
      return res.filter((r) => r === true).length;
    },
  });
}

/** $PITBOSS sitting at the dead address = burned forever. */
function useBurned() {
  const { c, chainId } = useContracts();
  const client = usePublicClient();
  return useQuery({
    queryKey: ['burned', chainId],
    enabled: Boolean(client && isDeployed(c.pit.address)),
    refetchInterval: 60_000,
    queryFn: async (): Promise<bigint | null> =>
      (await safeRead(client, c.pit, 'balanceOf', [DEAD])) as bigint | null,
  });
}

function Tile({
  label,
  value,
  sub,
  pct,
}: {
  label: string;
  value: string;
  sub: string;
  pct?: number;
}) {
  return (
    <div className="panel-raised px-4 py-3.5">
      <p className="label">{label}</p>
      <p className="num mt-1 font-mono text-[22px] font-semibold text-lime">{value}</p>
      {pct != null ? (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-line2">
          <div
            className="h-full rounded-full bg-gradient-to-r from-lime to-gold transition-[width] duration-700"
            style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
          />
        </div>
      ) : null}
      <p className="mt-1.5 text-[11px] text-mute">{sub}</p>
    </div>
  );
}

const compact = (n: number) =>
  n >= 1e9
    ? `${(n / 1e9).toFixed(2)}B`
    : n >= 1e6
      ? `${(n / 1e6).toFixed(2)}M`
      : n >= 1e3
        ? `${(n / 1e3).toFixed(1)}K`
        : n.toFixed(0);

export function LiveStats() {
  const { c } = useContracts();

  const minted = useRead<bigint>({
    contract: c.pitBoss,
    functionName: 'totalMinted',
    refetchInterval: 60_000,
  });
  const maxSupply = useRead<bigint>({ contract: c.pitBoss, functionName: 'MAX_SUPPLY' });
  const bar = useRead<bigint>({
    contract: c.houseBook,
    functionName: 'bar',
    refetchInterval: 30_000,
  });

  const mintedNum = minted.data != null ? Number(minted.data) : null;
  const activated = useActivatedCount(mintedNum);
  const burned = useBurned();

  const cap = maxSupply.data != null ? Number(maxSupply.data) : 888;
  const activePct = activated.data != null ? (activated.data / cap) * 100 : undefined;

  const burnedTokens = burned.data != null ? Number(formatEther(burned.data)) : null;
  const burnedPct = burnedTokens != null ? (burnedTokens / SUPPLY) * 100 : undefined;

  return (
    <div className="grid content-start gap-3 sm:grid-cols-2">
      <Tile
        label="Bosses activated"
        value={activated.data != null ? `${activated.data} / ${cap}` : '—'}
        sub={activePct != null ? `${activePct.toFixed(1)}% of the floor on the payroll` : 'reading chain…'}
        pct={activePct}
      />
      <Tile
        label="$PITBOSS burned"
        value={burnedTokens != null ? compact(burnedTokens) : '—'}
        sub={burnedPct != null ? `${burnedPct.toFixed(3)}% of supply, gone forever` : 'reading chain…'}
        pct={burnedPct != null ? Math.min(burnedPct * 10, 100) : undefined}
      />
      <Tile
        label="House Book"
        value={bar.data != null ? `Ξ${Number(formatEther(bar.data)).toFixed(4)}` : '—'}
        sub="waiting for the next crank"
      />
      <Tile
        label="Bosses minted"
        value={minted.data != null ? `${minted.data.toString()} / ${cap}` : '—'}
        sub="fixed supply, sold out"
      />
    </div>
  );
}
