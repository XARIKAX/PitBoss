'use client';

import { useMemo, useRef, useState } from 'react';
import { PageHeader, Section, Stat } from '@/components/ui';
import { DemoBanner } from '@/components/demo';

/**
 * Roulette — a second Pit table.
 *
 * Self-contained interactive preview: spins resolve locally with the SAME logic
 * as the on-chain `Roulette` library (pocket = word % 37, European single-zero
 * payouts), so the UI matches `RouletteWheel.sol` exactly. Live bankroll wiring
 * replaces the local resolver once the wheel is deployed.
 */

// ── Mirror of contracts/src/pit/Roulette.sol ────────────────────────────────
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const POCKETS = 37;
// Physical European wheel sequence (clockwise from 0).
const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14,
  31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const SEG = 360 / POCKETS;

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

function multiplierX(kind: BetKind): number {
  if (kind === 'straight') return 36;
  if (kind === 'dozen' || kind === 'column') return 3;
  return 2;
}
const isRed = (n: number) => RED.has(n);

function resolve(bet: Bet, pocket: number): { win: boolean; x: number } {
  const x = multiplierX(bet.kind);
  if (bet.kind === 'straight') return { win: pocket === bet.selection, x };
  if (pocket === 0) return { win: false, x };
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

type Hue = 'green' | 'red' | 'black';
const hueOf = (n: number): Hue => (n === 0 ? 'green' : isRed(n) ? 'red' : 'black');

// Palette
const C = {
  red: '#e0403f',
  redDim: '#7f1f24',
  black: '#1c2636',
  green: '#2fa15a',
  rim: '#0a0e14',
  lime: '#c6f24e',
};

// ── Geometry ────────────────────────────────────────────────────────────────
function pt(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function slicePath(cx: number, cy: number, rOut: number, rIn: number, a0: number, a1: number) {
  const [x0o, y0o] = pt(cx, cy, rOut, a0);
  const [x1o, y1o] = pt(cx, cy, rOut, a1);
  const [x1i, y1i] = pt(cx, cy, rIn, a1);
  const [x0i, y0i] = pt(cx, cy, rIn, a0);
  return `M${x0o} ${y0o} A${rOut} ${rOut} 0 0 1 ${x1o} ${y1o} L${x1i} ${y1i} A${rIn} ${rIn} 0 0 0 ${x0i} ${y0i} Z`;
}

function Wheel({ rotation, spinning }: { rotation: number; spinning: boolean }) {
  const cx = 150,
    cy = 150,
    rOut = 146,
    rIn = 96,
    rNum = 121;
  return (
    <svg viewBox="0 0 300 300" className="h-full w-full">
      <defs>
        <radialGradient id="hub" cx="50%" cy="42%" r="70%">
          <stop offset="0%" stopColor="#233043" />
          <stop offset="70%" stopColor="#0e141d" />
          <stop offset="100%" stopColor="#070a0f" />
        </radialGradient>
        <filter id="ds" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#000" floodOpacity="0.5" />
        </filter>
      </defs>

      {/* Outer rim */}
      <circle cx={cx} cy={cy} r={149} fill={C.rim} />
      <circle cx={cx} cy={cy} r={147.5} fill="none" stroke="#2a3547" strokeWidth="1.2" />

      {/* Rotating wheel */}
      <g
        style={{
          transform: `rotate(${rotation}deg)`,
          transformOrigin: '150px 150px',
          transition: spinning ? 'transform 4.6s cubic-bezier(0.17,0.67,0.12,1)' : 'none',
        }}
      >
        {WHEEL_ORDER.map((n, i) => {
          const a0 = i * SEG;
          const a1 = (i + 1) * SEG;
          const hue = hueOf(n);
          const fill = hue === 'green' ? C.green : hue === 'red' ? C.red : C.black;
          const [tx, ty] = pt(cx, cy, rNum, a0 + SEG / 2);
          return (
            <g key={i}>
              <path d={slicePath(cx, cy, rOut, rIn, a0, a1)} fill={fill} stroke="#0a0e14" strokeWidth="0.8" />
              <text
                x={tx}
                y={ty}
                fill="#fff"
                fontSize="8.5"
                fontWeight="700"
                textAnchor="middle"
                dominantBaseline="central"
                transform={`rotate(${a0 + SEG / 2} ${tx} ${ty})`}
                style={{ fontFamily: 'var(--font-mono), monospace' }}
              >
                {n}
              </text>
            </g>
          );
        })}
      </g>

      {/* Center hub */}
      <circle cx={cx} cy={cy} r={rIn - 2} fill="url(#hub)" stroke="#2a3547" strokeWidth="1.4" filter="url(#ds)" />
      {/* Gold spinner cross */}
      <g stroke={C.lime} strokeWidth="3.4" strokeLinecap="round">
        <line x1={cx} y1={cy - 46} x2={cx} y2={cy + 46} />
        <line x1={cx - 46} y1={cy} x2={cx + 46} y2={cy} />
      </g>
      <circle cx={cx} cy={cy} r="7.5" fill={C.lime} />
      <circle cx={cx} cy={cy - 46} r="4" fill={C.lime} />
      <circle cx={cx} cy={cy + 46} r="4" fill={C.lime} />
      <circle cx={cx - 46} cy={cy} r="4" fill={C.lime} />
      <circle cx={cx + 46} cy={cy} r="4" fill={C.lime} />

      {/* Top pointer */}
      <path d="M150 6 l7 13 h-14 Z" fill={C.lime} stroke="#0a0e14" strokeWidth="0.8" />
    </svg>
  );
}

// ── Betting board ───────────────────────────────────────────────────────────
const CHIPS = [0.001, 0.005, 0.01, 0.05, 0.1, 0.5];

function sameBet(a: Bet | null, b: Bet) {
  return !!a && a.kind === b.kind && a.selection === b.selection;
}

export default function RoulettePage() {
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');
  const [stake, setStake] = useState(0.01);
  const [bet, setBet] = useState<Bet | null>({ kind: 'red', selection: 0, label: 'Red' });
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ win: boolean; x: number; pocket: number } | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const busy = useRef(false);

  const potential = useMemo(() => (bet ? stake * multiplierX(bet.kind) : 0), [bet, stake]);

  function place(b: Bet) {
    if (spinning) return;
    setBet(b);
  }

  function spin() {
    if (busy.current || !bet || stake <= 0) return;
    busy.current = true;
    setResult(null);
    setSpinning(true);

    const landed = Math.floor(Math.random() * POCKETS);
    const idx = WHEEL_ORDER.indexOf(landed);
    const mid = idx * SEG + SEG / 2;
    setRotation((r) => {
      const base = Math.ceil(r / 360) * 360;
      return base + 360 * 6 + ((360 - mid) % 360);
    });

    window.setTimeout(() => {
      const r = resolve(bet, landed);
      setResult({ ...r, pocket: landed });
      setHistory((h) => [landed, ...h].slice(0, 14));
      setSpinning(false);
      busy.current = false;
    }, 4700);
  }

  // Number cell → straight bet.
  function NumCell({ n }: { n: number }) {
    const hue = hueOf(n);
    const active = bet?.kind === 'straight' && bet.selection === n;
    const bg = hue === 'green' ? C.green : hue === 'red' ? C.red : C.black;
    const col = n === 0 ? 1 : Math.ceil(n / 3) + 1;
    const row = n === 0 ? '1 / span 3' : `${n % 3 === 0 ? 1 : n % 3 === 2 ? 2 : 3}`;
    return (
      <button
        onClick={() => place({ kind: 'straight', selection: n, label: n === 0 ? 'Zero' : `Number ${n}` })}
        style={{ gridColumn: String(col), gridRow: row, background: bg }}
        className={`relative grid place-items-center rounded-[5px] font-mono text-[13px] font-bold tabular-nums text-white transition ${
          active ? 'z-10 ring-2 ring-lime' : 'hover:brightness-125'
        }`}
      >
        {n}
        {active ? <Chip /> : null}
      </button>
    );
  }

  function OutCell({
    b,
    style,
    children,
    tone = 'slate',
  }: {
    b: Bet;
    style: React.CSSProperties;
    children: React.ReactNode;
    tone?: 'slate' | 'red' | 'black';
  }) {
    const active = sameBet(bet, b);
    const bg = tone === 'red' ? C.red : tone === 'black' ? C.black : 'rgba(255,255,255,0.03)';
    return (
      <button
        onClick={() => place(b)}
        style={{ ...style, background: bg }}
        className={`relative grid place-items-center rounded-[5px] border border-white/10 px-2 py-2.5 font-mono text-[11px] uppercase tracking-wide text-paper transition ${
          active ? 'z-10 ring-2 ring-lime' : 'hover:border-lime/40 hover:brightness-125'
        }`}
      >
        {children}
        {active ? <Chip /> : null}
      </button>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="The Pit · New table"
        title="Roulette."
        emphasis="Single zero."
        lede="European single-zero wheel — a clean 2.70% edge, paid to the Bosses. Bet ETH, land a pocket, and winning spins settle in tokenized stock. Same bankroll, same fail-closed guarantees as the Degen Roll."
      />

      <Section>
        <DemoBanner>
          Interactive preview — spins resolve locally with the exact on-chain payout
          logic (pocket = word % 37). Live bankroll wiring replaces it when the wheel
          deploys.
        </DemoBanner>

        <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          {/* ── Control panel ── */}
          <div className="panel h-fit p-4">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/40 p-1">
              {(['manual', 'auto'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-md py-2 font-mono text-[12px] uppercase tracking-wide transition ${
                    mode === m ? 'bg-ink2 text-lime' : 'text-mute hover:text-paper'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            <p className="label mt-5">Chip value</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {CHIPS.map((v) => (
                <button
                  key={v}
                  onClick={() => setStake(v)}
                  className={`grid h-11 w-11 place-items-center rounded-full border-2 font-mono text-[10px] font-bold transition ${
                    stake === v
                      ? 'border-lime bg-lime/15 text-lime'
                      : 'border-line bg-black/30 text-mute hover:border-lime/50 hover:text-paper'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between">
              <span className="label">Total bet</span>
              <span className="font-mono text-sm font-bold text-lime tabular-nums">{stake} ETH</span>
            </div>
            <div className="mt-2 flex gap-2">
              <div className="flex flex-1 items-center rounded-lg border border-line bg-black/40 px-3">
                <input
                  value={stake}
                  onChange={(e) => setStake(Math.max(0, Number(e.target.value) || 0))}
                  inputMode="decimal"
                  className="w-full bg-transparent py-2.5 font-mono text-sm text-paper outline-none tabular-nums"
                />
                <span className="font-mono text-[11px] text-dim">ETH</span>
              </div>
              <button
                onClick={() => setStake((s) => +(s / 2).toFixed(6))}
                className="rounded-lg border border-line px-3 font-mono text-xs text-mute hover:border-lime/50 hover:text-paper"
              >
                ½
              </button>
              <button
                onClick={() => setStake((s) => +(s * 2).toFixed(6))}
                className="rounded-lg border border-line px-3 font-mono text-xs text-mute hover:border-lime/50 hover:text-paper"
              >
                2×
              </button>
            </div>

            <div className="mt-4 rounded-lg border border-line bg-black/30 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="label">Betting</span>
                <span className="font-mono text-[12.5px] text-paper">{bet?.label ?? '—'}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="label">Pays if won</span>
                <span className="font-mono text-[12.5px] font-bold text-lime tabular-nums">
                  {potential.toFixed(4)} ETH
                </span>
              </div>
            </div>

            <button
              onClick={spin}
              disabled={spinning || !bet || stake <= 0 || mode === 'auto'}
              className="mt-4 w-full rounded-xl bg-lime py-3.5 font-mono text-[13px] font-bold uppercase tracking-wide text-black transition hover:brightness-110 disabled:opacity-50"
            >
              {spinning ? 'Spinning…' : mode === 'auto' ? 'Auto — soon' : 'Spin'}
            </button>
          </div>

          {/* ── Wheel + table ── */}
          <div className="panel surface-hero p-5">
            <div className="flex flex-col items-center gap-4">
              {/* Wheel */}
              <div className="relative w-full max-w-[280px]">
                <div className="aspect-square">
                  <Wheel rotation={rotation} spinning={spinning} />
                </div>
                {/* Result badge */}
                <div className="mt-3 min-h-[46px]">
                  {result ? (
                    <div
                      className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${
                        result.win ? 'border-lime/50 bg-lime/[0.06]' : 'border-line bg-black/40'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="grid h-7 w-7 place-items-center rounded-md font-mono text-xs font-bold text-white"
                          style={{
                            background:
                              hueOf(result.pocket) === 'green'
                                ? C.green
                                : hueOf(result.pocket) === 'red'
                                  ? C.red
                                  : C.black,
                          }}
                        >
                          {result.pocket}
                        </span>
                        <span className="font-mono text-[11px] uppercase tracking-wide text-mute">
                          {hueOf(result.pocket)}
                        </span>
                      </span>
                      <span
                        className={`font-mono text-[12px] font-bold uppercase ${
                          result.win ? 'text-lime' : 'text-mute'
                        }`}
                      >
                        {result.win ? `Win · ${(stake * result.x).toFixed(4)}` : 'No win'}
                      </span>
                    </div>
                  ) : (
                    <p className="pt-3 text-center text-[11px] text-dim">Place a chip, then spin.</p>
                  )}
                </div>
              </div>

            </div>

            {/* Betting felt — full width below the wheel */}
            <div className="mt-5 w-full overflow-x-auto">
              <div className="mx-auto min-w-[600px] max-w-[900px]">
                <div
                  className="grid gap-1.5"
                  style={{
                    gridTemplateColumns: '46px repeat(12, minmax(34px,1fr)) 54px',
                    gridAutoRows: 'minmax(48px, auto)',
                  }}
                >
                    <NumCell n={0} />
                    {Array.from({ length: 36 }, (_, i) => (
                      <NumCell key={i + 1} n={i + 1} />
                    ))}
                    {/* 2:1 column bets */}
                    {[
                      { row: 1, sel: 2 },
                      { row: 2, sel: 1 },
                      { row: 3, sel: 0 },
                    ].map(({ row, sel }) => (
                      <OutCell
                        key={row}
                        b={{ kind: 'column', selection: sel, label: `Column ${sel + 1} (2:1)` }}
                        style={{ gridColumn: '14', gridRow: String(row) }}
                      >
                        2:1
                      </OutCell>
                    ))}
                    {/* Dozens */}
                    <OutCell b={{ kind: 'dozen', selection: 0, label: '1st 12' }} style={{ gridColumn: '2 / span 4', gridRow: '4' }}>
                      1 to 12
                    </OutCell>
                    <OutCell b={{ kind: 'dozen', selection: 1, label: '2nd 12' }} style={{ gridColumn: '6 / span 4', gridRow: '4' }}>
                      13 to 24
                    </OutCell>
                    <OutCell b={{ kind: 'dozen', selection: 2, label: '3rd 12' }} style={{ gridColumn: '10 / span 4', gridRow: '4' }}>
                      25 to 36
                    </OutCell>
                    {/* Even-money row */}
                    <OutCell b={{ kind: 'low', selection: 0, label: '1–18' }} style={{ gridColumn: '2 / span 2', gridRow: '5' }}>
                      1 to 18
                    </OutCell>
                    <OutCell b={{ kind: 'even', selection: 0, label: 'Even' }} style={{ gridColumn: '4 / span 2', gridRow: '5' }}>
                      Even
                    </OutCell>
                    <OutCell b={{ kind: 'red', selection: 0, label: 'Red' }} tone="red" style={{ gridColumn: '6 / span 2', gridRow: '5' }}>
                      Red
                    </OutCell>
                    <OutCell b={{ kind: 'black', selection: 0, label: 'Black' }} tone="black" style={{ gridColumn: '8 / span 2', gridRow: '5' }}>
                      Black
                    </OutCell>
                    <OutCell b={{ kind: 'odd', selection: 0, label: 'Odd' }} style={{ gridColumn: '10 / span 2', gridRow: '5' }}>
                      Odd
                    </OutCell>
                    <OutCell b={{ kind: 'high', selection: 0, label: '19–36' }} style={{ gridColumn: '12 / span 2', gridRow: '5' }}>
                      19 to 36
                    </OutCell>
                  </div>

                  {/* Recent */}
                  {history.length > 0 ? (
                    <div className="mt-4 flex items-center gap-2">
                      <span className="label shrink-0">Recent</span>
                      <div className="flex flex-wrap gap-1">
                        {history.map((n, i) => (
                          <span
                            key={`${n}-${i}`}
                            className="grid h-6 w-6 place-items-center rounded font-mono text-[10px] font-bold tabular-nums text-white"
                            style={{
                              background:
                                hueOf(n) === 'green' ? C.green : hueOf(n) === 'red' ? C.red : C.black,
                            }}
                          >
                            {n}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

        {/* Payouts + mechanics */}
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
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
                  {[
                    ['Straight (single number)', '35 : 1', '2.7%', '36×'],
                    ['Dozen / Column', '2 : 1', '32.4%', '3×'],
                    ['Red/Black · Even/Odd · 1–18/19–36', '1 : 1', '48.6%', '2×'],
                  ].map((r) => (
                    <tr key={r[0]} className="border-b border-line/50">
                      <td className="py-2.5 pr-3 text-paper">{r[0]}</td>
                      <td className="py-2.5 text-right text-mute">{r[1]}</td>
                      <td className="py-2.5 text-right text-mute">{r[2]}</td>
                      <td className="py-2.5 text-right font-bold text-lime">{r[3]}</td>
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
              <Stat label="Edge to" value="Bosses" />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-mute">
              One green zero is the only structural edge — a clean 2.70%, the same on
              every bet. Winnings pay in tokenized stock from a player-owned bankroll,
              and the edge plus a small rake flow to the House Book, so every spin pays
              the Bosses. Fails closed on entropy stall; unresolved spins refund after
              48h.
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}

/** A small lime chip marker dropped on the selected cell. */
function Chip() {
  return (
    <span className="pointer-events-none absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full border-2 border-black bg-lime text-[7px] font-bold text-black shadow">
      ●
    </span>
  );
}
