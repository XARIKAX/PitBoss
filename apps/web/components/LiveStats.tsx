'use client';

/**
 * Live protocol trackers — activation and burn, read straight off the chain.
 *
 *   useFloorStats()  shared hook: per-token activation flags, burn, book, supply
 *   <LiveStats />    compact four-tile rail (home hero)
 *   <TrackerBoard /> the showcase board (/stats): census grid, burn odometer
 *
 * Sources, all on-chain, nothing cached or seeded:
 *   activated — isActivated(1..totalMinted), batched via multicall (exact count)
 *   burned    — $PITBOSS balanceOf(0x…dEaD), the sink ActivationManager writes to
 *   book      — HouseBook.bar(), ETH waiting for the next crank
 */
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { formatEther } from 'viem';
import { readMany, safeRead, useContracts, useRead } from '@/lib/contracts';
import { isDeployed } from '@/lib/deployments';

const DEAD = '0x000000000000000000000000000000000000dEaD' as const;
const SUPPLY = 1_000_000_000; // $PITBOSS total supply
const BURN_PER_ACTIVATION = 444_444;

/* ------------------------------------------------------------------ data -- */

export function useFloorStats() {
  const { c, chainId } = useContracts();
  const client = usePublicClient();

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

  /** Per-token activation flags — powers both the count and the census grid. */
  const flags = useQuery({
    queryKey: ['activationFlags', chainId, mintedNum],
    enabled: Boolean(client && mintedNum && isDeployed(c.activationManager.address)),
    refetchInterval: 60_000,
    queryFn: async (): Promise<boolean[]> => {
      const ids = Array.from({ length: mintedNum ?? 0 }, (_, i) => BigInt(i + 1));
      const res = await readMany(
        client,
        ids.map((id) => ({
          address: c.activationManager.address,
          abi: c.activationManager.abi,
          functionName: 'isActivated',
          args: [id] as const,
        })),
      );
      return res.map((r) => r === true);
    },
  });

  const burned = useQuery({
    queryKey: ['burned', chainId],
    enabled: Boolean(client && isDeployed(c.pit.address)),
    refetchInterval: 60_000,
    queryFn: async (): Promise<bigint | null> =>
      (await safeRead(client, c.pit, 'balanceOf', [DEAD])) as bigint | null,
  });

  const cap = maxSupply.data != null ? Number(maxSupply.data) : 888;
  const activatedCount = flags.data ? flags.data.filter(Boolean).length : null;
  const burnedTokens = burned.data != null ? Number(formatEther(burned.data)) : null;

  return {
    cap,
    minted: mintedNum,
    flags: flags.data ?? null,
    activatedCount,
    burnedTokens,
    bookEth: bar.data != null ? Number(formatEther(bar.data)) : null,
    loading: flags.isLoading || burned.isLoading,
  };
}

/* ------------------------------------------------------------------- ui --- */

/** Eased count-up. Animates from the previous value whenever the target moves. */
function useCountUp(target: number | null, ms = 1100) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (target == null) return;
    const start = performance.now();
    const a = from.current;
    const b = target;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setV(a + (b - a) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return target == null ? null : v;
}

const groupInt = (n: number) => Math.round(n).toLocaleString('en-US');
const compact = (n: number) =>
  n >= 1e9
    ? `${(n / 1e9).toFixed(2)}B`
    : n >= 1e6
      ? `${(n / 1e6).toFixed(2)}M`
      : n >= 1e3
        ? `${(n / 1e3).toFixed(1)}K`
        : n.toFixed(0);

function LiveDot() {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-acid">
      <span className="h-1.5 w-1.5 animate-dot rounded-full bg-acid" />
      live
    </span>
  );
}

/* --------------------------------------------------------- compact rail --- */

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
      <p className="num mt-1 font-mono text-[22px] font-semibold tabular-nums text-lime">{value}</p>
      {pct != null ? (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-line2">
          <div
            className="h-full rounded-full bg-gradient-to-r from-lime to-gold transition-[width] duration-1000"
            style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
          />
        </div>
      ) : null}
      <p className="mt-1.5 text-[11px] text-mute">{sub}</p>
    </div>
  );
}

