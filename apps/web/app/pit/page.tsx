'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { formatEther, parseAbiItem, parseEther, parseEventLogs, type Address } from 'viem';
import { PageHeader, Section, EmptyState, Stat } from '@/components/ui';
import { ChainGuard } from '@/components/ChainGuard';
import { OddsLadder } from '@/components/OddsLadder';
import { RollReel, type ReelPhase, type ReelResult } from '@/components/RollReel';
import { PRIZE_TABLE } from '@/lib/prizeTable';
import { ABIS, readMany, safeRead, useContracts, useRead, type ContractRef } from '@/lib/contracts';
import { useTx } from '@/lib/useTx';
import { isDeployed, PLACEHOLDER } from '@/lib/deployments';
import { fmtUnits, shortAddr } from '@/lib/format';

/**
 * The Pit — machine grid + per-machine controls, fully wired to DegenRoll.
 * Per machine: entropy-health badge, bankroll stats, ticket buy (Instant /
 * Vault lane), open rounds (settle / seal / refund), sell-back, bankroll
 * stake/unstake, restock. Odds table stays static (it mirrors the prize table
 * constant in the contract).
 */

type Machine = { address: Address; stock: Address; symbol: string };

const BOUGHT_EVENT = parseAbiItem(
  'event Bought(uint256 indexed roundId, address indexed player, uint8 lane, uint256 ticketEth, uint256 notional)',
);
const SETTLED_EVENT = parseAbiItem(
  'event Settled(uint256 indexed roundId, address indexed player, uint256 word, uint256 milliX, uint256 prize, bool wasSealed)',
);

