'use client';

import { useEffect, useRef, useState } from 'react';
import { PRIZE_TABLE, fmtMultiplier } from '@/lib/prizeTable';

/**
 * The slot-cabinet reel window. Idle it shows the last settled multiplier;
 * while a settle tx is in flight it cycles the prize table; when the result
 * lands it decelerates and locks with a tier flash (ember floor / acid win /
 * gold jackpot). Pure presentation — the caller feeds it phase + result.
 */
export type ReelPhase = 'idle' | 'spinning' | 'landed';
export type ReelResult = { milliX: number; prizeText: string } | null;

const tierOf = (milliX: number) => (milliX < 1000 ? 'floor' : milliX >= 15000 ? 'gold' : 'win');

export function RollReel({ phase, result }: { phase: ReelPhase; result: ReelResult }) {
  const [display, setDisplay] = useState('--');
  const [locked, setLocked] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    const reduced =
      typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const randomRow = () =>
      fmtMultiplier(PRIZE_TABLE[Math.floor(Math.random() * PRIZE_TABLE.length)].multiplier);

    if (phase === 'spinning') {
      setLocked(false);
      if (reduced) {
        setDisplay('· · ·');
        return;
      }
      const cycle = () => {
        setDisplay(randomRow());
        timer.current = setTimeout(cycle, 70);
      };
      cycle();
    } else if (phase === 'landed' && result != null) {
      const total = reduced ? 1 : 14;
      let step = 0;
      const tick = () => {
        step++;
        if (step >= total) {
          setDisplay(fmtMultiplier(result.milliX / 1000));
          setLocked(true);
        } else {
          setDisplay(randomRow());
          timer.current = setTimeout(tick, 60 + (step / total) ** 2 * 280);
        }
      };
      tick();
    } else {
      // idle
      if (result != null) {
        setDisplay(fmtMultiplier(result.milliX / 1000));
        setLocked(true);
      } else {
        setDisplay('--');
        setLocked(false);
      }
    }
    return () => clearTimeout(timer.current);
  }, [phase, result]);

  const tier = locked && result != null ? tierOf(result.milliX) : null;

  const frame =
    tier === 'gold'
      ? 'border-gold/70 shadow-[inset_0_0_44px_rgba(245,200,66,0.18)]'
      : tier === 'win'
        ? 'border-acid/50 shadow-[inset_0_0_30px_rgba(158,240,26,0.10)]'
        : tier === 'floor'
          ? 'border-ember/40'
          : 'border-line2';
  const num =
    tier === 'gold'
      ? 'text-gold [text-shadow:0_0_22px_rgba(245,200,66,0.55)]'
      : tier === 'win'
        ? 'text-acid'
        : tier === 'floor'
          ? 'text-ember'
          : phase === 'spinning'
            ? 'text-mute blur-[0.8px]'
            : 'text-paper';

  const caption =
    phase === 'spinning'
      ? 'committing to entropy…'
      : tier === 'gold'
        ? 'JACKPOT TIER'
        : tier === 'win'
          ? 'winner · paid in stock'
          : tier === 'floor'
            ? 'the floor held · 70%+ back'
            : 'insert ticket';

  return (
    <div
      className={`relative flex flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border bg-black/60 py-6 transition-colors ${frame}`}
    >
      {/* scanline texture */}
      <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent_0_3px,rgba(255,255,255,0.02)_3px_6px)]" />
      <p className={`num font-mono text-[44px] font-bold leading-none tracking-tight transition-colors ${num}`}>
        {display}
      </p>
      <p className="label text-[10px] uppercase tracking-[0.22em] text-dim">{caption}</p>
      {locked && result != null ? (
        <p
          className={`data text-xs ${
            tier === 'gold' ? 'text-gold' : tier === 'win' ? 'text-acid' : 'text-ember'
          }`}
        >
          {tier === 'floor' ? 'returns ' : '+'}
          {result.prizeText}
        </p>
      ) : null}
    </div>
  );
}
