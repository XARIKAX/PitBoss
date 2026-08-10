'use client';

/**
 * Launcher countdown — the Opening Bell rings in one week.
 *
 * Two renders of one clock:
 *  - <LaunchStrip />  slim site-wide band above the top bar, links to /launcher
 *  - <LaunchHero />   full countdown hero on the launcher page
 *
 * Design: terminal-native. Segmented digit cells on raised panels with a lime
 * phosphor glow, tabular numerals, a week-burn progress bar, and a date line
 * computed in America/New_York so the label can never drift from the clock.
 * Hydration-safe: renders a static shell until mounted, then ticks 1s.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

/** The bell rings: Mon Aug 17, 2026 · 8PM EST. One source of truth. */
export const LAUNCH_AT = new Date('2026-08-17T20:00:00-04:00').getTime();
/** Countdown window (for the burn-down bar): opened ~8 days before the bell,
 *  so the bar shows visible progress from the moment the campaign goes up. */
const WINDOW_MS = 8 * 24 * 60 * 60 * 1000;

const SHARE_TEXT = encodeURIComponent(
  'The Opening Bell rings Mon Aug 17 · 8PM EST. Token launches on PitBosses — every curve fee pays the Bosses. $PITBOSS',
);

type Parts = { d: number; h: number; m: number; s: number; done: boolean };

function partsAt(now: number): Parts {
  const left = Math.max(0, LAUNCH_AT - now);
  return {
    d: Math.floor(left / 86_400_000),
    h: Math.floor(left / 3_600_000) % 24,
    m: Math.floor(left / 60_000) % 60,
    s: Math.floor(left / 1000) % 60,
    done: left === 0,
  };
}

function useCountdown(): { parts: Parts | null; burnPct: number } {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const parts = now == null ? null : partsAt(now);
  const burnPct =
    now == null ? 0 : Math.max(0, Math.min(100, ((WINDOW_MS - (LAUNCH_AT - now)) / WINDOW_MS) * 100));
  return { parts, burnPct };
}

/** The bell date, rendered from the timestamp itself (never hand-written). */
function useBellDate() {
  return useMemo(() => {
    const d = new Date(LAUNCH_AT);
    const day = d.toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const time = d.toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
    });
    return `${day} · ${time.replace(' ', '')} EST`;
  }, []);
}

const pad = (n: number) => String(n).padStart(2, '0');

// ---------------------------------------------------------------- strip ----

/** Slim site-wide band: label · live clock · date · CTA. */
export function LaunchStrip() {
  const { parts } = useCountdown();
  const bellDate = useBellDate();

  return (
    <Link
      href="/launcher"
      className="group relative z-30 flex h-9 items-center justify-center gap-3 overflow-hidden border-b border-lime/25 bg-[#0c1008] px-4 font-mono text-[11px] uppercase tracking-[0.14em]"
    >
      {/* phosphor sweep */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,transparent_30%,rgba(198,255,0,0.08)_50%,transparent_70%)] bg-[length:250%_100%] animate-strip-sweep"
      />
      <span className="hidden items-center gap-2 text-mute sm:flex">
        <span className="h-1.5 w-1.5 animate-dot rounded-full bg-gold" />
        The Launcher
      </span>
      <span className="hidden text-dim sm:inline">·</span>
      <span className="text-paper">Opening Bell</span>
      <span className="num tabular-nums text-[12.5px] font-semibold text-lime [text-shadow:0_0_12px_rgba(198,255,0,0.45)]">
        {parts == null
          ? '—d —:—:—'
          : parts.done
            ? 'LIVE'
            : `${parts.d}d ${pad(parts.h)}:${pad(parts.m)}:${pad(parts.s)}`}
      </span>
      <span className="hidden text-dim md:inline">·</span>
      <span className="hidden text-mute md:inline">{bellDate}</span>
      <span className="text-lime transition group-hover:translate-x-0.5">→</span>
    </Link>
  );
}

// ----------------------------------------------------------------- hero ----

function DigitCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="panel-raised relative flex-1 overflow-hidden px-2 py-4 text-center sm:px-4 sm:py-6">
      {/* scanlines over the digits */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.22)_0px,rgba(0,0,0,0.22)_1px,transparent_1px,transparent_3px)]"
      />
      <p
        key={value}
        className="num animate-digit-in font-mono text-[34px] font-bold leading-none tabular-nums text-lime [text-shadow:0_0_18px_rgba(198,255,0,0.5),0_0_44px_rgba(198,255,0,0.18)] sm:text-[56px]"
      >
        {value}
      </p>
      <p className="label mt-2.5">{label}</p>
    </div>
  );
}

function Colon() {
  return (
    <span className="animate-dot self-center pb-6 font-mono text-[22px] font-bold text-lime/60 sm:text-[34px]">
      :
    </span>
  );
}

/** Full countdown hero for the launcher page. */
export function LaunchHero() {
  const { parts, burnPct } = useCountdown();
  const bellDate = useBellDate();
  const live = parts?.done ?? false;

  return (
    <section className="shell mt-2">
      <div className="dashed relative overflow-hidden bg-lime/[0.03] p-6 sm:p-9">
        {/* radial glow behind the clock */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[340px] w-[720px] -translate-x-1/2 rounded-full bg-lime/[0.06] blur-3xl"
        />

        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="label-lime flex items-center gap-2">
              <span className="inline-block h-px w-5 bg-lime/60" /> The Launcher
            </p>
            <span className="chip border-gold/60 text-gold">
              <span className="h-1.5 w-1.5 animate-dot rounded-full bg-gold" />
              {live ? 'Live' : 'Coming soon'}
            </span>
          </div>

          <h2 className="headline text-h2 mt-3">
            {live ? (
              <>
                The bell is <span className="em">ringing.</span>
              </>
            ) : (
              <>
                The Opening Bell rings <span className="em">in</span>
              </>
            )}
          </h2>

          {!live ? (
            <>
              <div className="mt-6 flex max-w-2xl items-stretch gap-2 sm:gap-3">
                <DigitCell value={parts == null ? '—' : String(parts.d)} label="days" />
                <Colon />
                <DigitCell value={parts == null ? '——' : pad(parts.h)} label="hours" />
                <Colon />
                <DigitCell value={parts == null ? '——' : pad(parts.m)} label="minutes" />
                <Colon />
                <DigitCell value={parts == null ? '——' : pad(parts.s)} label="seconds" />
              </div>

              {/* week burn-down */}
              <div className="mt-6 max-w-2xl">
                <div className="h-1 overflow-hidden rounded-full bg-line2">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-lime to-gold transition-[width] duration-1000"
                    style={{ width: `${burnPct}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <p className="label">Launch window burning down</p>
                  <p className="num font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-paper">
                    {bellDate}
                  </p>
                </div>
              </div>
            </>
          ) : null}

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a
              href={`https://twitter.com/intent/tweet?text=${SHARE_TEXT}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-lime"
            >
              Share on X
            </a>
            <Link href="/docs" className="btn-ghost">
              Read how launches work →
            </Link>
          </div>

          <p className="label mt-5">
            Fixed price or bonding curve · every trade charges the Buyback Bar · a provably fair
            draw rings the bell
          </p>
        </div>
      </div>
    </section>
  );
}