function useMachines() {
  const { c, chainId } = useContracts();
  const client = usePublicClient();
  return useQuery({
    queryKey: ['pitMachines', chainId],
    enabled: Boolean(client && isDeployed(c.degenRollFactory.address)),
    refetchInterval: 60_000,
    queryFn: async (): Promise<Machine[]> => {
      const count = (await safeRead(client, c.degenRollFactory, 'machineCount')) as bigint | null;
      if (count == null || count === 0n) return [];
      const n = Number(count);
      const addrCalls = Array.from({ length: n }, (_, i) => ({
        address: c.degenRollFactory.address,
        abi: c.degenRollFactory.abi,
        functionName: 'allMachines',
        args: [BigInt(i)] as const,
      }));
      const addrs = (await readMany(client, addrCalls)).filter(
        (a): a is Address => typeof a === 'string',
      );
      const stocks = (await readMany(
        client,
        addrs.map((a) => ({ address: a, abi: ABIS.degenRoll, functionName: 'stock' })),
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

function EntropyBadge({ machine }: { machine: ContractRef }) {
  const conductor = useRead<Address>({ contract: machine, functionName: 'conductor' });
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

export default function PitPage() {
  const { c } = useContracts();
  const machines = useMachines();
  const [selected, setSelected] = useState<Address | null>(null);
  const [ticket, setTicket] = useState('0.01');

  const list = machines.data ?? [];
  const machine = list.find((m) => m.address === selected) ?? list[0] ?? null;
  const ticketNum = Number(ticket) || 0;

  return (
    <ChainGuard>
      <PageHeader
        eyebrow="The Pit"
        title="Pick a machine."
        emphasis="Pull it."
        lede="Buy a ticket, choose a lane, roll. Every outcome maps from a landed entropy word by a pure function you can recompute."
      />

      {!isDeployed(c.degenRollFactory.address) || (!machines.isLoading && list.length === 0) ? (
        <DemoPit ticket={ticket} setTicket={setTicket} ticketNum={ticketNum} />
      ) : (
        <>
          <Section label="Machines" title="The" emphasis="grid.">
            {machines.isLoading ? (
              <p className="data text-sm text-mute">Loading machines…</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {list.map((m, idx) => (
                  <CabinetTile
                    key={m.address}
                    m={m}
                    idx={idx}
                    active={machine != null && m.address === machine.address}
                    onSelect={() => setSelected(m.address)}
                  />
                ))}
              </div>
            )}
          </Section>

          {machine ? (
            <MachinePanels machine={machine} ticket={ticket} setTicket={setTicket} ticketNum={ticketNum} />
          ) : null}
        </>
      )}
    </ChainGuard>
  );
}

/* ------------------------------------------------------------- demo floor */

/**
 * The casino floor, simulated. Renders whenever no machines exist on the
 * connected chain: same cabinets, reel and board as the live floor, with
 * rolls drawn locally at the real prize-table odds. Flagged DEMO throughout;
 * the real floor replaces it automatically once deployments land.
 */
type DemoMachine = { symbol: string; name: string; bank: string; free: number; boss: number };

const DEMO_MACHINES: DemoMachine[] = [
  { symbol: 'NVDA', name: 'Nvidia', bank: '412,000', free: 61, boss: 2 },
  { symbol: 'TSLA', name: 'Tesla', bank: '268,500', free: 44, boss: 5 },
  { symbol: 'GME', name: 'GameStop', bank: '97,400', free: 27, boss: 8 },
  { symbol: 'AAPL', name: 'Apple', bank: '154,200', free: 52, boss: 4 },
];

const DEMO_SEED = [
  { id: 4521, milliX: 10000, prizeText: 'Ξ0.1000 of NVDA' },
  { id: 888, milliX: 1500, prizeText: 'Ξ0.0150 of TSLA' },
  { id: 2047, milliX: 750, prizeText: 'Ξ0.0075 of GME' },
  { id: 1312, milliX: 25000, prizeText: 'Ξ0.2500 of NVDA' },
  { id: 3690, milliX: 2000, prizeText: 'Ξ0.0200 of TSLA' },
  { id: 117, milliX: 700, prizeText: 'Ξ0.0070 of AAPL' },
  { id: 2999, milliX: 5000, prizeText: 'Ξ0.0500 of GME' },
  { id: 666, milliX: 50000, prizeText: 'Ξ0.5000 of TSLA' },
];

/** Sample a prize-table row at its real odds. */
function demoDraw(): number {
  let r = Math.random() * 100;
  for (let i = 0; i < PRIZE_TABLE.length; i++) {
    r -= PRIZE_TABLE[i].oddsPct;
    if (r < 0) return i;
  }
  return 0;
}

function DemoPit({
  ticket,
  setTicket,
  ticketNum,
}: {
  ticket: string;
  setTicket: (v: string) => void;
  ticketNum: number;
}) {
  const [sel, setSel] = useState(0);
  const [lane, setLane] = useState<0 | 1>(0);
  const [phase, setPhase] = useState<ReelPhase>('idle');
  const [result, setResult] = useState<ReelResult>(null);
  const [feed, setFeed] = useState(DEMO_SEED);
  const dm = DEMO_MACHINES[sel];

  function selectMachine(i: number) {
    setSel(i);
    setPhase('idle');
    setResult(null);
  }

  function pull() {
    if (phase === 'spinning') return;
    setPhase('spinning');
    const sym = dm.symbol;
    const t = ticketNum || 0.01;
    setTimeout(() => {
      const i = demoDraw();
      const milliX = Math.round(PRIZE_TABLE[i].multiplier * 1000);
      const prizeText = `Ξ${(t * PRIZE_TABLE[i].multiplier).toFixed(4)} of ${sym}`;
      setResult({ milliX, prizeText });
      setPhase('landed');
      setFeed((f) =>
        [{ id: 1000 + Math.floor(Math.random() * 8999), milliX, prizeText }, ...f].slice(0, 14),
      );
    }, 1400);
  }

  const items = [...feed, ...feed];

  return (
    <>
      <Section label="Machines" title="The" emphasis="floor.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DEMO_MACHINES.map((m, i) => (
            <button
              key={m.symbol}
              onClick={() => selectMachine(i)}
              className={`card shine relative overflow-hidden text-left transition-colors ${
                i === sel ? 'border-limeSoft' : 'hover:border-lime/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="headline text-lg">{m.symbol}</p>
                <span className="data inline-flex items-center gap-1.5 rounded-full border border-lime/40 px-2 py-1 text-[11px] text-lime">
                  <span className="h-1.5 w-1.5 animate-dot rounded-full bg-acid" />
                  live
                </span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/bosses/${m.boss}.png`}
                  alt={`PitBoss #${m.boss}`}
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-lg border border-line [image-rendering:pixelated]"
                />
                <div>
                  <p className="eyebrow">pit boss on duty</p>
                  <p className="data mt-0.5 text-xs text-mute">
                    Boss #{m.boss} · earns 2.5% of the action
                  </p>
                </div>
              </div>
              <div className="mt-3.5">
                <div className="eyebrow flex justify-between">
                  <span>bankroll</span>
                  <span className="num">
                    {m.bank} {m.symbol}
                  </span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/60">
                  <div
                    className="h-full bg-gradient-to-r from-lime to-gold"
                    style={{ width: `${m.free}%` }}
                  />
                </div>
                <p className="eyebrow mt-1.5">{m.free}% free to win</p>
              </div>
              <p className="data mt-3 text-xs text-mute">{m.name} · machine {i + 1}</p>
            </button>
          ))}
        </div>
      </Section>

      <Section label={`${dm.symbol} Pit`} title="Pull the" emphasis="machine.">
        <div className="mb-5 overflow-hidden rounded-xl border border-line bg-lime/[0.03]">
          <div className="flex w-max gap-10 whitespace-nowrap px-4 py-2 animate-ticker">
            {items.map((r, i) => {
              const cls =
                r.milliX >= 15000 ? 'text-gold' : r.milliX >= 1000 ? 'text-acid' : 'text-mute';
              return (
                <span key={i} className={`data text-xs ${cls}`}>
                  round #{r.id} pulled {(r.milliX / 1000).toFixed(2)}× · +{r.prizeText}
                </span>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="surface-hero p-5">
            <div className="flex items-center justify-between">
              <p className="headline text-[14px]">{dm.symbol} · machine</p>
              <span className="data inline-flex items-center gap-1.5 rounded-full border border-lime/40 px-2 py-1 text-[11px] text-lime">
                <span className="h-1.5 w-1.5 animate-dot rounded-full bg-acid" />
                live
              </span>
            </div>

            <div className="mt-4">
              <RollReel phase={phase} result={result} />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {([0, 1] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLane(l)}
                  className={`rounded-xl border px-4 py-3 text-sm ${
                    lane === l ? 'border-lime text-lime' : 'border-line text-mute hover:text-paper'
                  }`}
                >
                  {l === 0 ? 'Instant' : 'Vault'} lane
                </button>
              ))}
            </div>

            <label className="mt-4 block">
              <span className="eyebrow">Ticket size (ETH)</span>
              <input
                value={ticket}
                onChange={(e) => setTicket(e.target.value)}
                inputMode="decimal"
                className="data mt-1 w-full rounded-xl border border-line bg-black/40 px-4 py-3 text-sm"
              />
            </label>

            <button
              onClick={pull}
              disabled={phase === 'spinning'}
              className="pill-lime mt-4 w-full disabled:opacity-50"
            >
              {phase === 'spinning' ? 'Rolling…' : 'Pull the machine'}
            </button>
            <p className="eyebrow mt-3">real odds · provably fair · no wallet needed</p>
          </div>

          <div>
            <p className="eyebrow mb-3">The board · 21 rungs · one in a thousand hits 50×</p>
            <OddsLadder
              ticket={ticketNum || undefined}
              lockIndex={phase !== 'spinning' ? lockIndexFor(result?.milliX) : null}
            />
          </div>
        </div>
      </Section>
    </>
  );
}

/* -------------------------------------------------------------- cabinets */

/** Machine tile as a slot cabinet: marquee, boss on duty, bankroll meter. */
function CabinetTile({
  m,
  idx,
  active,
  onSelect,
}: {
  m: Machine;
  idx: number;
  active: boolean;
  onSelect: () => void;
}) {
  const ref: ContractRef = useMemo(() => ({ address: m.address, abi: ABIS.degenRoll }), [m.address]);
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
        <p className="headline text-lg">{m.symbol}</p>
        <EntropyBadge machine={ref} />
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
            {total.data != null ? fmtUnits(total.data) : '…'} {m.symbol}
          </span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/60">
          <div
            className="h-full bg-gradient-to-r from-lime to-gold transition-all duration-700"
            style={{ width: `${pct ?? 0}%` }}
          />
        </div>
        {/* "free" = bankroll not reserved against open bets, i.e. what a new bet
            can actually win right now. The bare percentage read as a win chance. */}
        <p className="eyebrow mt-1.5">
          {free.data != null ? `${fmtUnits(free.data)} available to win` : '…'}
        </p>
      </div>
      <p className="data mt-3 text-xs text-mute">{shortAddr(m.address)}</p>
    </button>
  );
}

/* ------------------------------------------------------------ win ticker */

function useRecentRolls(machine: Address) {
  const { chainId } = useContracts();
  const client = usePublicClient();
  return useQuery({
    queryKey: ['pitRecent', chainId, machine],
    enabled: Boolean(client),
    refetchInterval: 30_000,
    queryFn: async () => {
      const logs = await client!.getLogs({ address: machine, event: SETTLED_EVENT, fromBlock: 0n });
      return logs
        .slice(-14)
        .reverse()
        .map((l) => ({
          roundId: l.args.roundId ?? 0n,
          milliX: Number(l.args.milliX ?? 0n),
          prize: l.args.prize ?? 0n,
        }));
    },
  });
}

/** Streams recent settles across the marquee — the winner board at the door. */
function WinTicker({ machine }: { machine: Machine }) {
  const q = useRecentRolls(machine.address);
  const rolls = q.data ?? [];
  if (rolls.length === 0) return null;
  const items = [...rolls, ...rolls];
  return (
    <div className="mb-5 overflow-hidden rounded-xl border border-line bg-lime/[0.03]">
      <div className="flex w-max gap-10 whitespace-nowrap px-4 py-2 animate-ticker">
        {items.map((r, i) => {
          const cls =
            r.milliX >= 15000 ? 'text-gold' : r.milliX >= 1000 ? 'text-acid' : 'text-mute';
          return (
            <span key={i} className={`data text-xs ${cls}`}>
              round #{r.roundId.toString()} pulled {(r.milliX / 1000).toFixed(2)}× · +
              {Number(formatEther(r.prize)).toFixed(3)} {machine.symbol}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ per machine */

const lockIndexFor = (milliX: number | null | undefined) =>
  milliX == null ? null : PRIZE_TABLE.findIndex((r) => Math.round(r.multiplier * 1000) === milliX);

function MachinePanels({
  machine,
  ticket,
  setTicket,
  ticketNum,
}: {
  machine: Machine;
  ticket: string;
  setTicket: (v: string) => void;
  ticketNum: number;
}) {
  const ref: ContractRef = useMemo(
    () => ({ address: machine.address, abi: ABIS.degenRoll }),
    [machine.address],
  );
  const rounds = useMyRounds(machine.address);
  const [phase, setPhase] = useState<ReelPhase>('idle');
  const [live, setLive] = useState<ReelResult>(null);

  // Reset the reel when switching machines.
  useEffect(() => {
    setPhase('idle');
    setLive(null);
  }, [machine.address]);

  const last = rounds.data?.lastSettled ?? null;
  const result: ReelResult =
    live ??
    (last
      ? {
          milliX: Number(last.milliX),
          prizeText: `${Number(formatEther(last.prize)).toFixed(4)} ${machine.symbol}`,
        }
      : null);

  return (
    <>
      <TicketSection
        machine={machine}
        m={ref}
        ticket={ticket}
        setTicket={setTicket}
        ticketNum={ticketNum}
        phase={phase}
        result={result}
      />
      <BankrollSection machine={machine} m={ref} />
      <OpenRoundsSection
        machine={machine}
        m={ref}
        q={rounds}
        onSpin={() => setPhase('spinning')}
        onLand={(r) => {
          setLive(r);
          setPhase('landed');
        }}
        onAbort={() => setPhase('idle')}
      />
    </>
  );
}

function TicketSection({
  machine,
  m,
  ticket,
  setTicket,
  ticketNum,
  phase,
  result,
}: {
  machine: Machine;
  m: ContractRef;
  ticket: string;
  setTicket: (v: string) => void;
  ticketNum: number;
  phase: ReelPhase;
  result: ReelResult;
}) {
  const { isConnected, address } = useAccount();
  const { c } = useContracts();
  const { send, approveIfNeeded, busy } = useTx();
  const [lane, setLane] = useState<0 | 1>(0);
  const [sellAmt, setSellAmt] = useState('');

  const maxUsd = useRead<bigint>({ contract: m, functionName: 'INSTANT_MAX_USD' });
  const usdPerEth = useRead<bigint>({
    contract: c.oracle,
    functionName: 'usdPerEth',
    refetchInterval: 30_000,
  });
  const streak = useRead<bigint>({
    contract: m,
    functionName: 'streakCount',
    args: address ? [address] : undefined,
    enabled: Boolean(address),
  });

  let ticketWei: bigint | null = null;
  try {
    ticketWei = parseEther(ticket as `${number}`);
  } catch {
    ticketWei = null;
  }

  // Instant-lane $100 cap, validated via the oracle when available.
  const capEth =
    maxUsd.data != null && usdPerEth.data != null && usdPerEth.data > 0n
      ? (maxUsd.data * 10n ** 18n) / usdPerEth.data
      : null;
  const overCap = lane === 0 && capEth != null && ticketWei != null && ticketWei > capEth;

  async function onBuy() {
    if (ticketWei == null || ticketWei === 0n) return;
    await send(
      { address: m.address, abi: m.abi, functionName: 'buy', args: [lane], value: ticketWei },
      { title: `Buy ticket · ${lane === 0 ? 'Instant' : 'Vault'}` },
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
    const ok = await approveIfNeeded(machine.stock, address, m.address, amt);
    if (!ok) return;
    await send(
      { address: m.address, abi: m.abi, functionName: 'sellBack', args: [amt] },
      { title: `Sell back ${sellAmt} ${machine.symbol}` },
    );
  }

  return (
    <Section label={`${machine.symbol} Pit`} title="Buy a" emphasis="ticket.">
      <WinTicker machine={machine} />
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="surface-hero p-5">
          <div className="flex items-center justify-between">
            <p className="headline text-[14px]">{machine.symbol} · machine</p>
            <EntropyBadge machine={m} />
          </div>

          <div className="mt-4">
            <RollReel phase={phase} result={result} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {([0, 1] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLane(l)}
                className={`rounded-xl border px-4 py-3 text-sm ${
                  lane === l ? 'border-lime text-lime' : 'border-line text-mute hover:text-paper'
                }`}
              >
                {l === 0 ? 'Instant' : 'Vault'} lane
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-mute">
            {lane === 0
              ? `Instant: short delay, settles against the bankroll.${
                  capEth != null ? ` Capped at ~Ξ${formatEther(capEth)} (≈$${maxUsd.data != null ? formatEther(maxUsd.data) : '100'}).` : ''
                }`
              : 'Vault: escrowed roll — settle, seal into a certificate, or refund later.'}
          </p>

          <label className="mt-4 block">
            <span className="eyebrow">Ticket size (ETH)</span>
            <input
              value={ticket}
              onChange={(e) => setTicket(e.target.value)}
              inputMode="decimal"
              className="data mt-1 w-full rounded-xl border border-line bg-black/40 px-4 py-3 text-sm"
            />
          </label>
          {overCap ? (
            <p className="mt-2 text-xs text-red-300">
              Over the instant-lane cap — use the Vault lane or shrink the ticket.
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={onBuy}
              disabled={!isConnected || busy || ticketWei == null || ticketWei === 0n || overCap}
              className="pill-lime disabled:opacity-50"
            >
              {isConnected ? 'Pull the machine' : 'Connect to play'}
            </button>
          </div>
          {streak.data != null && streak.data > 0n ? (
            <p className="data mt-3 text-xs text-mute">
              Loss streak: {streak.data.toString()} — rebate certificate mints on a full streak.
            </p>
          ) : null}

          <div className="mt-5 rounded-xl border border-line bg-black/40 p-4">
            <p className="eyebrow">Sell back {machine.symbol}</p>
            <p className="mt-1 text-xs text-mute">
              Sell stock back to the machine for ETH at the sell-back rate.
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
        </div>

        <div>
          <p className="eyebrow mb-3">The board · 21 rungs · one in a thousand hits 50×</p>
          <OddsLadder
            ticket={ticketNum || undefined}
            lockIndex={phase !== 'spinning' ? lockIndexFor(result?.milliX) : null}
          />
        </div>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- bankroll */

function BankrollSection({ machine, m }: { machine: Machine; m: ContractRef }) {
  const { isConnected, address } = useAccount();
  const { send, approveIfNeeded, busy } = useTx();
  const [bossId, setBossId] = useState('');
  const [stakeAmt, setStakeAmt] = useState('');
  const [unstakeAmt, setUnstakeAmt] = useState('');

  const totalStock = useRead<bigint>({ contract: m, functionName: 'totalBankrollStock', refetchInterval: 15_000 });
  const reserved = useRead<bigint>({ contract: m, functionName: 'totalReserved', refetchInterval: 15_000 });
  const free = useRead<bigint>({ contract: m, functionName: 'freeStock', refetchInterval: 15_000 });
  const sharePrice = useRead<bigint>({ contract: m, functionName: 'sharePrice', refetchInterval: 15_000 });
  const ethFloat = useRead<bigint>({ contract: m, functionName: 'ethFloat', refetchInterval: 15_000 });
  const myShares = useRead<bigint>({
    contract: m,
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
    const ok = await approveIfNeeded(machine.stock, address, m.address, amt);
    if (!ok) return;
    await send(
      {
        address: m.address,
        abi: m.abi,
        functionName: 'stakeBankroll',
        args: [BigInt(bossId.trim()), amt],
      },
      { title: `Stake ${stakeAmt} ${machine.symbol}` },
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
      { address: m.address, abi: m.abi, functionName: 'unstake', args: [sharesIn] },
      { title: 'Unstake bankroll' },
    );
  }

  const fmt = (v: bigint | undefined) => (v == null ? '…' : formatEther(v));

  return (
    <Section label="Bankroll" title="Be the" emphasis="house.">
      <div id="bankroll" className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="card">
          <div className="flex items-center justify-between">
            <p className="headline text-[14px]">Stake · {machine.symbol}</p>
            <span className="data text-sm text-lime">
              share Ξ{sharePrice.data != null ? formatEther(sharePrice.data) : '…'}
            </span>
          </div>
          <p className="mt-2 text-sm text-mute">
            Take the other side of every roll on this machine. Staking requires an activated Boss id
            — it earns streak points for the stake.
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
              placeholder={`Stake ${machine.symbol}`}
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
          <div className="mt-3">
            <button
              onClick={() =>
                send(
                  { address: m.address, abi: m.abi, functionName: 'restock' },
                  { title: 'Restock machine' },
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
          <Stat label="Bankroll stock" value={fmt(totalStock.data)} sub={machine.symbol} />
          <Stat label="Reserved" value={fmt(reserved.data)} sub="backing open rounds" />
          <Stat label="Free stock" value={fmt(free.data)} sub="available to win" />
          <Stat label="ETH float" value={`Ξ${fmt(ethFloat.data)}`} sub="awaiting restock" />
          <Stat
            label="Your shares"
            value={myShares.data != null ? formatEther(myShares.data) : isConnected ? '…' : '—'}
            sub={
              myShares.data != null && sharePrice.data != null
                ? `≈ ${formatEther((myShares.data * sharePrice.data) / 10n ** 18n)} ${machine.symbol}`
                : undefined
            }
          />
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------- open rounds */

type Round = {
  roundId: bigint;
  lane: number;
  ticketEth: bigint;
  escrowEth: bigint;
  notional: bigint;
  readyAt: bigint;
  status: number;
};

// Mirrors DegenRoll.Status — Open = 0, Settled = 1, Refunded = 2.
const ROUND_STATUS = ['open', 'settled', 'refunded'] as const;

function useMyRounds(machine: Address) {
  const { address } = useAccount();
  const { chainId } = useContracts();
  const client = usePublicClient();
  return useQuery({
    queryKey: ['pitRounds', chainId, machine, address ?? '0x0'],
    enabled: Boolean(client && address),
    refetchInterval: 15_000,
    queryFn: async (): Promise<{ rounds: Round[]; lastSettled: { milliX: bigint; prize: bigint } | null }> => {
      const logs = await client!.getLogs({
        address: machine,
        event: BOUGHT_EVENT,
        args: { player: address! },
        fromBlock: 0n,
      });
      const ids = logs
        .map((l) => l.args.roundId)
        .filter((id): id is bigint => id != null);
      const states = (await readMany(
        client,
        ids.map((id) => ({
          address: machine,
          abi: ABIS.degenRoll,
          functionName: 'rounds',
          args: [id] as const,
        })),
      )) as (readonly unknown[] | null)[];
      const rounds: Round[] = ids.map((id, i) => {
        const s = states[i];
        const log = logs[i];
        return {
          roundId: id,
          lane: Number(log.args.lane ?? 0),
          ticketEth: (log.args.ticketEth as bigint | undefined) ?? 0n,
          escrowEth: (s?.[1] as bigint | undefined) ?? 0n,
          notional: (s?.[2] as bigint | undefined) ?? 0n,
          readyAt: (s?.[5] as bigint | undefined) ?? 0n,
          status: Number((s?.[7] as number | bigint | undefined) ?? 0),
        };
      });

      let lastSettled: { milliX: bigint; prize: bigint } | null = null;
      try {
        const settled = await client!.getLogs({
          address: machine,
          event: SETTLED_EVENT,
          args: { player: address! },
          fromBlock: 0n,
        });
        const last = settled[settled.length - 1];
        if (last?.args.milliX != null) {
          lastSettled = { milliX: last.args.milliX, prize: last.args.prize ?? 0n };
        }
      } catch {
        lastSettled = null;
      }
      return { rounds: rounds.reverse(), lastSettled };
    },
  });
}

function OpenRoundsSection({
  machine,
  m,
  q,
  onSpin,
  onLand,
  onAbort,
}: {
  machine: Machine;
  m: ContractRef;
  q: ReturnType<typeof useMyRounds>;
  onSpin: () => void;
  onLand: (r: NonNullable<ReelResult>) => void;
  onAbort: () => void;
}) {
  const { isConnected } = useAccount();
  const { send, busy } = useTx();
  const now = Math.floor(Date.now() / 1000);

  const rounds = q.data?.rounds ?? [];
  const open = rounds.filter((r) => r.status === 0); // Status.Open

  /** Send settle/seal, spinning the reel and locking it onto the receipt's Settled event. */
  async function settleWithReel(fn: 'settle' | 'sealIntoCertificate', roundId: bigint) {
    onSpin();
    const receipt = await send(
      { address: m.address, abi: m.abi, functionName: fn, args: [roundId] },
      { title: `${fn === 'settle' ? 'Settle' : 'Seal'} #${roundId.toString()}` },
    );
    if (!receipt) {
      onAbort();
      return;
    }
    try {
      const [ev] = parseEventLogs({ abi: [SETTLED_EVENT], logs: receipt.logs });
      if (ev?.args.milliX != null) {
        onLand({
          milliX: Number(ev.args.milliX),
          prizeText: `${Number(formatEther(ev.args.prize ?? 0n)).toFixed(4)} ${machine.symbol}`,
        });
        return;
      }
    } catch {
      // fall through — reads refetch anyway
    }
    onAbort();
  }

  return (
    <Section label="Open rounds" title="In" emphasis="flight.">
      {!isConnected ? (
        <EmptyState
          title="Connect to see your rounds"
          hint="Vault-lane rolls awaiting entropy settlement appear here. Instant rolls settle after a short delay."
        />
      ) : q.isLoading ? (
        <p className="data text-sm text-mute">Scanning rounds…</p>
      ) : open.length === 0 ? (
        <EmptyState
          title="No open rounds"
          hint="Rolls awaiting settlement appear here with settle, seal and refund controls. Buy a ticket above to start one."
        />
      ) : (
        <div className="grid gap-3">
          {open.map((r) => {
            const ready = Number(r.readyAt) <= now;
            return (
              <div key={r.roundId.toString()} className="card">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="data text-sm">
                      Round #{r.roundId.toString()} · {r.lane === 0 ? 'Instant' : 'Vault'} · Ξ
                      {formatEther(r.ticketEth)}
                    </p>
                    <p className="mt-1 text-xs text-mute">
                      status {ROUND_STATUS[r.status] ?? r.status} ·{' '}
                      {ready
                        ? 'entropy ready'
                        : `ready in ${Math.max(0, Number(r.readyAt) - now)}s`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => settleWithReel('settle', r.roundId)}
                      disabled={busy || !ready}
                      className="pill-lime disabled:opacity-50"
                    >
                      Settle · roll it
                    </button>
                    <button
                      onClick={() => settleWithReel('sealIntoCertificate', r.roundId)}
                      disabled={busy || !ready}
                      className="pill-ghost disabled:opacity-50"
                    >
                      Seal into certificate
                    </button>
                    <button
                      onClick={() =>
                        send(
                          { address: m.address, abi: m.abi, functionName: 'refund', args: [r.roundId] },
                          { title: `Refund #${r.roundId.toString()}` },
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
