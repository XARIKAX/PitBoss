'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { formatEther, parseAbiItem, parseEther, parseEventLogs, type Address } from 'viem';
import { PageHeader, Section, EmptyState, Stat } from '@/components/ui';
import { ChainGuard } from '@/components/ChainGuard';
import { DemoBanner } from '@/components/demo';
import { ABIS, readMany, safeRead, useContracts, useRead, type ContractRef } from '@/lib/contracts';
import { useTx } from '@/lib/useTx';
import { isDeployed, PLACEHOLDER } from '@/lib/deployments';
import { fmtUnits, shortAddr } from '@/lib/format';

/**
 * Roulette — a second Pit table, wired to RouletteWheelFactory + RouletteWheel.
 *
 * Wheel discovery mirrors DegenRoll: `wheelCount()` + `allWheels(i)` on the
 * factory, then `stock()` on each wheel + `symbol()` on the stock token.
 * When the factory is undeployed or has no wheels, the local simulation falls
 * back automatically (same DemoBanner as before).
 */

// ── Mirror of contracts/src/pit/Roulette.sol ────────────────────────────────
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const POCKETS = 37;
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

/**
 * On-chain Roulette.Bet enum indices (must match contracts/src/pit/Roulette.sol).
 *   0=Straight 1=Red 2=Black 3=Even 4=Odd 5=Low 6=High 7=Dozen 8=Column
 */
const BET_KIND_ENUM: Record<BetKind, number> = {
  straight: 0,
  red: 1,
  black: 2,
  even: 3,
  odd: 4,
  low: 5,
  high: 6,
  dozen: 7,
  column: 8,
};

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

const C = {
  red: '#e0403f',
  black: '#141b27',
  green: '#2fa15a',
  lime: '#c6f24e',
};
const cellBg = (h: Hue) => (h === 'green' ? C.green : h === 'red' ? C.red : C.black);

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

// ── The wheel ───────────────────────────────────────────────────────────────

/**
 * `waiting` — the bet is committed and the wheel free-spins at a constant rate
 * until the outcome arrives (entropy delay + whoever settles first).
 * `landing` — the outcome is known; decelerate onto its pocket.
 */
type Phase = 'idle' | 'waiting' | 'landing';

const LAND_MS = 4800;
const WAIT_STEP_MS = 1200;

function wheelTransition(phase: Phase, ease: string): string {
  if (phase === 'landing') return `transform ${LAND_MS}ms ${ease}`;
  if (phase === 'waiting') return `transform ${WAIT_STEP_MS}ms linear`;
  return 'none';
}

