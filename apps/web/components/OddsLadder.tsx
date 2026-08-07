'use client';

import { PRIZE_TABLE, fmtMultiplier, expectedValue, houseEdgePct } from '@/lib/prizeTable';

/**
 * The odds board as a graded ladder: ember floor rows -> paper break-even ->
 * acid wins -> gold jackpot tier, probability as a log-scaled bar so the
 * 1-in-1000 rungs read as visually rare. `lockIndex` highlights the rung the
 * last roll landed on. Data mirrors lib/prizeTable.ts verbatim.
 */
const MAX_LOG = Math.log10(1 + 45.18);

function rowTier(mult: number) {
  if (mult < 1) return 'floor';
  if (mult === 1) return 'even';
  if (mult >= 15) return 'gold';
  return 'win';
}

const X_COLOR = {
  floor: 'text-ember',
  even: 'text-paper',
  win: 'text-acid',
  gold: 'text-gold',
} as const;
const BAR_COLOR = {
  floor: 'bg-ember/75',
  even: 'bg-paper/70',
  win: 'bg-acid',
  gold: 'bg-gold shadow-[0_0_8px_rgba(245,200,66,0.5)]',
} as const;
const LOCK_BG = {
  floor: 'bg-ember/10',
  even: 'bg-paper/10',
  win: 'bg-acid/10',
  gold: 'bg-gold/15',
} as const;

function oddsLabel(pct: number) {
  return pct >= 1 ? `${pct.toFixed(2)}%` : `1 in ${Math.round(100 / pct).toLocaleString()}`;
}

export function OddsLadder({
  ticket,
  lockIndex,
}: {
  /** Ticket size in ETH — adds a payout column when set and > 0. */
  ticket?: number;
  /** Rung index the last roll landed on (highlighted). */
  lockIndex?: number | null;
}) {
  const showPayout = ticket != null && ticket > 0;
  return (
    <div className="rounded-xl border border-line bg-ink py-1.5">
      <div className="label flex items-center justify-between px-4 pb-1 pt-2 text-[10px] uppercase tracking-[0.14em] text-dim">
        <span>multiplier</span>
        <span>{showPayout ? `payout on Ξ${ticket}` : 'probability'}</span>
      </div>
      {PRIZE_TABLE.map((r, i) => {
        const tier = rowTier(r.multiplier);
        const w = Math.max(2.5, (Math.log10(1 + r.oddsPct) / MAX_LOG) * 100);
        const lock = lockIndex === i;
        return (
          <div
            key={r.multiplier}
            className={`grid grid-cols-[64px_1fr_104px] items-center gap-3 px-4 py-[5px] transition-colors ${
              lock ? LOCK_BG[tier] : ''
            }`}
          >
            <span className={`num text-right font-mono text-[13px] font-bold ${X_COLOR[tier]}`}>
              {fmtMultiplier(r.multiplier)}
            </span>
            <span className="h-1 overflow-hidden rounded-full bg-black/60">
              <span className={`block h-full ${BAR_COLOR[tier]}`} style={{ width: `${w}%` }} />
            </span>
            <span className="num text-right font-mono text-[11px] text-dim">
              {showPayout ? `${(ticket! * r.multiplier).toFixed(4)}` : oddsLabel(r.oddsPct)}
            </span>
          </div>
        );
      })}
      <div className="label flex items-center justify-between border-t border-line px-4 pb-2 pt-2.5 text-[10px] uppercase tracking-[0.14em] text-mute">
        <span>
          RTP {(expectedValue() * 100).toFixed(0)}% · edge {houseEdgePct().toFixed(0)}%
        </span>
        <span className="text-gold">50× is real · 1 in 1,000</span>
      </div>
    </div>
  );
}
