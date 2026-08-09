'use client';

import { useMemo, useRef, useState } from 'react';
import { PageHeader, Section, Stat } from '@/components/ui';
import { DemoBanner, SimBadge } from '@/components/demo';

/**
 * Roulette — a second Pit table. This page is a self-contained interactive
 * preview: it resolves spins locally with the SAME logic as the on-chain
 * `Roulette` library (pocket = word % 37, European single-zero payouts), so what
 * you see here is exactly how the contract pays. Live bankroll wiring replaces
 * the local resolver once `RouletteWheel` is deployed.
 */

// Mirror of contracts/src/pit/Roulette.sol -------------------------------------
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const POCKETS = 37;

type BetKind =
  | 'straight'
  | 'red'
  | 'black'
  | 'even'
  | 'odd'
  | 'low'
  | 'high'
  | 'dozen'
  | 'column';

type Bet = { kind: BetKind; selection: number; label: string };

/** Total-return multiplier (1.00× = keep stake). Matches Roulette.sol. */
function multiplierX(kind: BetKind): number {
  if (kind === 'straight') return 36;
  if (kind === 'dozen' || kind === 'column') return 3;
  return 2;
}

function isRed(n: number): boolean {
  return RED.has(n);
}

/** The canonical outcome — identical to Roulette.resolve(). */
function resolve(bet: Bet, pocket: number): { win: boolean; x: number } {
  const x = multiplierX(bet.kind);
  if (bet.kind === 'straight') return { win: pocket === bet.selection, x };
  if (pocket === 0) return { win: false, x }; // zero loses all outside bets
  switch (bet.kind) {
    case 'red':
      return { win: isRed(pocket), x };
    case 'black':
      return { win: !isRed(pocket), x };
    case 'even':
      return { win: pocket % 2 === 0, x };
    case 'odd':
      return { win: pocket % 2 === 1, x };
    case 'low':
      return { win: pocket <= 18, x };
    case 'high':
      return { win: pocket >= 19, x };
    case 'dozen':
      return { win: Math.floor((pocket - 1) / 12) === bet.selection, x };
    case 'column': {
      const col = pocket % 3 === 0 ? 2 : (pocket % 3) - 1;
      return { win: col === bet.selection, x };
    }
  }
}

function pocketColor(n: number): 'green' | 'red' | 'black' {
  if (n === 0) return 'green';
  return isRed(n) ? 'red' : 'black';
}

// UI ---------------------------------------------------------------------------
const OUTSIDE: Bet[] = [
  { kind: 'red', selection: 0, label: 'Red' },
  { kind: 'black', selection: 0, label: 'Black' },
  { kind: 'even', selection: 0, label: 'Even' },
  { kind: 'odd', selection: 0, label: 'Odd' },
  { kind: 'low', selection: 0, label: '1–18' },
  { kind: 'high', selection: 0, label: '19–36' },
  { kind: 'dozen', selection: 0, label: '1st 12' },
  { kind: 'dozen', selection: 1, label: '2nd 12' },
  { kind: 'dozen', selection: 2, label: '3rd 12' },
  { kind: 'column', selection: 0, label: 'Col 1' },
  { kind: 'column', selection: 1, label: 'Col 2' },
  { kind: 'column', selection: 2, label: 'Col 3' },
];

const PAYOUTS = [
  { bet: 'Straight (single number)', pays: '35 : 1', prob: '2.7%', ret: '36×' },
  { bet: 'Dozen / Column', pays: '2 : 1', prob: '32.4%', ret: '3×' },
  { bet: 'Red / Black · Even / Odd · 1–18 / 19–36', pays: '1 : 1', prob: '48.6%', ret: '2×' },
];

function sameBet(a: Bet | null, b: Bet): boolean {
  return !!a && a.kind === b.kind && a.selection === b.selection;
}