function Wheel({
  rotation,
  ballRotation,
  phase,
  landedHue,
}: {
  rotation: number;
  ballRotation: number;
  phase: Phase;
  landedHue: Hue | null;
}) {
  const spinning = phase !== 'idle';
  const cx = 150,
    cy = 150;
  const rBezel = 149,
    rTrackOut = 140,
    rRingOut = 130,
    rRingIn = 90,
    rNum = 111,
    rBall = 135;
  const ease = 'cubic-bezier(0.16,0.73,0.09,1)';

  return (
    <svg viewBox="0 0 300 300" className="h-full w-full">
      <defs>
        <linearGradient id="bezel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38445a" />
          <stop offset="45%" stopColor="#131a26" />
          <stop offset="100%" stopColor="#05070b" />
        </linearGradient>
        <radialGradient id="gRed" gradientUnits="userSpaceOnUse" cx="150" cy="150" r="130">
          <stop offset="0.66" stopColor="#ef5350" />
          <stop offset="1" stopColor="#8f2321" />
        </radialGradient>
        <radialGradient id="gBlack" gradientUnits="userSpaceOnUse" cx="150" cy="150" r="130">
          <stop offset="0.66" stopColor="#28323f" />
          <stop offset="1" stopColor="#0c111a" />
        </radialGradient>
        <radialGradient id="gGreen" gradientUnits="userSpaceOnUse" cx="150" cy="150" r="130">
          <stop offset="0.66" stopColor="#3ac06d" />
          <stop offset="1" stopColor="#1c6c3d" />
        </radialGradient>
        <radialGradient id="turret" cx="46%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#2b384c" />
          <stop offset="55%" stopColor="#111823" />
          <stop offset="100%" stopColor="#070a10" />
        </radialGradient>
        <radialGradient id="gloss" cx="38%" cy="30%" r="72%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="42%" stopColor="#ffffff" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ball" cx="36%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#e7ecf3" />
          <stop offset="100%" stopColor="#aeb8c6" />
        </radialGradient>
        <filter id="wsh" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="6" floodColor="#000" floodOpacity="0.55" />
        </filter>
        <filter id="bglow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Bezel + ball track */}
      <circle cx={cx} cy={cy} r={rBezel} fill="url(#bezel)" filter="url(#wsh)" />
      <circle cx={cx} cy={cy} r={rTrackOut} fill="#090d14" />
      <circle cx={cx} cy={cy} r={rTrackOut} fill="none" stroke="#39465c" strokeWidth="1" />
      <circle cx={cx} cy={cy} r={rRingOut + 1} fill="none" stroke="#c6f24e" strokeOpacity="0.16" strokeWidth="1" />

      {/* Rotating wheel head */}
      <g
        style={{
          transform: `rotate(${rotation}deg)`,
          transformOrigin: '150px 150px',
          transition: wheelTransition(phase, ease),
        }}
      >
        {WHEEL_ORDER.map((n, i) => {
          const a0 = i * SEG;
          const a1 = (i + 1) * SEG;
          const hue = hueOf(n);
          const fill = hue === 'green' ? 'url(#gGreen)' : hue === 'red' ? 'url(#gRed)' : 'url(#gBlack)';
          const [tx, ty] = pt(cx, cy, rNum, a0 + SEG / 2);
          return (
            <g key={i}>
              <path d={slicePath(cx, cy, rRingOut, rRingIn, a0, a1)} fill={fill} />
              {/* fret separators */}
              <line
                {...(() => {
                  const [x0, y0] = pt(cx, cy, rRingIn, a0);
                  const [x1, y1] = pt(cx, cy, rRingOut, a0);
                  return { x1: x0, y1: y0, x2: x1, y2: y1 };
                })()}
                stroke="#0a0e14"
                strokeWidth="0.7"
                strokeOpacity="0.7"
              />
              <text
                x={tx}
                y={ty}
                fill="#f4f7fb"
                fontSize="8.4"
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
        {/* ring edges */}
        <circle cx={cx} cy={cy} r={rRingOut} fill="none" stroke="#05070b" strokeWidth="1.4" />
        <circle cx={cx} cy={cy} r={rRingIn} fill="none" stroke="#05070b" strokeWidth="1.4" />
      </g>

      {/* Center turret / spinner */}
      <circle cx={cx} cy={cy} r={rRingIn - 1} fill="url(#turret)" stroke="#2a3547" strokeWidth="1.2" />
      <circle cx={cx} cy={cy} r={rRingIn - 10} fill="none" stroke="#1a2330" strokeWidth="1" />
      <g
        style={{
          transform: `rotate(${rotation * 0.5}deg)`,
          transformOrigin: '150px 150px',
          transition: wheelTransition(phase, ease),
        }}
      >
        <g stroke={C.lime} strokeWidth="3.2" strokeLinecap="round" opacity="0.95">
          <line x1={cx} y1={cy - 44} x2={cx} y2={cy + 44} />
          <line x1={cx - 44} y1={cy} x2={cx + 44} y2={cy} />
        </g>
        <circle cx={cx} cy={cy - 44} r="3.4" fill={C.lime} />
        <circle cx={cx} cy={cy + 44} r="3.4" fill={C.lime} />
        <circle cx={cx - 44} cy={cy} r="3.4" fill={C.lime} />
        <circle cx={cx + 44} cy={cy} r="3.4" fill={C.lime} />
      </g>
      <circle cx={cx} cy={cy} r="12" fill="url(#turret)" stroke={C.lime} strokeWidth="1.6" />
      <circle cx={cx} cy={cy} r="4" fill={C.lime} />

      {/* Ball */}
      <g
        style={{
          transform: `rotate(${ballRotation}deg)`,
          transformOrigin: '150px 150px',
          transition: wheelTransition(phase, ease),
        }}
      >
        <circle
          cx={cx}
          cy={cy - rBall}
          r="5.6"
          fill="url(#ball)"
          filter={!spinning && landedHue ? 'url(#bglow)' : undefined}
        />
        <circle cx={cx - 1.6} cy={cy - rBall - 1.6} r="1.6" fill="#fff" opacity="0.9" />
      </g>

      {/* Gloss + pointer */}
      <circle cx={cx} cy={cy} r={rBezel} fill="url(#gloss)" pointerEvents="none" />
      <path d="M150 4 l8 15 h-16 Z" fill={C.lime} stroke="#05070b" strokeWidth="0.8" />
    </svg>
  );
}

// ── Casino chip ─────────────────────────────────────────────────────────────
function ChipSVG({ active }: { active: boolean }) {
  const edge = active ? '#0a0e08' : '#0b0f16';
  const body = active ? '#c6f24e' : '#26374a';
  const bodyDim = active ? '#a7d43a' : '#1a2634';
  const ink = active ? '#0a0e08' : '#8aa0b6';
  return (
    <svg viewBox="0 0 44 44" className="h-full w-full">
      <circle cx="22" cy="22" r="21" fill={body} />
      {Array.from({ length: 8 }, (_, i) => (
        <rect
          key={i}
          x="20.4"
          y="1.2"
          width="3.2"
          height="6.2"
          rx="1.2"
          fill={edge}
          transform={`rotate(${i * 45} 22 22)`}
        />
      ))}
      <circle cx="22" cy="22" r="15.5" fill={bodyDim} />
      <circle cx="22" cy="22" r="15.5" fill="none" stroke={edge} strokeWidth="1" strokeDasharray="2 3" opacity="0.6" />
      <circle cx="22" cy="22" r="11" fill={body} />
      <circle cx="22" cy="22" r="11" fill="none" stroke={ink} strokeWidth="0.8" opacity="0.35" />
    </svg>
  );
}

/** Placed-bet marker: a stacked chip token dropped on a cell. */
function ChipMark() {
  return (
    <span className="pointer-events-none absolute -right-2 -top-2 h-5 w-5 drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)]">
      <ChipSVG active />
    </span>
  );
}

// ── Board ───────────────────────────────────────────────────────────────────
const CHIPS = [0.001, 0.005, 0.01, 0.05, 0.1, 0.5];
const sameBet = (a: Bet | null, b: Bet) => !!a && a.kind === b.kind && a.selection === b.selection;

// ── On-chain events ──────────────────────────────────────────────────────────
const SPIN_BOUGHT_EVENT = parseAbiItem(
  'event SpinBought(uint256 indexed spinId, address indexed player, uint8 lane, uint8 bet, uint8 selection, uint256 stakeEth, uint256 notional)',
);
const SPIN_SETTLED_EVENT = parseAbiItem(
  'event SpinSettled(uint256 indexed spinId, address indexed player, uint256 word, uint256 pocket, bool win, uint256 prize, bool wasSealed)',
);

// ── Wheel type ───────────────────────────────────────────────────────────────
type WheelInfo = { address: Address; stock: Address; symbol: string };

// ── useWheels — mirrors useMachines in pit/page.tsx ──────────────────────────
function useWheels() {
  const { c, chainId } = useContracts();
  const client = usePublicClient();
  return useQuery({
    queryKey: ['rouletteWheels', chainId],
    enabled: Boolean(client && isDeployed(c.rouletteWheelFactory.address)),
    refetchInterval: 60_000,
    queryFn: async (): Promise<WheelInfo[]> => {
      const count = (await safeRead(client, c.rouletteWheelFactory, 'wheelCount')) as bigint | null;
      if (count == null || count === 0n) return [];
      const n = Number(count);
      const addrCalls = Array.from({ length: n }, (_, i) => ({
        address: c.rouletteWheelFactory.address,
        abi: c.rouletteWheelFactory.abi,
        functionName: 'allWheels',
        args: [BigInt(i)] as const,
      }));
      const addrs = (await readMany(client, addrCalls)).filter(
        (a): a is Address => typeof a === 'string',
      );
      const stocks = (await readMany(
        client,
        addrs.map((a) => ({ address: a, abi: ABIS.rouletteWheel, functionName: 'stock' })),
      )) as (Address | null)[];
      const symbols = (await readMany(
        client,
        stocks.map((s) => ({
          address: s ?? PLACEHOLDER,
          abi: ABIS.erc20,
          functionName: 'symbol',
        })),
      )) as (string | null)[];
      return addrs.map((a, i) => ({
        address: a,
        stock: stocks[i] ?? PLACEHOLDER,
        symbol: symbols[i] ?? shortAddr(stocks[i] ?? undefined),
      }));
    },
  });
}

// ── useOpenSpins — fetch pending spins for the connected wallet ───────────────
type OpenSpin = {
  spinId: bigint;
  lane: number;
  stakeEth: bigint;
  readyAt: bigint;
  status: number;
};

/**
 * @param live Poll hard while a bet is in flight — this is the path the outcome
 *   arrives on now that the keeper settles, so its interval is the delay the
 *   player actually feels between the wheel spinning and the result landing.
 */
function useOpenSpins(wheelAddr: Address, live = false) {
  const { address } = useAccount();
  const { chainId } = useContracts();
  const client = usePublicClient();
  return useQuery({
    queryKey: ['rouletteOpenSpins', chainId, wheelAddr, address ?? '0x0'],
    enabled: Boolean(client && address),
    refetchInterval: live ? 3_000 : 15_000,
    queryFn: async (): Promise<{
      spins: OpenSpin[];
      lastSettled: {spinId: bigint; pocket: bigint; win: boolean; prize: bigint } | null;
    }> => {
      const logs = await client!.getLogs({
        address: wheelAddr,
        event: SPIN_BOUGHT_EVENT,
        args: { player: address! },
        fromBlock: 0n,
      });
      const ids = logs
        .map((l) => l.args.spinId)
        .filter((id): id is bigint => id != null);
      const states = (await readMany(
        client,
        ids.map((id) => ({
          address: wheelAddr,
          abi: ABIS.rouletteWheel,
          functionName: 'spins',
          args: [id] as const,
        })),
      )) as (readonly unknown[] | null)[];

      const spins: OpenSpin[] = ids.map((id, i) => {
        const s = states[i];
        const log = logs[i];
        return {
          spinId: id,
          lane: Number(log.args.lane ?? 0),
          stakeEth: (log.args.stakeEth as bigint | undefined) ?? 0n,
          readyAt: (s?.[5] as bigint | undefined) ?? 0n,
          // status index 9: player(0), escrow(1), notional(2), reserved(3),
          //                 boughtAt(4), readyAt(5), entropyId(6), bet(7),
          //                 selection(8), status(9)
          status: Number((s?.[9] as number | bigint | undefined) ?? 0),
        };
      });

      let lastSettled: {spinId: bigint; pocket: bigint; win: boolean; prize: bigint } | null =
        null;
      try {
        const settled = await client!.getLogs({
          address: wheelAddr,
          event: SPIN_SETTLED_EVENT,
          args: { player: address! },
          fromBlock: 0n,
        });
        const last = settled[settled.length - 1];
        if (last?.args.pocket != null && last.args.spinId != null) {
          lastSettled = {
            spinId: last.args.spinId,
            pocket: last.args.pocket,
            win: last.args.win ?? false,
            prize: last.args.prize ?? 0n,
          };
        }
      } catch {
        lastSettled = null;
      }
      return { spins: spins.reverse(), lastSettled };
    },
  });
}

// ── Main page export ─────────────────────────────────────────────────────────

export default function RoulettePage() {
  const { c } = useContracts();
  const wheels = useWheels();
  const [selectedAddr, setSelectedAddr] = useState<Address | null>(null);

  const list = wheels.data ?? [];
  const wheel = list.find((w) => w.address === selectedAddr) ?? list[0] ?? null;

  const showLive =
    isDeployed(c.rouletteWheelFactory.address) && (!wheels.isLoading && list.length > 0);

  return (
    <ChainGuard>
      <PageHeader
        eyebrow="The Pit · New table"
        title="Roulette."
        emphasis="Single zero."
        lede="European single-zero wheel — a clean 2.70% edge, paid to the Bosses. Bet ETH, land a pocket, and winning spins settle in tokenized stock. Same bankroll, same fail-closed guarantees as the Degen Roll."
      />

      {!showLive ? (
        <DemoRoulette />
      ) : (
        <>
          {list.length > 1 ? (
            <Section label="Wheels" title="Choose a" emphasis="table.">
              {wheels.isLoading ? (
                <p className="data text-sm text-mute">Loading wheels…</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {list.map((w, idx) => (
                    <WheelTile
                      key={w.address}
                      w={w}
                      idx={idx}
                      active={wheel != null && w.address === wheel.address}
                      onSelect={() => setSelectedAddr(w.address)}
                    />
                  ))}
                </div>
              )}
            </Section>
          ) : null}

          {wheel ? <WheelPanels wheel={wheel} /> : null}
        </>
      )}
    </ChainGuard>
  );
}

// ── WheelTile ────────────────────────────────────────────────────────────────

function WheelTile({
  w,
  idx,
  active,
  onSelect,
}: {
  w: WheelInfo;
  idx: number;
  active: boolean;
  onSelect: () => void;
}) {
  const ref: ContractRef = useMemo(() => ({ address: w.address, abi: ABIS.rouletteWheel }), [w.address]);
  const total = useRead<bigint>({ contract: ref, functionName: 'totalBankrollStock', refetchInterval: 30_000 });
  const free = useRead<bigint>({ contract: ref, functionName: 'freeStock', refetchInterval: 30_000 });
  const pct =
    total.data != null && total.data > 0n && free.data != null
      ? Number((free.data * 100n) / total.data)
      : null;
  const boss = (idx % 10) + 1;
  return (
    <button
      onClick={onSelect}
      className={`card shine relative overflow-hidden text-left transition-colors ${active ? 'border-limeSoft' : 'hover:border-lime/40'}`}
    >
      <div className="flex items-center justify-between">
        <p className="headline text-lg">{w.symbol}</p>
        <EntropyBadge wheel={ref} />
      </div>
      <div className="mt-3 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/bosses/${boss}.png`}
          alt={`PitBoss #${boss}`}
          width={40}
          height={40}
          className="h-10 w-10 rounded-lg border border-line [image-rendering:pixelated]"
        />
        <div>
          <p className="eyebrow">pit boss on duty</p>
          <p className="data mt-0.5 text-xs text-mute">Boss #{boss} · earns 2.5% of the action</p>
        </div>
      </div>
      <div className="mt-3.5">
        <div className="eyebrow flex justify-between">
          <span>bankroll</span>
          <span className="num">
            {/* Tokenized stock trades in fractions — rounding to whole units
                rendered a funded 0.28 NVDA bankroll as a bare "0". */}
            {total.data != null ? fmtUnits(total.data) : '…'} {w.symbol}
          </span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/60">
          <div
            className="h-full bg-gradient-to-r from-lime to-gold transition-all duration-700"
            style={{ width: `${pct ?? 0}%` }}
          />
        </div>
        <p className="eyebrow mt-1.5">{pct != null ? `${pct}% free to win` : '…'}</p>
      </div>
      <p className="data mt-3 text-xs text-mute">{shortAddr(w.address)}</p>
    </button>
  );
}

// ── EntropyBadge ─────────────────────────────────────────────────────────────

function EntropyBadge({ wheel }: { wheel: ContractRef }) {
  const conductor = useRead<Address>({ contract: wheel, functionName: 'conductor' });
  const healthy = useRead<boolean>({
    contract: { address: conductor.data ?? PLACEHOLDER, abi: ABIS.entropyConductor },
    functionName: 'healthy',
    enabled: Boolean(conductor.data),
    refetchInterval: 20_000,
  });
  const state = healthy.data == null ? 'unknown' : healthy.data ? 'ok' : 'degraded';
  const ok = state === 'ok';
  return (
    <span
      className={`data inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] ${
        ok
          ? 'border-lime/40 text-lime'
          : state === 'degraded'
            ? 'border-red-400/40 text-red-300'
            : 'border-line text-mute'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-lime' : state === 'degraded' ? 'bg-red-400' : 'bg-mute'}`}
      />
      entropy {state === 'unknown' ? '…' : state === 'ok' ? 'healthy' : 'degraded'}
    </span>
  );
}

// ── ResultModal ───────────────────────────────────────────────────────────────

function ResultModal({
  result,
  symbol,
  onClose,
}: {
  result: { win: boolean; pocket: number; prize: bigint };
  symbol: string;
  onClose: () => void;
}) {
  const hue = hueOf(result.pocket);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative mx-4 w-full max-w-sm rounded-2xl border border-white/10 bg-[#0d1117] p-8 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Pocket */}
        <div
          className="mx-auto mb-4 grid h-24 w-24 place-items-center rounded-full text-5xl font-bold text-white shadow-lg"
          style={{ background: cellBg(hue) }}
        >
          {result.pocket}
        </div>
        <p className="mb-5 font-mono text-xs uppercase tracking-widest text-mute">{hue}</p>

        {result.win ? (
          <>
            <p className="mb-2 text-4xl font-bold tracking-tight text-lime">WIN!</p>
            <p className="font-mono text-xl font-semibold text-white">
              +{Number(formatEther(result.prize)).toFixed(4)}{' '}
              <span className="text-lime">{symbol}</span>
            </p>
            <p className="mt-1 text-xs text-mute">Stock transferred to your wallet</p>
          </>
        ) : (
          <>
            <p className="mb-2 text-4xl font-bold tracking-tight text-mute">MISSED</p>
            <p className="text-sm text-mute">Your stake feeds the bankroll restock</p>
          </>
        )}

        <button
          onClick={onClose}
          className="mt-8 w-full rounded-xl border border-white/10 py-3 text-sm font-medium text-mute transition hover:border-white/20 hover:text-white"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ── WheelPanels — spin + open spins + bankroll ────────────────────────────────

function WheelPanels({ wheel }: { wheel: WheelInfo }) {
  const ref: ContractRef = useMemo(
    () => ({ address: wheel.address, abi: ABIS.rouletteWheel }),
    [wheel.address],
  );
  const [rotation, setRotation] = useState(0);
  const [ballRotation, setBallRotation] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<{ win: boolean; pocket: number; prize: bigint } | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Poll hard only while a bet is actually in flight.
  const spinsQ = useOpenSpins(wheel.address, phase === 'waiting');

  /** Spin ids whose outcome the player has already been shown. */
  const seenSettleId = useRef<bigint | null>(null);
  const primed = useRef(false);
  const spinning = phase !== 'idle';

  // Reset visual when switching wheels.
  useEffect(() => {
    setPhase('idle');
    setResult(null);
    setShowModal(false);
    seenSettleId.current = null;
    primed.current = false;
  }, [wheel.address]);

  /**
   * Free-spin while waiting. Each step is a full turn on a linear transition of
   * the same duration, so the wheel keeps a constant rate with no visible seam
   * between steps.
   */
  useEffect(() => {
    if (phase !== 'waiting') return;
    const id = window.setInterval(() => setRotation((r) => r + 360), WAIT_STEP_MS);
    // Kick the first turn immediately rather than waiting out one interval.
    setRotation((r) => r + 360);
    return () => window.clearInterval(id);
  }, [phase]);

  /** The bet is in. Spin until the outcome arrives. */
  function beginWaiting(spinId: bigint) {
    setResult(null);
    setShowModal(false);
    // A fresh bet supersedes whatever was last shown.
    if (seenSettleId.current !== spinId) setPhase('waiting');
  }

  /** Decelerate onto the landed pocket, then reveal. */
  function animateTo(pocket: number, win: boolean, prize: bigint) {
    setPhase('landing');
    setResult(null);
    setShowModal(false);
    const idx = WHEEL_ORDER.indexOf(pocket);
    const mid = idx * SEG + SEG / 2;
    setRotation((r) => Math.ceil(r / 360) * 360 + 360 * 6 + ((360 - mid) % 360));
    setBallRotation((b) => Math.floor(b / 360) * 360 - 360 * 5);
    window.setTimeout(() => {
      setResult({ win, pocket, prize });
      setPhase('idle');
      setShowModal(true);
    }, LAND_MS + 100);
  }

  /**
   * Show a spin's outcome exactly once, whoever settled it. Both paths funnel
   * here: the player pressing Settle, and the poll below noticing the keeper got
   * there first.
   */
  function showResult(spinId: bigint, pocket: number, win: boolean, prize: bigint) {
    if (seenSettleId.current === spinId) return;
    seenSettleId.current = spinId;
    animateTo(pocket, win, prize);
  }

  /**
   * The settle keeper usually beats the player to it, so the outcome has to
   * arrive by polling rather than from the player's own transaction receipt. The
   * first response only primes `seenSettleId` — otherwise revisiting the page
   * would replay the last historical result as if it just happened.
   */
  useEffect(() => {
    const data = spinsQ.data;
    if (!data) return;
    const last = data.lastSettled;
    if (!primed.current) {
      primed.current = true;
      seenSettleId.current = last?.spinId ?? null;
      return;
    }
    if (!last) return;
    showResult(last.spinId, Number(last.pocket), last.win, last.prize);
    // showResult/animateTo are stable within a render pass; keyed on the query data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinsQ.data]);

  const winCell = result && !spinning ? result.pocket : null;

  return (
    <>
      {showModal && result && (
        <ResultModal result={result} symbol={wheel.symbol} onClose={() => setShowModal(false)} />
      )}
      <SpinSection
        wheel={wheel}
        ref_={ref}
        spinning={spinning}
        phase={phase}
        beginWaiting={beginWaiting}
        result={result}
        winCell={winCell}
        rotation={rotation}
        ballRotation={ballRotation}
      />
      <OpenSpinsSection
        wheel={wheel}
        ref_={ref}
        q={spinsQ}
        showResult={showResult}
        setPhase={setPhase}
      />
      <BankrollSection wheel={wheel} ref_={ref} />
    </>
  );
}

// ── SpinSection ───────────────────────────────────────────────────────────────

function SpinSection({
  wheel,
  ref_,
  spinning,
  phase,
  beginWaiting,
  result,
  winCell,
  rotation,
  ballRotation,
}: {
  wheel: WheelInfo;
  ref_: ContractRef;
  spinning: boolean;
  phase: Phase;
  beginWaiting: (spinId: bigint) => void;
  result: { win: boolean; pocket: number; prize: bigint } | null;
  winCell: number | null;
  rotation: number;
  ballRotation: number;
}) {
  const { isConnected } = useAccount();
  const { send, busy } = useTx();
  const { c } = useContracts();
  const [mode] = useState<'manual' | 'auto'>('manual');
  const [stake, setStake] = useState(0.01);
  const [bet, setBet] = useState<Bet | null>({ kind: 'red', selection: 0, label: 'Red' });
  const [lane, setLane] = useState<0 | 1>(0);

  const maxUsd = useRead<bigint>({ contract: ref_, functionName: 'INSTANT_MAX_USD' });
  const usdPerEth = useRead<bigint>({
    contract: c.oracle,
    functionName: 'usdPerEth',
    refetchInterval: 30_000,
  });

  const potential = useMemo(() => (bet ? stake * multiplierX(bet.kind) : 0), [bet, stake]);

  let stakeWei: bigint | null = null;
  try {
    stakeWei = parseEther(stake.toString() as `${number}`);
  } catch {
    stakeWei = null;
  }

  const capEth =
    maxUsd.data != null && usdPerEth.data != null && usdPerEth.data > 0n
      ? (maxUsd.data * 10n ** 18n) / usdPerEth.data
      : null;
  const overCap = lane === 0 && capEth != null && stakeWei != null && stakeWei > capEth;

  function place(b: Bet) {
    if (!spinning && !busy) setBet(b);
  }

  async function onSpin() {
    if (!isConnected || busy || spinning || !bet || !stakeWei || stakeWei === 0n || overCap) return;
    const betEnum = BET_KIND_ENUM[bet.kind];
    // selection: straight → the number, dozen/column → group index, all others → 0
    const selection =
      bet.kind === 'straight' || bet.kind === 'dozen' || bet.kind === 'column'
        ? bet.selection
        : 0;
    const receipt = await send(
      {
        address: ref_.address,
        abi: ref_.abi,
        functionName: 'spin',
        args: [lane, betEnum, selection],
        value: stakeWei,
      },
      { title: `Spin · ${bet.label}` },
    );
    if (!receipt) return;
    // The bet is committed. Start the wheel now and let it run until the outcome
    // lands — the settle keeper resolves it, so the player never has to act again.
    try {
      const [ev] = parseEventLogs({ abi: [SPIN_BOUGHT_EVENT], logs: receipt.logs });
      if (ev?.args.spinId != null) beginWaiting(ev.args.spinId);
    } catch {
      // Couldn't read the id — the poll still surfaces the outcome, just without
      // the wheel spinning in the meantime.
    }
  }

  function NumCell({ n }: { n: number }) {
    const hue = hueOf(n);
    const active = bet?.kind === 'straight' && bet.selection === n;
    const isWin = winCell === n;
    const col = n === 0 ? 1 : Math.ceil(n / 3) + 1;
    const row = n === 0 ? '1 / span 3' : `${n % 3 === 0 ? 1 : n % 3 === 2 ? 2 : 3}`;
    return (
      <button
        onClick={() => place({ kind: 'straight', selection: n, label: n === 0 ? 'Zero' : `Number ${n}` })}
        style={{ gridColumn: String(col), gridRow: row, background: cellBg(hue) }}
        className={`felt-cell relative grid place-items-center rounded-[6px] font-mono text-[13px] font-bold tabular-nums text-white transition-all ${
          isWin ? 'z-20 ring-2 ring-lime shadow-[0_0_18px_2px_rgba(198,242,78,0.55)]' : active ? 'z-10 ring-2 ring-lime' : 'hover:brightness-125'
        }`}
      >
        {n}
        {active ? <ChipMark /> : null}
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
    const bg = tone === 'red' ? C.red : tone === 'black' ? C.black : 'rgba(255,255,255,0.035)';
    return (
      <button
        onClick={() => place(b)}
        style={{ ...style, background: bg }}
        className={`felt-cell relative grid place-items-center rounded-[6px] border border-white/10 px-2 py-2.5 font-mono text-[11px] uppercase tracking-wide text-paper transition-all ${
          active ? 'z-10 ring-2 ring-lime' : 'hover:border-lime/40 hover:brightness-125'
        }`}
      >
        {children}
        {active ? <ChipMark /> : null}
      </button>
    );
  }

  return (
    <Section label={`${wheel.symbol} Roulette`} title="Place a" emphasis="bet.">
      <style>{`.felt-cell{box-shadow:inset 0 1px 0 rgba(255,255,255,0.08),inset 0 -2px 4px rgba(0,0,0,0.35);}`}</style>

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* ── Control panel ── */}
        <div className="panel h-fit p-4">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/40 p-1">
            {([0, 1] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLane(l)}
                className={`rounded-md py-2 font-mono text-[12px] uppercase tracking-wide transition ${
                  lane === l ? 'bg-ink2 text-lime' : 'text-mute hover:text-paper'
                }`}
              >
                {l === 0 ? 'Instant' : 'Vault'}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-mute">
            {lane === 0
              ? `Instant: 30s entropy delay.${capEth != null ? ` Capped at ~Ξ${formatEther(capEth)}.` : ''}`
              : 'Vault: 10min commit delay — settle, seal, or refund later.'}
          </p>

          <p className="label mt-4">Chip value</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {CHIPS.map((v) => (
              <button
                key={v}
                onClick={() => setStake(v)}
                className={`relative aspect-square transition ${
                  stake === v ? 'scale-105 drop-shadow-[0_0_10px_rgba(198,242,78,0.4)]' : 'opacity-80 hover:opacity-100'
                }`}
              >
                <ChipSVG active={stake === v} />
                <span
                  className={`absolute inset-0 grid place-items-center font-mono text-[10px] font-bold ${
                    stake === v ? 'text-black' : 'text-paper'
                  }`}
                >
                  {v}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between">
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
          {overCap ? (
            <p className="mt-2 text-xs text-red-300">
              Over the instant-lane cap — use Vault or shrink the stake.
            </p>
          ) : null}

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
            onClick={onSpin}
            disabled={spinning || busy || !bet || !stakeWei || stakeWei === 0n || overCap || !isConnected || mode === 'auto'}
            className="mt-4 w-full rounded-xl bg-lime py-3.5 font-mono text-[13px] font-bold uppercase tracking-[0.12em] text-black shadow-[0_0_24px_-4px_rgba(198,242,78,0.6)] transition hover:brightness-110 disabled:opacity-50 disabled:shadow-none"
          >
            {!isConnected
              ? 'Connect to spin'
              : busy
                ? 'Confirm in wallet…'
                : phase === 'waiting'
                  ? 'Spinning…'
                  : phase === 'landing'
                    ? 'Landing…'
                    : mode === 'auto'
                      ? 'Auto — soon'
                      : 'Spin'}
          </button>
          <p className="mt-2 text-[11px] text-mute">
            One click. The keeper settles your spin and the wheel lands on its own.
          </p>
        </div>

        {/* ── Wheel + table ── */}
        <div className="panel surface-hero relative overflow-hidden p-5">
          {/* atmospheric glow */}
          <div
            className="pointer-events-none absolute left-1/2 top-4 h-[360px] w-[360px] -translate-x-1/2 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(198,242,78,0.10), transparent 62%)' }}
          />
          <div className="relative flex flex-col items-center gap-4">
            {/* Wheel */}
            <div className="relative w-full max-w-[300px]">
              <div className="aspect-square drop-shadow-[0_16px_40px_rgba(0,0,0,0.55)]">
                <Wheel
                  rotation={rotation}
                  ballRotation={ballRotation}
                  phase={phase}
                  landedHue={result ? hueOf(result.pocket) : null}
                />
              </div>
            </div>

            {/* Result badge */}
            <div className="min-h-[52px] w-full max-w-[440px]">
              {result ? (
                <div
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 transition ${
                    result.win
                      ? 'border-lime/60 bg-lime/[0.07] shadow-[0_0_26px_-6px_rgba(198,242,78,0.6)]'
                      : 'border-line bg-black/40'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span
                      className="grid h-8 w-8 place-items-center rounded-lg font-mono text-sm font-bold text-white shadow-inner"
                      style={{ background: cellBg(hueOf(result.pocket)) }}
                    >
                      {result.pocket}
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-wide text-mute">
                      {hueOf(result.pocket)}
                    </span>
                  </span>
                  <span
                    className={`font-mono text-[13px] font-bold uppercase tracking-wide ${
                      result.win ? 'text-lime' : 'text-mute'
                    }`}
                  >
                    {result.win
                      ? `Win · ${Number(formatEther(result.prize)).toFixed(4)} ${wheel.symbol}`
                      : 'No win'}
                  </span>
                </div>
              ) : phase === 'waiting' ? (
                <p className="data pt-3 text-center text-[11px] text-lime">
                  <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-lime align-middle" />
                  Waiting for entropy — the wheel lands itself, no action needed.
                </p>
              ) : (
                <p className="pt-3 text-center text-[11px] text-dim">
                  {isConnected
                    ? 'Place a chip and spin. The wheel resolves on its own.'
                    : 'Connect wallet to play.'}
                </p>
              )}
            </div>
          </div>

          {/* Betting felt */}
          <div className="relative mt-5 w-full overflow-x-auto rounded-xl border border-white/5 bg-[radial-gradient(circle_at_50%_0%,rgba(47,161,90,0.08),transparent_60%)] p-3">
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
                <OutCell b={{ kind: 'dozen', selection: 0, label: '1st 12' }} style={{ gridColumn: '2 / span 4', gridRow: '4' }}>
                  1 to 12
                </OutCell>
                <OutCell b={{ kind: 'dozen', selection: 1, label: '2nd 12' }} style={{ gridColumn: '6 / span 4', gridRow: '4' }}>
                  13 to 24
                </OutCell>
                <OutCell b={{ kind: 'dozen', selection: 2, label: '3rd 12' }} style={{ gridColumn: '10 / span 4', gridRow: '4' }}>
                  25 to 36
                </OutCell>
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
            <Stat label="Settles in" value={wheel.symbol} />
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
  );
}

// ── OpenSpinsSection ──────────────────────────────────────────────────────────

const SPIN_STATUS = ['open', 'settled', 'refunded'] as const;

function OpenSpinsSection({
  wheel,
  ref_,
  q,
  showResult,
  setPhase,
}: {
  wheel: WheelInfo;
  ref_: ContractRef;
  q: ReturnType<typeof useOpenSpins>;
  showResult: (spinId: bigint, pocket: number, win: boolean, prize: bigint) => void;
  setPhase: (p: Phase) => void;
}) {
  const { isConnected } = useAccount();
  const { send, busy } = useTx();
  const now = Math.floor(Date.now() / 1000);

  const all = q.data?.spins ?? [];
  const open = all.filter((s) => s.status === 0);

  async function settleWithAnimation(fn: 'settle' | 'sealIntoCertificate', spinId: bigint) {
    setPhase('waiting');
    const receipt = await send(
      {
        address: ref_.address,
        abi: ref_.abi,
        functionName: fn,
        args: [spinId],
      },
      { title: `${fn === 'settle' ? 'Settle' : 'Seal'} spin #${spinId.toString()}` },
    );
    if (!receipt) {
      // Commonly RoundAlreadySettled — the keeper got there first, and the poll
      // will surface the outcome on its own.
      setPhase('idle');
      return;
    }
    try {
      const [ev] = parseEventLogs({ abi: [SPIN_SETTLED_EVENT], logs: receipt.logs });
      if (ev?.args.pocket != null) {
        const pocket = Number(ev.args.pocket);
        const win = ev.args.win ?? false;
        const prize = ev.args.prize ?? 0n;
        showResult(spinId, pocket, win, prize);
        return;
      }
    } catch {
      // fall through — the poll will surface the outcome instead
    }
    setPhase('idle');
  }

  return (
    <Section label="Open spins" title="In" emphasis="flight.">
      {!isConnected ? (
        <EmptyState
          title="Connect to see your spins"
          hint="Spins awaiting entropy settlement appear here after you spin."
        />
      ) : q.isLoading ? (
        <p className="data text-sm text-mute">Scanning spins…</p>
      ) : open.length === 0 ? (
        <EmptyState
          title="No open spins"
          hint="Spins resolve on their own. Anything still waiting shows up here, where you can settle it by hand, seal a win into a certificate, or refund after 48h."
        />
      ) : (
        <div className="grid gap-3">
          {open.map((s) => {
            const ready = Number(s.readyAt) <= now;
            return (
              <div key={s.spinId.toString()} className="card">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="data text-sm">
                      Spin #{s.spinId.toString()} · {s.lane === 0 ? 'Instant' : 'Vault'} · Ξ
                      {formatEther(s.stakeEth)}
                    </p>
                    <p className="mt-1 text-xs text-mute">
                      status {SPIN_STATUS[s.status] ?? s.status} ·{' '}
                      {ready
                        ? 'entropy ready'
                        : `ready in ${Math.max(0, Number(s.readyAt) - now)}s`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => settleWithAnimation('settle', s.spinId)}
                      disabled={busy || !ready}
                      className="pill-lime disabled:opacity-50"
                    >
                      {busy ? 'Settling…' : ready ? 'Settle · spin it' : 'Waiting for entropy'}
                    </button>
                    <button
                      onClick={() => settleWithAnimation('sealIntoCertificate', s.spinId)}
                      disabled={busy || !ready}
                      className="pill-ghost disabled:opacity-50"
                    >
                      Seal into certificate
                    </button>
                    <button
                      onClick={() =>
                        send(
                          {
                            address: ref_.address,
                            abi: ref_.abi,
                            functionName: 'refund',
                            args: [s.spinId],
                          },
                          { title: `Refund spin #${s.spinId.toString()}` },
                        )
                      }
                      disabled={busy}
                      className="pill-ghost disabled:opacity-50"
                    >
                      Refund
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// ── BankrollSection ───────────────────────────────────────────────────────────

function BankrollSection({ wheel, ref_ }: { wheel: WheelInfo; ref_: ContractRef }) {
  const { isConnected, address } = useAccount();
  const { send, approveIfNeeded, busy } = useTx();
  const [bossId, setBossId] = useState('');
  const [stakeAmt, setStakeAmt] = useState('');
  const [unstakeAmt, setUnstakeAmt] = useState('');
  const [sellAmt, setSellAmt] = useState('');

  const totalStock = useRead<bigint>({ contract: ref_, functionName: 'totalBankrollStock', refetchInterval: 15_000 });
  const reserved = useRead<bigint>({ contract: ref_, functionName: 'totalReserved', refetchInterval: 15_000 });
  const free = useRead<bigint>({ contract: ref_, functionName: 'freeStock', refetchInterval: 15_000 });
  const sharePrice = useRead<bigint>({ contract: ref_, functionName: 'sharePrice', refetchInterval: 15_000 });
  const ethFloat = useRead<bigint>({ contract: ref_, functionName: 'ethFloat', refetchInterval: 15_000 });
  const myShares = useRead<bigint>({
    contract: ref_,
    functionName: 'shares',
    args: address ? [address] : undefined,
    enabled: Boolean(address),
    refetchInterval: 15_000,
  });

  async function onStake() {
    if (!address || !/^\d+$/.test(bossId.trim())) return;
    let amt: bigint;
    try {
      amt = parseEther(stakeAmt as `${number}`);
    } catch {
      return;
    }
    if (amt === 0n) return;
    const ok = await approveIfNeeded(wheel.stock, address, ref_.address, amt);
    if (!ok) return;
    await send(
      {
        address: ref_.address,
        abi: ref_.abi,
        functionName: 'stakeBankroll',
        args: [BigInt(bossId.trim()), amt],
      },
      { title: `Stake ${stakeAmt} ${wheel.symbol}` },
    );
  }

  async function onUnstake() {
    let sharesIn: bigint;
    try {
      sharesIn = parseEther(unstakeAmt as `${number}`);
    } catch {
      return;
    }
    if (sharesIn === 0n) return;
    await send(
      { address: ref_.address, abi: ref_.abi, functionName: 'unstake', args: [sharesIn] },
      { title: 'Unstake bankroll' },
    );
  }

  async function onSellBack() {
    if (!address) return;
    let amt: bigint;
    try {
      amt = parseEther(sellAmt as `${number}`);
    } catch {
      return;
    }
    if (amt === 0n) return;
    const ok = await approveIfNeeded(wheel.stock, address, ref_.address, amt);
    if (!ok) return;
    await send(
      { address: ref_.address, abi: ref_.abi, functionName: 'sellBack', args: [amt] },
      { title: `Sell back ${sellAmt} ${wheel.symbol}` },
    );
  }

  const fmt = (v: bigint | undefined) => (v == null ? '…' : formatEther(v));

  return (
    <Section label="Bankroll" title="Be the" emphasis="house.">
      <div id="bankroll" className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="card">
          <div className="flex items-center justify-between">
            <p className="headline text-[14px]">Stake · {wheel.symbol}</p>
            <span className="data text-sm text-lime">
              share Ξ{sharePrice.data != null ? formatEther(sharePrice.data) : '…'}
            </span>
          </div>
          <p className="mt-2 text-sm text-mute">
            Take the other side of every spin on this wheel. Staking requires an activated Boss id.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <input
              value={bossId}
              onChange={(e) => setBossId(e.target.value)}
              placeholder="Boss id"
              inputMode="numeric"
              className="data rounded-xl border border-line bg-black/40 px-4 py-3 text-sm"
            />
            <input
              value={stakeAmt}
              onChange={(e) => setStakeAmt(e.target.value)}
              placeholder={`Stake ${wheel.symbol}`}
              inputMode="decimal"
              className="data rounded-xl border border-line bg-black/40 px-4 py-3 text-sm"
            />
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2">
            <input
              value={unstakeAmt}
              onChange={(e) => setUnstakeAmt(e.target.value)}
              placeholder="Unstake shares"
              inputMode="decimal"
              className="data rounded-xl border border-line bg-black/40 px-4 py-3 text-sm"
            />
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={onStake}
              disabled={!isConnected || busy}
              className="pill-lime flex-1 disabled:opacity-50"
            >
              Stake bankroll
            </button>
            <button
              onClick={onUnstake}
              disabled={!isConnected || busy}
              className="pill-ghost flex-1 disabled:opacity-50"
            >
              Unstake
            </button>
          </div>

          <div className="mt-5 rounded-xl border border-line bg-black/40 p-4">
            <p className="eyebrow">Sell back {wheel.symbol}</p>
            <p className="mt-1 text-xs text-mute">
              Sell stock back to the wheel bankroll for ETH at the 95% sell-back rate.
            </p>
            <div className="mt-2 flex gap-2">
              <input
                value={sellAmt}
                onChange={(e) => setSellAmt(e.target.value)}
                inputMode="decimal"
                placeholder="0.0"
                className="data w-full rounded-xl border border-line bg-black/40 px-3 py-2 text-sm"
              />
              <button
                onClick={onSellBack}
                disabled={!isConnected || busy}
                className="pill-ghost whitespace-nowrap disabled:opacity-50"
              >
                Sell back
              </button>
            </div>
          </div>

          <div className="mt-3">
            <button
              onClick={() =>
                send(
                  { address: ref_.address, abi: ref_.abi, functionName: 'restock' },
                  { title: 'Restock wheel' },
                )
              }
              disabled={!isConnected || busy}
              className="pill-ghost w-full disabled:opacity-50"
            >
              Restock (swap ETH float into stock)
            </button>
          </div>
        </div>

        <div className="grid content-start gap-3 sm:grid-cols-2">
          <Stat label="Bankroll stock" value={fmt(totalStock.data)} sub={wheel.symbol} />
          <Stat label="Reserved" value={fmt(reserved.data)} sub="backing open spins" />
          <Stat label="Free stock" value={fmt(free.data)} sub="available to win" />
          <Stat label="ETH float" value={`Ξ${fmt(ethFloat.data)}`} sub="awaiting restock" />
          <Stat
            label="Your shares"
            value={myShares.data != null ? formatEther(myShares.data) : isConnected ? '…' : '—'}
            sub={
              myShares.data != null && sharePrice.data != null
                ? `≈ ${formatEther((myShares.data * sharePrice.data) / 10n ** 18n)} ${wheel.symbol}`
                : undefined
            }
          />
        </div>
      </div>
    </Section>
  );
}

// ── DemoRoulette — local simulation shown when no wheels are deployed ─────────

function DemoRoulette() {
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');
  const [stake, setStake] = useState(0.01);
  const [bet, setBet] = useState<Bet | null>({ kind: 'red', selection: 0, label: 'Red' });
  const [rotation, setRotation] = useState(0);
  const [ballRotation, setBallRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ win: boolean; x: number; pocket: number } | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const busy = useRef(false);

  const potential = useMemo(() => (bet ? stake * multiplierX(bet.kind) : 0), [bet, stake]);

  function place(b: Bet) {
    if (!spinning) setBet(b);
  }

  function spin() {
    if (busy.current || !bet || stake <= 0) return;
    busy.current = true;
    setResult(null);
    setSpinning(true);

    const landed = Math.floor(Math.random() * POCKETS);
    const idx = WHEEL_ORDER.indexOf(landed);
    const mid = idx * SEG + SEG / 2;
    setRotation((r) => Math.ceil(r / 360) * 360 + 360 * 6 + ((360 - mid) % 360));
    setBallRotation((b) => Math.floor(b / 360) * 360 - 360 * 5);

    window.setTimeout(() => {
      const r = resolve(bet, landed);
      setResult({ ...r, pocket: landed });
      setHistory((h) => [landed, ...h].slice(0, 16));
      setSpinning(false);
      busy.current = false;
    }, 4900);
  }

  const winCell = result && !spinning ? result.pocket : null;

  function NumCell({ n }: { n: number }) {
    const hue = hueOf(n);
    const active = bet?.kind === 'straight' && bet.selection === n;
    const isWin = winCell === n;
    const col = n === 0 ? 1 : Math.ceil(n / 3) + 1;
    const row = n === 0 ? '1 / span 3' : `${n % 3 === 0 ? 1 : n % 3 === 2 ? 2 : 3}`;
    return (
      <button
        onClick={() => place({ kind: 'straight', selection: n, label: n === 0 ? 'Zero' : `Number ${n}` })}
        style={{ gridColumn: String(col), gridRow: row, background: cellBg(hue) }}
        className={`felt-cell relative grid place-items-center rounded-[6px] font-mono text-[13px] font-bold tabular-nums text-white transition-all ${
          isWin ? 'z-20 ring-2 ring-lime shadow-[0_0_18px_2px_rgba(198,242,78,0.55)]' : active ? 'z-10 ring-2 ring-lime' : 'hover:brightness-125'
        }`}
      >
        {n}
        {active ? <ChipMark /> : null}
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
    const bg = tone === 'red' ? C.red : tone === 'black' ? C.black : 'rgba(255,255,255,0.035)';
    return (
      <button
        onClick={() => place(b)}
        style={{ ...style, background: bg }}
        className={`felt-cell relative grid place-items-center rounded-[6px] border border-white/10 px-2 py-2.5 font-mono text-[11px] uppercase tracking-wide text-paper transition-all ${
          active ? 'z-10 ring-2 ring-lime' : 'hover:border-lime/40 hover:brightness-125'
        }`}
      >
        {children}
        {active ? <ChipMark /> : null}
      </button>
    );
  }

  return (
    <Section>
      <style>{`.felt-cell{box-shadow:inset 0 1px 0 rgba(255,255,255,0.08),inset 0 -2px 4px rgba(0,0,0,0.35);}`}</style>
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
          <div className="mt-2 grid grid-cols-3 gap-2">
            {CHIPS.map((v) => (
              <button
                key={v}
                onClick={() => setStake(v)}
                className={`relative aspect-square transition ${
                  stake === v ? 'scale-105 drop-shadow-[0_0_10px_rgba(198,242,78,0.4)]' : 'opacity-80 hover:opacity-100'
                }`}
              >
                <ChipSVG active={stake === v} />
                <span
                  className={`absolute inset-0 grid place-items-center font-mono text-[10px] font-bold ${
                    stake === v ? 'text-black' : 'text-paper'
                  }`}
                >
                  {v}
                </span>
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
            className="mt-4 w-full rounded-xl bg-lime py-3.5 font-mono text-[13px] font-bold uppercase tracking-[0.12em] text-black shadow-[0_0_24px_-4px_rgba(198,242,78,0.6)] transition hover:brightness-110 disabled:opacity-50 disabled:shadow-none"
          >
            {spinning ? 'Spinning…' : mode === 'auto' ? 'Auto — soon' : 'Spin'}
          </button>
        </div>

        {/* ── Wheel + table ── */}
        <div className="panel surface-hero relative overflow-hidden p-5">
          {/* atmospheric glow */}
          <div
            className="pointer-events-none absolute left-1/2 top-4 h-[360px] w-[360px] -translate-x-1/2 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(198,242,78,0.10), transparent 62%)' }}
          />
          <div className="relative flex flex-col items-center gap-4">
            {/* Wheel */}
            <div className="relative w-full max-w-[300px]">
              <div className="aspect-square drop-shadow-[0_16px_40px_rgba(0,0,0,0.55)]">
                <Wheel
                  rotation={rotation}
                  ballRotation={ballRotation}
                  phase={spinning ? 'landing' : 'idle'}
                  landedHue={result ? hueOf(result.pocket) : null}
                />
              </div>
            </div>

            {/* Result badge */}
            <div className="min-h-[52px] w-full max-w-[440px]">
              {result ? (
                <div
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 transition ${
                    result.win
                      ? 'border-lime/60 bg-lime/[0.07] shadow-[0_0_26px_-6px_rgba(198,242,78,0.6)]'
                      : 'border-line bg-black/40'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span
                      className="grid h-8 w-8 place-items-center rounded-lg font-mono text-sm font-bold text-white shadow-inner"
                      style={{ background: cellBg(hueOf(result.pocket)) }}
                    >
                      {result.pocket}
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-wide text-mute">
                      {hueOf(result.pocket)}
                    </span>
                  </span>
                  <span
                    className={`font-mono text-[13px] font-bold uppercase tracking-wide ${
                      result.win ? 'text-lime' : 'text-mute'
                    }`}
                  >
                    {result.win ? `Win · ${(stake * result.x).toFixed(4)} ETH` : 'No win'}
                  </span>
                </div>
              ) : (
                <p className="pt-3 text-center text-[11px] text-dim">Place a chip, then spin.</p>
              )}
            </div>
          </div>

          {/* Betting felt */}
          <div className="relative mt-5 w-full overflow-x-auto rounded-xl border border-white/5 bg-[radial-gradient(circle_at_50%_0%,rgba(47,161,90,0.08),transparent_60%)] p-3">
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
                <OutCell b={{ kind: 'dozen', selection: 0, label: '1st 12' }} style={{ gridColumn: '2 / span 4', gridRow: '4' }}>
                  1 to 12
                </OutCell>
                <OutCell b={{ kind: 'dozen', selection: 1, label: '2nd 12' }} style={{ gridColumn: '6 / span 4', gridRow: '4' }}>
                  13 to 24
                </OutCell>
                <OutCell b={{ kind: 'dozen', selection: 2, label: '3rd 12' }} style={{ gridColumn: '10 / span 4', gridRow: '4' }}>
                  25 to 36
                </OutCell>
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

              {history.length > 0 ? (
                <div className="mt-4 flex items-center gap-2">
                  <span className="label shrink-0">Recent</span>
                  <div className="flex flex-wrap gap-1">
                    {history.map((n, i) => (
                      <span
                        key={`${n}-${i}`}
                        className="grid h-6 w-6 place-items-center rounded font-mono text-[10px] font-bold tabular-nums text-white shadow-inner"
                        style={{ background: cellBg(hueOf(n)) }}
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
  );
}
