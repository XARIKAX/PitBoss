'use client';

import { useAccount, usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { formatEther, parseAbiItem, type Address } from 'viem';
import { PageHeader, Section, EmptyState, Stat } from '@/components/ui';
import { ChainGuard } from '@/components/ChainGuard';
import { ABIS, readMany, useContracts, useRead } from '@/lib/contracts';
import { useTx } from '@/lib/useTx';
import { isDeployed, PLACEHOLDER } from '@/lib/deployments';
import { fmtUnits, shortAddr } from '@/lib/format';
import { explorerTx } from '@/config/chains';

/**
 * Proof of Rewards — a full accounting of what activated Bosses have earned and
 * what is still queued for them, read live from the House Book.
 *
 * ETH moves through three stages, and the page shows all three so a holder can
 * see money that exists but has not reached them yet:
 *
 *   bar    fees collected, not yet cranked (crank splits the pot across Bosses)
 *   owed   credited to Bosses, not yet pulled (deliver sends it to the Boss TBA)
 *   sent   delivered, summed from Delivered events
 *
 * $PITBOSS is tracked separately because it does NOT flow to Bosses today — see
 * the note this page renders. Being explicit about that is the point of a proof
 * page; a dashboard that quietly omitted it would overstate what holders earn.
 */

const SOURCES = [
  { idx: 0, label: 'Pit edge', detail: '2.5% of every machine ticket · 0.5% of every wheel spin' },
  { idx: 1, label: 'Certificate fees', detail: '50% of each certificate fee' },
  { idx: 2, label: 'Launcher fees', detail: '70% of the 1% curve fee' },
  { idx: 3, label: 'Locker fees', detail: 'upfront lock fees + 20% of LP fee income' },
  { idx: 4, label: 'Loan interest', detail: '70% of interest paid' },
  { idx: 5, label: 'AMM fees', detail: 'forwarded vault fees' },
] as const;

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
);

const DELIVERED_EVENT = parseAbiItem(
  'event Delivered(uint256 indexed tokenId, address indexed to, uint256 ethAmount)',
);

/** Lifetime ETH accrued per fee source. */
function useAccruals() {
  const { c, chainId } = useContracts();
  const client = usePublicClient();
  return useQuery({
    queryKey: ['rewardsAccruals', chainId],
    enabled: Boolean(client && isDeployed(c.houseBook.address)),
    refetchInterval: 30_000,
    queryFn: async (): Promise<bigint[]> => {
      const vals = (await readMany(
        client,
        SOURCES.map((s) => ({
          address: c.houseBook.address,
          abi: c.houseBook.abi,
          functionName: 'accruedBySource',
          args: [s.idx] as const,
        })),
      )) as (bigint | null)[];
      return vals.map((v) => v ?? 0n);
    },
  });
}

/** Everything already delivered to Boss token-bound accounts. */
function useDelivered() {
  const { c, chainId } = useContracts();
  const client = usePublicClient();
  return useQuery({
    queryKey: ['rewardsDelivered', chainId],
    enabled: Boolean(client && isDeployed(c.houseBook.address)),
    refetchInterval: 30_000,
    queryFn: async () => {
      const logs = await client!.getLogs({
        address: c.houseBook.address,
        event: DELIVERED_EVENT,
        fromBlock: 0n,
      });
      let total = 0n;
      for (const l of logs) total += (l.args.ethAmount as bigint | undefined) ?? 0n;
      const recent = logs
        .slice(-12)
        .reverse()
        .map((l) => ({
          tokenId: (l.args.tokenId as bigint | undefined) ?? 0n,
          to: (l.args.to as Address | undefined) ?? PLACEHOLDER,
          amount: (l.args.ethAmount as bigint | undefined) ?? 0n,
          hash: l.transactionHash,
        }));
      return { total, count: logs.length, recent };
    },
  });
}

