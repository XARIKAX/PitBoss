'use client';

/**
 * Featured partner table — a co-branded house table.
 *
 * A partner project gets a table on the floor whose immutable `creator`
 * address is theirs, so 0.5% of every stake at that table flows to them
 * forever. This is the showcase card for one; PARTNERS below is the roster.
 *
 * Live figures (bankroll, spins) come from the wheel contract when the table
 * is deployed. Before that the card renders in "reserved" state — the offer is
 * still the point, so it stays presentable pre-deploy.
 */
import Link from 'next/link';
import { formatEther, type Address } from 'viem';
import { shortAddr } from '@/lib/format';
import { explorerAddress } from '@/config/chains';

export type Partner = {
  key: string;
  name: string;
  handle: string;
  href: string;
  /** One line on who they are. */
  blurb: string;
  /** Stock the table pays out in. */
  payout: string;
  /** Deployed wheel address, or null while reserved. */
  wheel: Address | null;
  /** Where the 0.5% lands. */
  creator: Address | null;
  bankroll?: bigint | null;
  spins?: bigint | null;
  /** Accent for the partner's side of the lockup. */
  accent: string;
};

export const PARTNERS: Partner[] = [
  {
    key: 'stonkbrokers',
    name: 'StonkBrokers',
    handle: '@ClutchMarkets',
    href: 'https://x.com/ClutchMarkets',
    blurb: 'Brokers work the market all day. This is where they play at night.',
    payout: 'NVDA',
    wheel: null,
    creator: null,
    accent: '#F5C842',
  },
];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className="num mt-1 font-mono text-[19px] font-semibold tabular-nums text-paper">{value}</p>
    </div>
  );
}

export function PartnerTable({ p, chainId }: { p: Partner; chainId: number }) {
  const reserved = p.wheel == null;

  return (
    <div className="dashed relative overflow-hidden bg-lime/[0.03] p-6 sm:p-9">
      {/* partner-tinted bloom */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-[380px] w-[380px] rounded-full blur-3xl"
        style={{ background: `radial-gradient(circle, ${p.accent}22, transparent 70%)` }}
      />
      {/* felt texture */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] bg-[repeating-linear-gradient(0deg,rgba(0,0,0,.25)_0_1px,transparent_1px_3px)]"
      />

      <div className="relative grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        {/* ── identity ── */}
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="chip border-gold/60 text-gold">
              <span className="h-1.5 w-1.5 animate-dot rounded-full bg-gold" />
              {reserved ? 'Reserved' : 'Open'}
            </span>
            <span className="label">Partner table · Roulette</span>
          </div>

          {/* co-brand lockup */}
          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="headline text-[26px] text-paper sm:text-[30px]">PITBOSSES</span>
            <span className="font-mono text-[22px] text-dim sm:text-[26px]">×</span>
            <span
              className="headline text-[26px] sm:text-[30px]"
              style={{ color: p.accent, textShadow: `0 0 24px ${p.accent}55` }}
            >
              {p.name.toUpperCase()}
            </span>
          </div>

          <p className="mt-4 max-w-md text-[13.5px] leading-relaxed text-mute">{p.blurb}</p>

          <div className="mt-6 grid max-w-md grid-cols-3 gap-4 border-t border-line/60 pt-5">
            <Stat label="Table cut" value="0.5%" />
            <Stat label="Pays out in" value={p.payout} />
            <Stat
              label="Bankroll"
              value={p.bankroll != null ? Number(formatEther(p.bankroll)).toFixed(2) : '—'}
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {reserved ? (
              <a href={p.href} target="_blank" rel="noopener noreferrer" className="btn-lime">
                {p.handle} →
              </a>
            ) : (
              <Link href="/roulette" className="btn-lime">
                Play this table →
              </Link>
            )}
            <Link href="/docs" className="btn-ghost">
              How the cut works
            </Link>
          </div>
        </div>

        {/* ── the deal ── */}
        <div className="panel-raised relative overflow-hidden p-6">
          <p className="label-lime">Every spin at this table</p>
          <p
            className="num mt-3 font-mono text-[64px] font-bold leading-none tabular-nums sm:text-[76px]"
            style={{ color: p.accent, textShadow: `0 0 28px ${p.accent}66` }}
          >
            0.5%
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-mute">
            of the stake goes to {p.name}, in ETH, the moment the bet is placed. The remaining
            rake feeds the House Book that pays 888 PitBosses in real tokenized stock.
          </p>

          <div className="mt-5 space-y-2 border-t border-line/60 pt-4 text-[12.5px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-mute">Creator address</span>
              {p.creator ? (
                <a
                  href={explorerAddress(chainId, p.creator)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="num font-mono text-gold hover:underline"
                >
                  {shortAddr(p.creator)}
                </a>
              ) : (
                <span className="num font-mono text-dim">set at deploy</span>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-mute">Changeable by us</span>
              <span className="num font-mono text-lime">never · immutable</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-mute">Spins settled</span>
              <span className="num font-mono text-paper">
                {p.spins != null ? (p.spins > 0n ? (p.spins - 1n).toString() : '0') : '—'}
              </span>
            </div>
          </div>

          <p className="label mt-5">
            {reserved
              ? 'Table reserved · deploys the day they say yes'
              : 'Paid automatically on every spin'}
          </p>
        </div>
      </div>
    </div>
  );
}
