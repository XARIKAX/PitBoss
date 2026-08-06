'use client';

import { useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { formatEther, parseAbiItem } from 'viem';
import { PageHeader, Section, EmptyState } from '@/components/ui';
import { ChainGuard } from '@/components/ChainGuard';
import { readMany, useContracts, useRead } from '@/lib/contracts';
import { useTx } from '@/lib/useTx';
import { isDeployed } from '@/lib/deployments';
import { shortAddr } from '@/lib/format';

/**
 * The Locker — LP position locks.
 * - My locks (Locked events -> ownerOf filter), with per-lock details,
 *   vested liquidity, and collect / withdraw-vested / release actions.
 * - Manual lock-id lookup + the same actions for any entered id.
 * - The lock wizard stays informational: locking requires approving the
 *   Uniswap position manager NFT to the locker first, which is done from the
 *   position manager itself.
 */
const LOCK_KINDS = [
  { id: 'hard', label: 'Hard lock', desc: 'Locked solid until the unlock date. No early exit.' },
  { id: 'vest', label: 'Linear vest', desc: 'Unlocks continuously over the vesting window.' },
  { id: 'perm', label: 'Permanent', desc: 'Burn the key. Liquidity locked forever.' },
] as const;

const STYLE_LABEL = ['hard lock', 'linear vest', 'permanent'] as const;

const LOCKED_EVENT = parseAbiItem(
  'event Locked(uint256 indexed lockId, address indexed owner, uint256 positionId, uint8 style, uint8 feeMode, uint64 unlockTime)',
);

type LockRow = {
  lockId: bigint;
  positionManager: string | null;
  positionId: bigint;
  style: number;
  start: bigint;
  unlockTime: bigint;
  initialLiquidity: bigint;
  withdrawnLiquidity: bigint;
  vested: bigint | null;
};

function useMyLocks() {
  const { address } = useAccount();
  const { c, chainId } = useContracts();
  const client = usePublicClient();
  return useQuery({
    queryKey: ['myLocks', chainId, address ?? '0x0'],
    enabled: Boolean(client && address && isDeployed(c.locker.address)),
    refetchInterval: 30_000,
    queryFn: async (): Promise<LockRow[]> => {
      const logs = await client!.getLogs({
        address: c.locker.address,
        event: LOCKED_EVENT,
        args: { owner: address! },
        fromBlock: 0n,
      });
      const ids = Array.from(
        new Set(logs.map((l) => l.args.lockId).filter((x): x is bigint => x != null)),
      );
      if (ids.length === 0) return [];
      // Lock NFTs are transferable — keep only the ones still owned by me.
      const owners = await readMany(
        client,
        ids.map((id) => ({
          address: c.locker.address,
          abi: c.locker.abi,
          functionName: 'ownerOf',
          args: [id] as const,
        })),
      );
      const me = address!.toLowerCase();
      const mine = ids.filter(
        (_, i) => typeof owners[i] === 'string' && (owners[i] as string).toLowerCase() === me,
      );
      const [details, vested] = await Promise.all([
        readMany(
          client,
          mine.map((id) => ({
            address: c.locker.address,
            abi: c.locker.abi,
            functionName: 'locks',
            args: [id] as const,
          })),
        ),
        readMany(
          client,
          mine.map((id) => ({
            address: c.locker.address,
            abi: c.locker.abi,
            functionName: 'vestedLiquidity',
            args: [id] as const,
          })),
        ),
      ]);
      return mine.map((lockId, i) => {
        const s = details[i] as readonly unknown[] | null;
        return {
          lockId,
          positionManager: (s?.[0] as string | undefined) ?? null,
          positionId: (s?.[1] as bigint | undefined) ?? 0n,
          style: Number((s?.[2] as number | bigint | undefined) ?? 0),
          start: BigInt((s?.[4] as bigint | number | undefined) ?? 0),
          unlockTime: BigInt((s?.[5] as bigint | number | undefined) ?? 0),
          initialLiquidity: BigInt((s?.[6] as bigint | number | undefined) ?? 0),
          withdrawnLiquidity: BigInt((s?.[7] as bigint | number | undefined) ?? 0),
          vested: (vested[i] as bigint | null) ?? null,
        };
      });
    },
  });
}

export default function LockerPage() {
  const { isConnected } = useAccount();
  const { c } = useContracts();
  const [kind, setKind] = useState<(typeof LOCK_KINDS)[number]['id']>('hard');
  const lockerLive = isDeployed(c.locker.address);

  const upfrontFee = useRead<bigint>({ contract: c.locker, functionName: 'upfrontFee' });
  const feeShare = useRead<number>({ contract: c.locker, functionName: 'FEE_SHARE_BPS' });

  const locks = useMyLocks();

  return (
    <ChainGuard>
      <PageHeader
        eyebrow="The Locker"
        title="Lock it up."
        emphasis="Proof, not promises."
        lede="Hard lock, linear vest, or burn the key. Collect fees while it sits. The lock is onchain and anyone can verify it."
      />

      <Section label="Lock wizard" title="Choose your" emphasis="lock.">
        <div className="grid gap-3 sm:grid-cols-3">
          {LOCK_KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => setKind(k.id)}
              className={`card text-left transition-colors ${kind === k.id ? 'border-lime' : 'hover:border-lime/40'}`}
            >
              <p className="headline text-[14px]">{k.label}</p>
              <p className="mt-2 text-sm text-mute">{k.desc}</p>
            </button>
          ))}
        </div>

        <div className="card mt-4">
          {!lockerLive ? (
            <EmptyState
              title="Not deployed"
              hint="The LiquidityLocker has no address on this chain yet."
            />
          ) : (
            <>
              <p className="max-w-prose text-sm text-mute">
                Locking a{' '}
                <span className="text-paper">
                  {LOCK_KINDS.find((k) => k.id === kind)?.label.toLowerCase()}
                </span>{' '}
                takes two steps from your LP wallet: approve the position NFT to the locker on the
                position manager, then call{' '}
                <span className="data">lock(positionManager, positionId, style, feeMode, duration)</span>{' '}
                with the upfront fee attached. Once sealed, manage it below.
              </p>
              <div className="data mt-4 flex flex-wrap gap-4 text-xs text-mute">
                <span>
                  upfront fee{' '}
                  <span className="text-lime">
                    {upfrontFee.data != null ? `Ξ${formatEther(upfrontFee.data)}` : '…'}
                  </span>
                </span>
                <span>
                  protocol fee share{' '}
                  <span className="text-lime">
                    {feeShare.data != null ? `${(feeShare.data / 100).toFixed(2)}%` : '…'}
                  </span>
                </span>
              </div>
            </>
          )}
        </div>
      </Section>

      <Section label="My locks" title="What's" emphasis="sealed.">
        {!isConnected ? (
          <EmptyState
            title="Connect to see your locks"
            hint="Your active locks, their kind, unlock schedule and claimable fees show here."
          />
        ) : !lockerLive ? (
          <EmptyState
            title="Not deployed"
            hint="The LiquidityLocker has no address on this chain yet."
          />
        ) : locks.isLoading ? (
          <p className="data text-sm text-mute">Scanning locks…</p>
        ) : !locks.data || locks.data.length === 0 ? (
          <EmptyState
            title="No locks yet"
            hint="Locks you create (or receive — the lock itself is an NFT) show here with collect, vest-withdraw and release controls."
          />
        ) : (
          <div className="grid gap-3">
            {locks.data.map((l) => (
              <LockCard key={l.lockId.toString()} lock={l} />
            ))}
          </div>
        )}
      </Section>

      <Section label="Manage" title="By lock" emphasis="id.">
        <ManageByIdCard />
      </Section>
    </ChainGuard>
  );
}

