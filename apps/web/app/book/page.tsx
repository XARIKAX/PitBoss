'use client';

import { useEffect, useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { formatEther, parseAbiItem } from 'viem';
import { PageHeader, Section, EmptyState } from '@/components/ui';
import { ChainGuard } from '@/components/ChainGuard';
import { DemoBanner, BossFace, SimBadge } from '@/components/demo';
import { LedBar } from '@/components/viz';
import { readMany, useContracts, useRead } from '@/lib/contracts';
import { useTx } from '@/lib/useTx';
import { isDeployed } from '@/lib/deployments';
import { shortAddr } from '@/lib/format';
import { explorerTx } from '@/config/chains';

/**
 * The House Book dashboard — live reads of HouseBook.
 * - Per-source accrual (accruedBySource 0..5)
 * - Bar fill vs crank threshold
 * - Crank button + tip estimate (bar * crankTipBps / 10000)
 * - Payout history from Cranked events
 */
const SOURCES = [
  { key: 'PitEdge', label: 'Pit edge' },
  { key: 'CertFees', label: 'Certificate fees' },
  { key: 'LauncherFees', label: 'Launcher fees' },
  { key: 'LockerFees', label: 'Locker fees' },
  { key: 'LoanInterest', label: 'Loan interest' },
  { key: 'AmmFees', label: 'AMM fees' },
] as const;

const CRANKED_EVENT = parseAbiItem(
  'event Cranked(address indexed cranker, uint256 pot, uint256 tip)',
);

function useSourceAccruals() {
  const { c, chainId } = useContracts();
  const client = usePublicClient();
  return useQuery({
    queryKey: ['bookSources', chainId],
    enabled: Boolean(client && isDeployed(c.houseBook.address)),
    refetchInterval: 15_000,
    queryFn: async (): Promise<(bigint | null)[]> => {
      const res = await readMany(
        client,
        SOURCES.map((_, i) => ({
          address: c.houseBook.address,
          abi: c.houseBook.abi,
          functionName: 'accruedBySource',
          args: [i] as const,
        })),
      );
      return res.map((r) => (typeof r === 'bigint' ? r : null));
    },
  });
}

function useCrankHistory() {
  const { c, chainId } = useContracts();
  const client = usePublicClient();
  return useQuery({
    queryKey: ['bookCranks', chainId],
    enabled: Boolean(client && isDeployed(c.houseBook.address)),
    refetchInterval: 30_000,
    queryFn: async () => {
      const logs = await client!.getLogs({
        address: c.houseBook.address,
        event: CRANKED_EVENT,
        fromBlock: 0n,
      });
      return logs
        .slice(-20)
        .reverse()
        .map((l) => ({
          cranker: l.args.cranker,
          pot: l.args.pot ?? 0n,
          tip: l.args.tip ?? 0n,
          hash: l.transactionHash,
          block: l.blockNumber,
        }));
    },
  });
}

export default function BookPage() {
  const { isConnected } = useAccount();
  const { c, chainId } = useContracts();
  const { send, busy } = useTx();

  const bar = useRead<bigint>({ contract: c.houseBook, functionName: 'bar', refetchInterval: 15_000 });
  const owed = useRead<bigint>({ contract: c.houseBook, functionName: 'owed', refetchInterval: 15_000 });
  const threshold = useRead<bigint>({ contract: c.houseBook, functionName: 'crankThreshold' });
  const tipBps = useRead<number>({ contract: c.houseBook, functionName: 'crankTipBps' });
  const sources = useSourceAccruals();
  const history = useCrankHistory();

  const deployed = isDeployed(c.houseBook.address);
  const tip =
    bar.data != null && tipBps.data != null ? (bar.data * BigInt(tipBps.data)) / 10_000n : null;
  const fillPct =
    bar.data != null && threshold.data != null && threshold.data > 0n
      ? Math.min(100, Number((bar.data * 10_000n) / threshold.data) / 100)
      : 0;
  const crankReady = bar.data != null && threshold.data != null && bar.data >= threshold.data;

  const accruals = sources.data ?? [];
  const maxAccrued = accruals.reduce<bigint>((mx, v) => (v != null && v > mx ? v : mx), 0n);

  return (
    <ChainGuard>
      <PageHeader
        eyebrow="The House Book"
        title="Where the edge"
        emphasis="accrues."
        lede="Six sources feed one book. Anyone can crank the payout and take a tip for doing it. Fully onchain, fully public."
      />

      {!deployed ? (
        <DemoBook />
      ) : (
        <>
          {/* TOTAL + CRANK */}
          <Section label="The Book" title="One" emphasis="ledger.">
            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div className="surface-hero p-5">
                <p className="eyebrow">Bar (undistributed edge)</p>
                <p className={`stat-display mt-3 ${crankReady ? 'is-gold' : ''}`}>
                  {bar.data != null ? `Ξ${formatEther(bar.data)}` : '…'}
                </p>
                <div className="mt-5">
                  <div className="flex items-center justify-between text-xs text-mute">
                    <span className="data">bar fill</span>
                    <span className={`data ${crankReady ? 'text-gold' : 'text-lime'}`}>
                      {fillPct.toFixed(1)}% of Ξ
                      {threshold.data != null ? formatEther(threshold.data) : '…'}
                    </span>
                  </div>
                  <LedBar pct={fillPct} className="mt-2.5" />
                </div>
                <p className="mt-3 text-xs text-mute">
                  Owed to bosses: {owed.data != null ? `Ξ${formatEther(owed.data)}` : '…'}
                </p>
              </div>

              <div className="card flex flex-col justify-between">
                <div>
                  <p className="headline text-[14px]">Crank the payout</p>
                  <p className="mt-2 text-sm text-mute">
                    Push the bar out to active bosses by floor weight. You keep{' '}
                    {tipBps.data != null ? `${(tipBps.data / 100).toFixed(2)}%` : 'a tip'} for the
                    gas and the effort.
                  </p>
                </div>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-mute">Est. tip</span>
                    <span className="data text-lime">
                      {tip != null ? `Ξ${formatEther(tip)}` : '…'}
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      send(
                        {
                          address: c.houseBook.address,
                          abi: c.houseBook.abi,
                          functionName: 'crank',
                        },
                        { title: 'Crank the book' },
                      )
                    }
                    disabled={!isConnected || busy || !crankReady}
                    className="pill-lime mt-3 w-full disabled:opacity-50"
                  >
                    {!isConnected
                      ? 'Connect to crank'
                      : crankReady
                        ? 'Crank the payout'
                        : 'Bar below threshold'}
                  </button>
                </div>
              </div>
            </div>
          </Section>

          {/* PER-SOURCE ACCRUAL */}
          <Section label="Sources" title="Six feeds," emphasis="one book.">
            <div className="grid gap-3">
              {SOURCES.map((s, i) => {
                const v = accruals[i] ?? null;
                const w =
                  v != null && maxAccrued > 0n ? Number((v * 10_000n) / maxAccrued) / 100 : 0;
                return (
                  <div key={s.key} className="card">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="data text-sm">{s.key}</p>
                        <p className="text-xs text-mute">{s.label}</p>
                      </div>
                      <span className="data text-sm text-lime">
                        {v != null ? `Ξ${formatEther(v)}` : sources.isLoading ? '…' : 'Ξ0'}
                      </span>
                    </div>
                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-black/60">
                      <div className="h-full rounded-full bg-lime" style={{ width: `${w}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* PAYOUT HISTORY */}
          <Section label="Payouts" title="What's been" emphasis="cranked.">
            {history.isLoading ? (
              <p className="data text-sm text-mute">Loading crank history…</p>
            ) : !history.data || history.data.length === 0 ? (
              <EmptyState
                title="No payouts recorded"
                hint="Every crank, its pot and the cranker's tip show here with a tx link once the book has paid out."
              />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-line">
                <table className="data w-full min-w-[520px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-mute">
                      <th className="px-4 py-3 font-medium">Cranker</th>
                      <th className="px-4 py-3 text-right font-medium">Pot</th>
                      <th className="px-4 py-3 text-right font-medium">Tip</th>
                      <th className="px-4 py-3 text-right font-medium">Tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.data.map((h, i) => (
                      <tr key={`${h.hash}-${i}`} className="border-b border-line/60 last:border-0">
                        <td className="px-4 py-3">{shortAddr(h.cranker)}</td>
                        <td className="px-4 py-3 text-right text-lime">Ξ{formatEther(h.pot)}</td>
                        <td className="px-4 py-3 text-right">Ξ{formatEther(h.tip)}</td>
                        <td className="px-4 py-3 text-right">
                          <a
                            href={explorerTx(chainId, h.hash)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-lime underline underline-offset-2"
                          >
                            view ↗
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </ChainGuard>
  );
}

/* --------------------------------------------------------------- demo book */

/**
 * The ledger, simulated: six fee streams drip into the bar in real time;
 * when it crosses the threshold anyone can pull the crank, the pot pays out
 * to the demo bosses and a history row is stamped. Same shapes as the live
 * page, fake money.
 */
const DEMO_STREAMS = [
  { key: 'PitEdge', label: 'Pit edge', color: '#C6FF00', share: 0.42 },
  { key: 'LauncherFees', label: 'Launcher fees', color: '#9EF01A', share: 0.18 },
  { key: 'CertFees', label: 'Certificate fees', color: '#F5C842', share: 0.14 },
  { key: 'LoanInterest', label: 'Loan interest', color: '#D07A5A', share: 0.11 },
  { key: 'LockerFees', label: 'Locker fees', color: '#8A8F84', share: 0.09 },
  { key: 'AmmFees', label: 'AMM fees', color: '#565B54', share: 0.06 },
] as const;

const DEMO_THRESHOLD = 10;

function DemoBook() {
  const [bar, setBar] = useState(7.31);
  const [history, setHistory] = useState<{ pot: number; tip: number; who: string }[]>([
    { pot: 10.02, tip: 0.05, who: '0x9f…21a' },
    { pot: 10.11, tip: 0.051, who: '0x4b…c07' },
  ]);

  // Ambient drip: the six desks keep feeding the bar.
  useEffect(() => {
    const t = setInterval(() => setBar((b) => Math.min(DEMO_THRESHOLD * 1.15, b + 0.013 + Math.random() * 0.02)), 900);
    return () => clearInterval(t);
  }, []);

  const fillPct = Math.min(100, (bar / DEMO_THRESHOLD) * 100);
  const ready = bar >= DEMO_THRESHOLD;
  const tip = bar * 0.005;

  function crank() {
    if (!ready) return;
    setHistory((h) => [{ pot: bar, tip, who: 'you' }, ...h].slice(0, 6));
    setBar(0.4);
  }

  return (
    <>
      <Section label="The Book" title="One" emphasis="ledger.">
        <DemoBanner>
          Contracts aren&apos;t deployed yet, so the ledger below is simulated — watch the six desks
          drip into the bar, and pull the crank when it fills. The live book replaces this
          automatically at deployment.
        </DemoBanner>
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="surface-hero p-5">
            <div className="flex items-center justify-between">
              <p className="eyebrow">Bar (undistributed edge)</p>
              <SimBadge />
            </div>
            <p className={`stat-display mt-3 ${ready ? 'is-gold' : ''}`}>Ξ{bar.toFixed(3)}</p>
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs text-mute">
                <span className="data">bar fill</span>
                <span className={`data ${ready ? 'text-gold' : 'text-lime'}`}>
                  {fillPct.toFixed(1)}% of Ξ{DEMO_THRESHOLD}
                </span>
              </div>
              <LedBar pct={fillPct} className="mt-2.5" />
            </div>
            <div className="mt-4 flex items-center gap-2">
              {[3, 7, 1, 5].map((n) => (
                <BossFace key={n} n={n} size={32} />
              ))}
              <p className="ml-1 text-xs text-mute">…and 884 more get paid on every crank</p>
            </div>
          </div>

          <div className="card flex flex-col justify-between">
            <div>
              <p className="headline text-[14px]">Crank the payout</p>
              <p className="mt-2 text-sm text-mute">
                Push the bar out to active bosses by floor weight. You keep 0.50% for the gas and
                the effort.
              </p>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-mute">Est. tip</span>
                <span className={`data ${ready ? 'text-gold' : 'text-lime'}`}>Ξ{tip.toFixed(4)}</span>
              </div>
              <button
                onClick={crank}
                disabled={!ready}
                className="pill-lime mt-3 w-full disabled:opacity-50"
              >
                {ready ? 'Crank the payout' : `Filling… ${fillPct.toFixed(0)}%`}
              </button>
            </div>
          </div>
        </div>
      </Section>

      <Section label="Sources" title="Six feeds," emphasis="one book.">
        <div className="grid gap-3">
          {DEMO_STREAMS.map((s) => {
            const v = bar * s.share;
            return (
              <div key={s.key} className="card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: s.color, boxShadow: `0 0 8px ${s.color}66` }}
                    />
                    <div>
                      <p className="data text-sm">{s.key}</p>
                      <p className="text-xs text-mute">{s.label}</p>
                    </div>
                  </div>
                  <span className="data text-sm text-lime">Ξ{v.toFixed(3)}</span>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-black/60">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${s.share * 100}%`, background: s.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section label="Payouts" title="What's been" emphasis="cranked.">
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="data w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-mute">
                <th className="px-4 py-3 font-medium">Cranker</th>
                <th className="px-4 py-3 text-right font-medium">Pot</th>
                <th className="px-4 py-3 text-right font-medium">Tip</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i} className="border-b border-line/60 last:border-0">
                  <td className={`px-4 py-3 ${h.who === 'you' ? 'text-gold' : ''}`}>{h.who}</td>
                  <td className="px-4 py-3 text-right text-lime">Ξ{h.pot.toFixed(3)}</td>
                  <td className="px-4 py-3 text-right">Ξ{h.tip.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
