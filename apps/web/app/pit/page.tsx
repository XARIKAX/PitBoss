'use client';

import { useMemo, useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { formatEther, parseAbiItem, parseEther, type Address } from 'viem';
import { PageHeader, Section, EmptyState, Stat } from '@/components/ui';
import { ChainGuard } from '@/components/ChainGuard';
import { OddsTable } from '@/components/OddsTable';
import { ABIS, readMany, safeRead, useContracts, useRead, type ContractRef } from '@/lib/contracts';
import { useTx } from '@/lib/useTx';
import { isDeployed, PLACEHOLDER } from '@/lib/deployments';
import { shortAddr } from '@/lib/format';

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

      {/* MACHINE GRID */}
      <Section label="Machines" title="The" emphasis="grid.">
        {!isDeployed(c.degenRollFactory.address) ? (
          <EmptyState
            title="Not deployed"
            hint="The DegenRollFactory has no address on this chain yet. Machines appear here once deployments land."
          />
        ) : machines.isLoading ? (
          <p className="data text-sm text-mute">Loading machines…</p>
        ) : list.length === 0 ? (
          <EmptyState
            title="No machines yet"
            hint="No DegenRoll machines have been created on this chain. The factory is live — machines show here the moment one exists."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {list.map((m) => {
              const active = machine != null && m.address === machine.address;
              return (
                <button
                  key={m.address}
                  onClick={() => setSelected(m.address)}
                  className={`card text-left transition-colors ${active ? 'border-lime' : 'hover:border-lime/40'}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="data text-sm">{m.symbol}</p>
                    <EntropyBadge machine={{ address: m.address, abi: ABIS.degenRoll }} />
                  </div>
                  <p className="headline mt-3 text-xl">{m.symbol} Pit</p>
                  <p className="data mt-2 text-xs text-mute">{shortAddr(m.address)}</p>
                </button>
              );
            })}
          </div>
        )}
      </Section>

      {machine ? (
        <MachinePanels machine={machine} ticket={ticket} setTicket={setTicket} ticketNum={ticketNum} />
      ) : (
        <Section label="Odds" title="The" emphasis="table.">
          <OddsTable ticket={ticketNum} />
        </Section>
      )}
    </ChainGuard>
  );
}

/* ------------------------------------------------------------ per machine */

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
  return (
    <>
      <TicketSection machine={machine} m={ref} ticket={ticket} setTicket={setTicket} ticketNum={ticketNum} />
      <BankrollSection machine={machine} m={ref} />
      <OpenRoundsSection machine={machine} m={ref} />
    </>
  );
}

function TicketSection({
  machine,
  m,
  ticket,
  setTicket,
  ticketNum,
}: {
  machine: Machine;
  m: ContractRef;
  ticket: string;
  setTicket: (v: string) => void;
  ticketNum: number;
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
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="card">
          <div className="flex items-center justify-between">
            <p className="headline text-[14px]">Ticket</p>
            <EntropyBadge machine={m} />
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
          <p className="eyebrow mb-3">Live odds · payout on {ticketNum || 0} ETH ticket</p>
          <OddsTable ticket={ticketNum} />
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

const ROUND_STATUS = ['none', 'open', 'settled', 'refunded'] as const;

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

function OpenRoundsSection({ machine, m }: { machine: Machine; m: ContractRef }) {
  const { isConnected } = useAccount();
  const { send, busy } = useTx();
  const q = useMyRounds(machine.address);
  const now = Math.floor(Date.now() / 1000);

  const rounds = q.data?.rounds ?? [];
  const open = rounds.filter((r) => r.status === 1);
  const last = q.data?.lastSettled ?? null;

  return (
    <Section label="Open rounds" title="In" emphasis="flight.">
      {last ? (
        <div className="mb-4 rounded-xl border border-line bg-black/40 p-5 text-center">
          <p className="eyebrow">Last roll</p>
          <p className={`data mt-2 text-4xl ${last.milliX >= 1000n ? 'text-lime' : 'text-paper'}`}>
            {(Number(last.milliX) / 1000).toFixed(3)}×
          </p>
          <p className="data mt-1 text-xs text-mute">
            prize {formatEther(last.prize)} {machine.symbol}
          </p>
        </div>
      ) : null}

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
                      onClick={() =>
                        send(
                          { address: m.address, abi: m.abi, functionName: 'settle', args: [r.roundId] },
                          { title: `Settle #${r.roundId.toString()}` },
                        )
                      }
                      disabled={busy || !ready}
                      className="pill-lime disabled:opacity-50"
                    >
                      Settle
                    </button>
                    <button
                      onClick={() =>
                        send(
                          {
                            address: m.address,
                            abi: m.abi,
                            functionName: 'sealIntoCertificate',
                            args: [r.roundId],
                          },
                          { title: `Seal #${r.roundId.toString()}` },
                        )
                      }
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