export function LiveStats() {
  const s = useFloorStats();
  const activated = useCountUp(s.activatedCount);
  const burned = useCountUp(s.burnedTokens);

  const activePct = s.activatedCount != null ? (s.activatedCount / s.cap) * 100 : undefined;
  const burnPct = s.burnedTokens != null ? (s.burnedTokens / SUPPLY) * 100 : undefined;

  return (
    <div className="grid content-start gap-3 sm:grid-cols-2">
      <Tile
        label="Bosses activated"
        value={activated != null ? `${Math.round(activated)} / ${s.cap}` : '—'}
        sub={activePct != null ? `${activePct.toFixed(1)}% on the payroll` : 'reading chain…'}
        pct={activePct}
      />
      <Tile
        label="$PITBOSS burned"
        value={burned != null ? compact(burned) : '—'}
        sub={burnPct != null ? `${burnPct.toFixed(3)}% of supply, gone` : 'reading chain…'}
        pct={burnPct != null ? Math.min(burnPct * 10, 100) : undefined}
      />
      <Tile
        label="House Book"
        value={s.bookEth != null ? `Ξ${s.bookEth.toFixed(4)}` : '—'}
        sub="waiting for the next crank"
      />
      <Tile
        label="Bosses minted"
        value={s.minted != null ? `${s.minted} / ${s.cap}` : '—'}
        sub="fixed supply, sold out"
      />
    </div>
  );
}

/* ------------------------------------------------------------ the board --- */

/** 888 cells, one per Boss. Lit = on the payroll. A census, not a chart. */
function CensusGrid({ flags, cap }: { flags: boolean[] | null; cap: number }) {
  const cells = Array.from({ length: cap }, (_, i) => flags?.[i] ?? false);
  return (
    <div
      className="grid gap-[3px]"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(9px, 1fr))' }}
      aria-label="Activation census — one cell per Boss"
    >
      {cells.map((on, i) => (
        <span
          key={i}
          title={`Boss #${i + 1}${on ? ' · active' : ''}`}
          className={`aspect-square rounded-[2px] transition-colors duration-500 ${
            on
              ? 'bg-lime shadow-[0_0_8px_rgba(198,255,0,0.65)]'
              : 'bg-paper/[0.055] hover:bg-paper/15'
          }`}
        />
      ))}
    </div>
  );
}

/** Big stat with an oversized numeral and a rule underneath. */
function Hero({
  label,
  value,
  unit,
  foot,
  accent = 'lime',
}: {
  label: string;
  value: string;
  unit?: string;
  foot: React.ReactNode;
  accent?: 'lime' | 'gold';
}) {
  const tone =
    accent === 'gold'
      ? 'text-gold [text-shadow:0_0_22px_rgba(245,200,66,0.35)]'
      : 'text-lime [text-shadow:0_0_22px_rgba(198,255,0,0.4)]';
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="label-lime">{label}</p>
        <LiveDot />
      </div>
      <p className={`num mt-3 font-mono text-[46px] font-bold leading-none tabular-nums sm:text-[64px] ${tone}`}>
        {value}
        {unit ? <span className="ml-2 text-[20px] font-semibold text-mute [text-shadow:none]">{unit}</span> : null}
      </p>
      <div className="mt-4 text-[12.5px] leading-relaxed text-mute">{foot}</div>
    </div>
  );
}

