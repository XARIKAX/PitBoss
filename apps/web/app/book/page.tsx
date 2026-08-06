'use client';

import { useAccount, usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { formatEther, parseAbiItem } from 'viem';
import { PageHeader, Section, EmptyState } from '@/components/ui';
import { ChainGuard } from '@/components/ChainGuard';
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
        <Section label="The Book" title="One" emphasis="ledger.">
          <EmptyState
            title="Not deployed"
            hint="The HouseBook has no address on this chain yet. Accruals, the bar and crank controls go live here once deployments land."
          />
        </Section>
      ) : (
        <>
          {/* TOTAL + CRANK */}
          <Section label="The Book" title="One" emphasis="ledger.">
            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div className="card">
                <p className="eyebrow">Bar (undistributed edge)</p>
                <p className="data mt-2 text-5xl text-lime">
                  {bar.data != null ? `Ξ${formatEther(bar.data)}` : '…'}
                </p>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-mute">
                    <span className="data">bar fill</span>
                    <span className="data text-lime">
                      {fillPct.toFixed(1)}% of Ξ
                      {threshold.data != null ? formatEther(threshold.data) : '…'}
                    </span>
                  </div>
                  <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-black/60">
                    <div className="h-full rounded-full bg-lime" style={{ width: `${fillPct}%` }} />
                  </div>
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