export default function RoulettePage() {
  const [stake, setStake] = useState('0.01');
  const [bet, setBet] = useState<Bet | null>({ kind: 'red', selection: 0, label: 'Red' });
  const [pocket, setPocket] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ win: boolean; x: number; pocket: number } | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stakeNum = Number(stake) || 0;
  const potential = useMemo(
    () => (bet ? (stakeNum * multiplierX(bet.kind)).toFixed(4) : '0'),
    [bet, stakeNum],
  );

  function selectStraight(n: number) {
    setBet({ kind: 'straight', selection: n, label: `Number ${n}` });
  }

  function play() {
    if (spinning || !bet) return;
    setResult(null);
    setSpinning(true);
    // Visual spin: cycle pockets, then land on a locally-drawn word % 37.
    let ticks = 0;
    const landed = Math.floor(Math.random() * POCKETS);
    timer.current = setInterval(() => {
      ticks += 1;
      setPocket(Math.floor(Math.random() * POCKETS));
      if (ticks > 22) {
        if (timer.current) clearInterval(timer.current);
        setPocket(landed);
        const r = resolve(bet, landed);
        setResult({ ...r, pocket: landed });
        setHistory((h) => [landed, ...h].slice(0, 12));
        setSpinning(false);
      }
    }, 70);
  }

  const shown = pocket ?? 0;
  const color = pocketColor(shown);

  return (
    <>
      <PageHeader
        eyebrow="The Pit · New table"
        title="Roulette."
        emphasis="Single zero."
        lede="European single-zero wheel — a 2.70% house edge, paid to the Bosses. Bet ETH, land a pocket, and winning spins settle in tokenized stock. Same bankroll, same fail-closed guarantees as the Degen Roll."
      />

      <Section>
        <DemoBanner>
          Interactive preview — spins resolve locally with the exact on-chain payout
          logic (pocket = word % 37). Live bankroll wiring replaces it when the wheel
          deploys.
        </DemoBanner>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* Wheel + result */}
          <div className="panel surface-hero relative overflow-hidden p-6">
            <div className="flex items-center justify-between">
              <span className="label-lime">The Wheel</span>
              <SimBadge label="local sim" />
            </div>

            <div className="mt-6 flex flex-col items-center">
              <div
                className={`grid h-40 w-40 place-items-center rounded-full border-4 shine transition-colors ${
                  color === 'green'
                    ? 'border-acid bg-acid/10'
                    : color === 'red'
                      ? 'border-red-500 bg-red-500/10'
                      : 'border-paper/60 bg-white/[0.04]'
                }`}
              >
                <span className="font-mono text-6xl font-bold tabular-nums text-paper">
                  {shown}
                </span>
              </div>
              <span
                className={`mt-3 chip ${
                  color === 'green'
                    ? 'border-acid/60 text-acid'
                    : color === 'red'
                      ? 'border-red-500/60 text-red-400'
                      : 'border-paper/40 text-paper'
                }`}
              >
                {color}
              </span>
            </div>

            {/* Result banner */}
            <div className="mt-6 min-h-[52px]">
              {result ? (
                result.win ? (
                  <div className="rounded-xl border border-lime/50 bg-lime/[0.06] px-4 py-3 text-center">
                    <span className="font-mono text-sm font-bold uppercase tracking-wide text-lime">
                      Win · {result.x}× → {(stakeNum * result.x).toFixed(4)} in stock
                    </span>
                  </div>
                ) : (
                  <div className="rounded-xl border border-line bg-black/40 px-4 py-3 text-center">
                    <span className="font-mono text-sm uppercase tracking-wide text-mute">
                      No win — the house holds
                    </span>
                  </div>
                )
              ) : (
                <p className="text-center text-xs text-dim">Place a bet and spin.</p>
              )}
            </div>

            {/* Recent */}
            {history.length > 0 ? (
              <div className="mt-5">
                <p className="label mb-2">Recent</p>
                <div className="flex flex-wrap gap-1.5">
                  {history.map((n, i) => {
                    const c = pocketColor(n);
                    return (
                      <span
                        key={`${n}-${i}`}
                        className={`grid h-7 w-7 place-items-center rounded-md font-mono text-[11px] font-bold tabular-nums ${
                          c === 'green'
                            ? 'bg-acid/15 text-acid'
                            : c === 'red'
                              ? 'bg-red-500/15 text-red-400'
                              : 'bg-white/[0.06] text-paper'
                        }`}
                      >
                        {n}
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          {/* Bet controls */}
          <div className="panel p-6">
            <span className="label-lime">Your bet</span>

            {/* Stake */}
            <div className="mt-4">
              <label className="label mb-1.5 block">Stake (ETH)</label>
              <div className="flex gap-2">
                <input
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  inputMode="decimal"
                  className="w-full rounded-lg border border-line bg-black/40 px-3 py-2.5 font-mono text-sm text-paper outline-none focus:border-lime/60"
                />
                {['0.01', '0.05', '0.1'].map((v) => (
                  <button
                    key={v}
                    onClick={() => setStake(v)}
                    className="rounded-lg border border-line px-3 py-2.5 font-mono text-xs text-mute hover:border-lime/50 hover:text-paper"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Outside bets */}
            <div className="mt-5">
              <label className="label mb-1.5 block">Even-money · dozens · columns</label>
              <div className="grid grid-cols-3 gap-1.5">
                {OUTSIDE.map((b) => (
                  <button
                    key={b.label}
                    onClick={() => setBet(b)}
                    className={`rounded-lg border px-2 py-2.5 font-mono text-[11px] uppercase tracking-wide transition ${
                      sameBet(bet, b)
                        ? 'border-lime bg-lime/10 text-lime'
                        : 'border-line text-mute hover:border-lime/40 hover:text-paper'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Straight number grid */}
            <div className="mt-5">
              <label className="label mb-1.5 block">Straight up — 35 : 1</label>
              <div className="grid grid-cols-[repeat(13,minmax(0,1fr))] gap-1">
                {Array.from({ length: 37 }, (_, n) => {
                  const c = pocketColor(n);
                  const active = bet?.kind === 'straight' && bet.selection === n;
                  return (
                    <button
                      key={n}
                      onClick={() => selectStraight(n)}
                      className={`grid aspect-square place-items-center rounded font-mono text-[10px] font-bold tabular-nums transition ${
                        active
                          ? 'ring-2 ring-lime'
                          : ''
                      } ${
                        c === 'green'
                          ? 'bg-acid/20 text-acid'
                          : c === 'red'
                            ? 'bg-red-500/20 text-red-300'
                            : 'bg-white/[0.06] text-paper'
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Summary + spin */}
            <div className="mt-6 flex items-center justify-between rounded-lg border border-line bg-black/30 px-4 py-3">
              <div>
                <p className="label">Betting</p>
                <p className="font-mono text-sm text-paper">{bet?.label ?? '—'}</p>
              </div>
              <div className="text-right">
                <p className="label">Pays if won</p>
                <p className="font-mono text-sm font-bold text-lime">{potential} ETH</p>
              </div>
            </div>

            <button
              onClick={play}
              disabled={spinning || !bet || stakeNum <= 0}
              className="pill-lime mt-4 w-full justify-center disabled:opacity-50"
            >
              {spinning ? 'Spinning…' : 'Spin the wheel'}
            </button>
          </div>
        </div>

        {/* Payout table */}
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="panel p-6">
            <span className="label-lime">Payouts</span>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="label border-b border-line">
                    <th className="pb-2 font-normal">Bet</th>
                    <th className="pb-2 text-right font-normal">Pays</th>
                    <th className="pb-2 text-right font-normal">Win chance</th>
                    <th className="pb-2 text-right font-normal">Return</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-[12.5px]">
                  {PAYOUTS.map((r) => (
                    <tr key={r.bet} className="border-b border-line/50">
                      <td className="py-2.5 pr-3 text-paper">{r.bet}</td>
                      <td className="py-2.5 text-right text-mute">{r.pays}</td>
                      <td className="py-2.5 text-right text-mute">{r.prob}</td>
                      <td className="py-2.5 text-right font-bold text-lime">{r.ret}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel p-6">
            <span className="label-lime">How it pays</span>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <Stat label="House edge" value="2.70%" />
              <Stat label="Wheel" value="0–36" />
              <Stat label="Settles in" value="Stock" />
              <Stat label="Edge goes to" value="Bosses" />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-mute">
              A single green zero is the only structural edge — a clean 2.70%, the same
              on every bet. Winnings pay in tokenized stock from a player-owned
              bankroll, and the edge plus a small rake flow to the House Book, so every
              spin pays the Bosses. Fails closed on entropy stall; unresolved spins
              refund after 48h.
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}