export function TrackerBoard() {
  const s = useFloorStats();
  const activated = useCountUp(s.activatedCount);
  const burned = useCountUp(s.burnedTokens);
  const book = useCountUp(s.bookEth, 900);

  const activePct = s.activatedCount != null ? (s.activatedCount / s.cap) * 100 : null;
  const burnPct = s.burnedTokens != null ? (s.burnedTokens / SUPPLY) * 100 : null;
  const dormant = s.activatedCount != null ? s.cap - s.activatedCount : null;
  // Burn already banked plus what the dormant floor would burn if it switched on.
  const potential = dormant != null ? dormant * BURN_PER_ACTIVATION : null;

  return (
    <div className="space-y-4">
      {/* ── Activation census ── */}
      <div className="dashed relative overflow-hidden bg-lime/[0.03] p-6 sm:p-8">
        <span
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-[320px] w-[680px] -translate-x-1/2 rounded-full bg-lime/[0.07] blur-3xl"
        />
        <div className="relative grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
          <Hero
            label="Bosses activated"
            value={activated != null ? `${Math.round(activated)}` : '—'}
            unit={`/ ${s.cap}`}
            foot={
              <>
                <div className="h-1.5 overflow-hidden rounded-full bg-line2">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-lime to-gold transition-[width] duration-1000"
                    style={{ width: `${activePct ?? 0}%` }}
                  />
                </div>
                <p className="mt-3">
                  {activePct != null ? (
                    <>
                      <span className="font-mono font-semibold text-paper">
                        {activePct.toFixed(1)}%
                      </span>{' '}
                      of the floor is on the payroll.{' '}
                      <span className="font-mono font-semibold text-paper">{dormant}</span> Bosses
                      still dormant, earning nothing.
                    </>
                  ) : (
                    'Reading every token from the chain…'
                  )}
                </p>
              </>
            }
          />
          <div>
            <div className="flex items-center justify-between">
              <p className="label">The floor, one cell per Boss</p>
              <p className="label">
                <span className="mr-1 inline-block h-2 w-2 rounded-[2px] bg-lime align-middle" />
                active
              </p>
            </div>
            <div className="mt-3">
              <CensusGrid flags={s.flags} cap={s.cap} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Burn + book ── */}
      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="panel-raised relative overflow-hidden p-6 sm:p-8">
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-28 -right-16 h-[280px] w-[280px] rounded-full bg-gold/[0.08] blur-3xl"
          />
          <div className="relative">
            <Hero
              label="$PITBOSS burned forever"
              accent="gold"
              value={burned != null ? groupInt(burned) : '—'}
              foot={
                <>
                  <div className="h-1.5 overflow-hidden rounded-full bg-line2">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-gold to-lime transition-[width] duration-1000"
                      style={{ width: `${Math.min((burnPct ?? 0) * 10, 100)}%` }}
                    />
                  </div>
                  <p className="mt-3">
                    {burnPct != null ? (
                      <>
                        <span className="font-mono font-semibold text-paper">
                          {burnPct.toFixed(3)}%
                        </span>{' '}
                        of the 1B supply, sent to the dead address and unrecoverable. 444,444
                        burns with every activation, and again on every resale.
                      </>
                    ) : (
                      'Reading the dead address balance…'
                    )}
                  </p>
                </>
              }
            />
            {potential != null ? (
              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line/60 pt-4">
                <p className="text-[12px] text-mute">
                  <span className="label-lime">Queued</span>{' '}
                  <span className="font-mono font-semibold text-paper">
                    {groupInt(potential)}
                  </span>{' '}
                  more burns if every dormant Boss switches on
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="panel-raised p-6 sm:p-8">
          <Hero
            label="House Book"
            value={book != null ? book.toFixed(4) : '—'}
            unit="ETH"
            foot={
              <p>
                Fees waiting for the next crank. When it fills, anyone can trigger the payout and
                every activated Boss takes a share in real tokenized stock.
              </p>
            }
          />
          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-line/60 pt-4">
            <div>
              <p className="label">Minted</p>
              <p className="num mt-1 font-mono text-[17px] font-semibold tabular-nums text-paper">
                {s.minted != null ? `${s.minted} / ${s.cap}` : '—'}
              </p>
            </div>
            <div>
              <p className="label">Activation fee</p>
              <p className="num mt-1 font-mono text-[17px] font-semibold tabular-nums text-paper">
                888,888
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