/** The connected wallet's Bosses and what each is owed right now. */
function useMyBosses() {
  const { address } = useAccount();
  const { c, chainId } = useContracts();
  const client = usePublicClient();
  return useQuery({
    queryKey: ['rewardsMyBosses', chainId, address ?? '0x0'],
    enabled: Boolean(client && address && isDeployed(c.pitBoss.address)),
    refetchInterval: 30_000,
    queryFn: async () => {
      // PitBoss is not ERC721Enumerable, so follow the same route the certificates
      // and locker pages use: every token that ever arrived here, filtered by who
      // holds it now (transfers out are dropped by the ownerOf check).
      const inbound = await client!.getLogs({
        address: c.pitBoss.address,
        event: TRANSFER_EVENT,
        args: { to: address! },
        fromBlock: 0n,
      });
      const seen = new Set<string>();
      const candidates: bigint[] = [];
      for (const l of inbound) {
        const id = l.args.tokenId as bigint | undefined;
        if (id == null || seen.has(id.toString())) continue;
        seen.add(id.toString());
        candidates.push(id);
      }
      if (candidates.length === 0) return [] as { tokenId: bigint; pending: bigint; activated: boolean }[];

      const owners = (await readMany(
        client,
        candidates.map((id) => ({
          address: c.pitBoss.address,
          abi: c.pitBoss.abi,
          functionName: 'ownerOf',
          args: [id] as const,
        })),
      )) as (Address | null)[];
      const owned = candidates.filter(
        (_, i) => owners[i]?.toLowerCase() === address!.toLowerCase(),
      );
      if (owned.length === 0) return [] as { tokenId: bigint; pending: bigint; activated: boolean }[];

      const [pendings, activations] = await Promise.all([
        readMany(
          client,
          owned.map((id) => ({
            address: c.houseBook.address,
            abi: c.houseBook.abi,
            functionName: 'pendingOf',
            args: [id] as const,
          })),
        ) as Promise<(bigint | null)[]>,
        readMany(
          client,
          owned.map((id) => ({
            address: c.activationManager.address,
            abi: c.activationManager.abi,
            functionName: 'isActivated',
            args: [id] as const,
          })),
        ) as Promise<(boolean | null)[]>,
      ]);

      return owned.map((id, i) => ({
        tokenId: id,
        pending: pendings[i] ?? 0n,
        activated: activations[i] ?? false,
      }));
    },
  });
}