function LockActions({ lockId, style }: { lockId: bigint; style?: number }) {
  const { c } = useContracts();
  const { send, busy } = useTx();
  const call = (functionName: string, title: string) =>
    send(
      { address: c.locker.address, abi: c.locker.abi, functionName, args: [lockId] },
      { title },
    );
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => call('collectFees', `Collect fees #${lockId.toString()}`)}
        disabled={busy}
        className="pill-lime disabled:opacity-50"
      >
        Collect fees
      </button>
      {style === 1 ? (
        <button
          onClick={() => call('withdrawVested', `Withdraw vested #${lockId.toString()}`)}
          disabled={busy}
          className="pill-ghost disabled:opacity-50"
        >
          Withdraw vested
        </button>
      ) : null}
      <button
        onClick={() => call('release', `Release #${lockId.toString()}`)}
        disabled={busy}
        className="pill-ghost disabled:opacity-50"
      >
        Release
      </button>
    </div>
  );
}

function LockCard({ lock }: { lock: LockRow }) {
  const unlockDate =
    lock.unlockTime > 0n ? new Date(Number(lock.unlockTime) * 1000).toLocaleDateString() : '—';
  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="data text-sm">
            Lock #{lock.lockId.toString()} · position #{lock.positionId.toString()} ·{' '}
            {STYLE_LABEL[lock.style] ?? `style ${lock.style}`}
          </p>
          <p className="mt-1 text-xs text-mute">
            manager {shortAddr(lock.positionManager ?? undefined)} · unlocks {unlockDate}
          </p>
          <p className="data mt-1 text-xs text-mute">
            liquidity {lock.initialLiquidity.toString()} · withdrawn{' '}
            {lock.withdrawnLiquidity.toString()}
            {lock.vested != null ? ` · vested ${lock.vested.toString()}` : ''}
          </p>
        </div>
        <LockActions lockId={lock.lockId} style={lock.style} />
      </div>
    </div>
  );
}