export default function RewardsPage() {
  const { c, chainId } = useContracts();
  const { isConnected } = useAccount();
  const { send, busy } = useTx();

  const accruals = useAccruals();
  const delivered = useDelivered();
  const mine = useMyBosses();

  const bar = useRead<bigint>({ contract: c.houseBook, functionName: 'bar', refetchInterval: 15_000 });
  const owed = useRead<bigint>({ contract: c.houseBook, functionName: 'owed', refetchInterval: 15_000 });
  const threshold = useRead<bigint>({ contract: c.houseBook, functionName: 'crankThreshold' });
  const weight = useRead<bigint>({ contract: c.houseBook, functionName: 'bookTotalWeight', refetchInterval: 30_000 });

  const lifetime = (accruals.data ?? []).reduce((a, b) => a + b, 0n);
  const sent = delivered.data?.total ?? 0n;
  const pendingTotal = (bar.data ?? 0n) + (owed.data ?? 0n);
  const barPct =
    bar.data != null && threshold.data != null && threshold.data > 0n
      ? Math.min(100, Number((bar.data * 100n) / threshold.data))
      : 0;

  // PLACEHOLDER until the treasury is deployed and added to deployments.<chain>.json,
  // so this section reports the real routing rather than asserting a state.
  const treasuryAddr = c.pitTreasury.address;
  const treasuryLive = isDeployed(treasuryAddr);
  const treasuryPit = useRead<bigint>({
    contract: { address: c.pit.address, abi: c.pit.abi },
    functionName: 'balanceOf',
    args: treasuryLive ? [treasuryAddr] : undefined,
    enabled: treasuryLive,
    refetchInterval: 30_000,
  });

  const myPending = (mine.data ?? []).reduce((a, b) => a + b.pending, 0n);
  const myActive = (mine.data ?? []).filter((b) => b.activated);

  return (
    <ChainGuard>
      <PageHeader
        eyebrow="Proof of Rewards"
        title="Every fee,"
        emphasis="accounted for."
        lede="What the protocol has collected for activated Bosses, what has already reached them, and what is still queued. Read live from the House Book — no off-chain bookkeeping."
      />

      <Section label="Totals" title="The" emphasis="ledger.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Collected all time" value={`Ξ${fmtUnits(lifetime)}`} sub="every fee source" />
          <Stat label="Delivered to Bosses" value={`Ξ${fmtUnits(sent)}`} sub={`${delivered.data?.count ?? 0} payouts`} />
          <Stat label="Queued for Bosses" value={`Ξ${fmtUnits(pendingTotal)}`} sub="in the bar + credited" />
          <Stat
            label="Boss weight"
            value={weight.data != null ? fmtUnits(weight.data) : '…'}
            sub="total floor weight sharing the pot"
          />
        </div>

        {/* The two-stage pipeline is where "collected but not received" lives. */}
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="card">
            <div className="flex items-baseline justify-between">
              <p className="eyebrow">Stage 1 · in the bar</p>
              <p className="num text-lg text-lime">Ξ{bar.data != null ? fmtUnits(bar.data) : '…'}</p>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/60">
              <div
                className="h-full bg-gradient-to-r from-lime to-gold transition-all duration-700"
                style={{ width: `${barPct}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-mute">
              Fees land here first. At Ξ{threshold.data != null ? fmtUnits(threshold.data) : '…'} anyone
              can crank, which splits the pot across every activated Boss by floor weight.
            </p>
          </div>

          <div className="card">
            <div className="flex items-baseline justify-between">
              <p className="eyebrow">Stage 2 · credited, unclaimed</p>
              <p className="num text-lg text-lime">Ξ{owed.data != null ? fmtUnits(owed.data) : '…'}</p>
            </div>
            <p className="mt-3 text-xs text-mute">
              Already assigned to specific Bosses. It moves to the Boss&apos;s token-bound
              account when someone calls deliver — the Boss owner, or anyone on their behalf.
            </p>
          </div>
        </div>
      </Section>

      <Section label="Sources" title="Where it" emphasis="comes from.">
        {accruals.isLoading ? (
          <p className="data text-sm text-mute">Reading the book…</p>
        ) : (
          <div className="grid gap-2">
            {SOURCES.map((s, i) => {
              const v = accruals.data?.[i] ?? 0n;
              const pct = lifetime > 0n ? Number((v * 1000n) / lifetime) / 10 : 0;
              return (
                <div key={s.idx} className="card flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-[220px]">
                    <p className="data text-sm">{s.label}</p>
                    <p className="mt-0.5 text-xs text-mute">{s.detail}</p>
                  </div>
                  <div className="flex flex-1 items-center gap-3">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-black/60">
                      <div className="h-full bg-lime/70" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="num w-32 text-right text-sm">Ξ{fmtUnits(v)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section label="Your bosses" title="Your" emphasis="cut.">
        {!isConnected ? (
          <EmptyState title="Connect to see your rewards" hint="Pending ETH is tracked per Boss." />
        ) : mine.isLoading ? (
          <p className="data text-sm text-mute">Reading your Bosses…</p>
        ) : (mine.data ?? []).length === 0 ? (
          <EmptyState title="No Bosses in this wallet" hint="Activated Bosses earn a share of every fee above." />
        ) : (
          <>
            <div className="mb-3 grid gap-3 sm:grid-cols-3">
              <Stat label="Your pending" value={`Ξ${fmtUnits(myPending)}`} sub="claimable now" />
              <Stat label="Bosses held" value={String((mine.data ?? []).length)} />
              <Stat label="Activated" value={`${myActive.length}`} sub="only these earn" />
            </div>
            <div className="grid gap-2">
              {(mine.data ?? []).map((b) => (
                <div key={b.tokenId.toString()} className="card flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/bosses/${b.tokenId.toString()}.png`}
                      alt={`PitBoss #${b.tokenId.toString()}`}
                      width={36}
                      height={36}
                      className="h-9 w-9 rounded-lg border border-line [image-rendering:pixelated]"
                    />
                    <div>
                      <p className="data text-sm">Boss #{b.tokenId.toString()}</p>
                      <p className={`mt-0.5 text-xs ${b.activated ? 'text-lime' : 'text-mute'}`}>
                        {b.activated ? 'activated · earning' : 'not activated · earns nothing'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="num text-sm">Ξ{fmtUnits(b.pending)}</p>
                    <button
                      onClick={() =>
                        send(
                          {
                            address: c.houseBook.address,
                            abi: c.houseBook.abi,
                            functionName: 'deliver',
                            args: [b.tokenId],
                          },
                          { title: `Deliver Boss #${b.tokenId.toString()}` },
                        )
                      }
                      disabled={busy || b.pending === 0n}
                      className="pill-lime disabled:opacity-50"
                    >
                      Deliver
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Section>

      <Section label="$PITBOSS" title="Token" emphasis="rewards.">
        {/* Read the live routing rather than asserting a state. Until the treasury
            is deployed and ActivationManager is repointed at it, activation revenue
            still lands somewhere it cannot leave — so say which is true right now. */}
        {treasuryLive ? (
          <>
            <div className="mb-3 grid gap-3 sm:grid-cols-3">
              <Stat
                label="Awaiting conversion"
                value={treasuryPit.data != null ? fmtUnits(treasuryPit.data) : '…'}
                sub="$PITBOSS held by the treasury"
              />
              <Stat label="Burned per activation" value="444,444" sub="half of every fee, forever" />
              <Stat label="To Bosses per activation" value="444,444" sub="converted to ETH rewards" />
            </div>
            <div className="card">
              <p className="data text-sm text-lime">$PITBOSS revenue reaches Bosses as ETH.</p>
              <p className="mt-2 text-xs text-mute">
                Half of every 888,888 activation fee is burned outright. The other half is routed
                to the treasury, which sells it and pays the proceeds into the House Book — where
                it is distributed to activated Bosses through the same crank and deliver path as
                every other fee. PIT wagers on the Pit tables are separate: they burn the house
                edge and convert the rest to bankroll stock, growing the prize pool rather than
                paying Bosses.
              </p>
              <p className="mt-2 text-xs text-dim">
                Treasury {shortAddr(treasuryAddr)} · anyone can call convert() to push the
                accumulated balance through.
              </p>
            </div>
          </>
        ) : (
          <div className="card border-amber-400/30">
            <p className="data text-sm text-amber-200">
              $PITBOSS revenue is not reaching Bosses yet.
            </p>
            <p className="mt-2 text-xs text-mute">
              Half of every 888,888 activation fee is burned. The other half is currently sent to
              the House Book, which has no function that can move an ERC-20, so it accumulates
              there untouched. The treasury that converts it into ETH rewards is built but not yet
              deployed; once it is, this section switches over automatically and Bosses start
              earning on activations. Fee revenue today is ETH only, from the sources above.
            </p>
          </div>
        )}
      </Section>

      <Section label="History" title="Recent" emphasis="payouts.">
        {delivered.isLoading ? (
          <p className="data text-sm text-mute">Scanning deliveries…</p>
        ) : (delivered.data?.recent ?? []).length === 0 ? (
          <EmptyState
            title="No deliveries yet"
            hint="Once the bar is cranked and a Boss pulls its credit, every payout is listed here."
          />
        ) : (
          <div className="grid gap-2">
            {(delivered.data?.recent ?? []).map((d, i) => (
              <a
                key={`${d.hash}-${i}`}
                href={explorerTx(chainId, d.hash)}
                target="_blank"
                rel="noreferrer"
                className="card flex items-center justify-between gap-3 transition hover:border-lime/40"
              >
                <p className="data text-sm">Boss #{d.tokenId.toString()}</p>
                <p className="text-xs text-mute">{shortAddr(d.to)}</p>
                <p className="num text-sm text-lime">Ξ{fmtUnits(d.amount)}</p>
              </a>
            ))}
          </div>
        )}
      </Section>
    </ChainGuard>
  );
}