function ManageByIdCard() {
  const { isConnected } = useAccount();
  const { c } = useContracts();
  const [id, setId] = useState('');
  const idOk = /^\d+$/.test(id.trim());
  const lockId = idOk ? BigInt(id.trim()) : null;

  const details = useRead<readonly unknown[]>({
    contract: c.locker,
    functionName: 'locks',
    args: lockId != null ? [lockId] : undefined,
    enabled: lockId != null,
  });
  const vested = useRead<bigint>({
    contract: c.locker,
    functionName: 'vestedLiquidity',
    args: lockId != null ? [lockId] : undefined,
    enabled: lockId != null,
  });

  const s = details.data;
  const style = s ? Number((s[2] as number | bigint | undefined) ?? 0) : null;

  return (
    <div className="card">
      <p className="max-w-prose text-sm text-mute">
        Enter any lock id to inspect it and run its actions. Locked LP still earns trading fees —
        collect them any time without touching the principal.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="Lock id"
          inputMode="numeric"
          className="data rounded-xl border border-line bg-black/40 px-4 py-3 text-sm"
        />
        {isConnected && lockId != null && isDeployed(c.locker.address) ? (
          <LockActions lockId={lockId} style={style ?? undefined} />
        ) : null}
      </div>
      {s ? (
        <div className="data mt-4 space-y-1 rounded-xl border border-line bg-black/40 p-4 text-xs">
          <p>position manager {shortAddr((s[0] as string | undefined) ?? undefined)}</p>
          <p>position #{((s[1] as bigint | undefined) ?? 0n).toString()}</p>
          <p>style {style != null ? (STYLE_LABEL[style] ?? style) : '—'}</p>
          <p>
            unlocks{' '}
            {s[5] != null && BigInt(s[5] as number | bigint) > 0n
              ? new Date(Number(s[5]) * 1000).toLocaleString()
              : '—'}
          </p>
          <p>initial liquidity {((s[6] as bigint | undefined) ?? 0n).toString()}</p>
          <p>withdrawn {((s[7] as bigint | undefined) ?? 0n).toString()}</p>
          <p>vested {vested.data != null ? vested.data.toString() : '—'}</p>
        </div>
      ) : null}
    </div>
  );
}
