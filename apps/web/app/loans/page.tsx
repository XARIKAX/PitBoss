'use client';

import { useEffect, useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { formatEther, type Address } from 'viem';
import { PageHeader, Section, EmptyState, Stat } from '@/components/ui';
import { ChainGuard } from '@/components/ChainGuard';
import { DemoBanner, BossFace, SimBadge } from '@/components/demo';
import { readMany, safeRead, useContracts, useRead } from '@/lib/contracts';
import { useTx } from '@/lib/useTx';
import { useMyBossIds } from '@/lib/bosses';
import { isDeployed } from '@/lib/deployments';
import { countdown } from '@/lib/format';

/**
 * Loans — borrow PIT against a Boss, repay to reclaim it.
 * - quoteFee over a 3-90 day term slider
 * - borrow: approve the Boss NFT to the vault, then borrow (fee in ETH)
 * - my loans: nextLoanId iteration filtered by borrower, repay with late fee,
 *   countdown to dueAt
 */

const DAY = 86_400;

type Loan = {
  loanId: bigint;
  bossId: bigint;
  principal: bigint;
  ethNotional: bigint;
  startAt: bigint;
  dueAt: bigint;
  closed: boolean;
  lateFee: bigint;
};

function useMyLoans() {
  const { address } = useAccount();
  const { c, chainId } = useContracts();
  const client = usePublicClient();
  return useQuery({
    queryKey: ['myLoans', chainId, address ?? '0x0'],
    enabled: Boolean(client && address && isDeployed(c.loanVault.address)),
    refetchInterval: 20_000,
    queryFn: async (): Promise<Loan[]> => {
      const next = (await safeRead(client, c.loanVault, 'nextLoanId')) as bigint | null;
      if (next == null || next === 0n) return [];
      // Loan ids are assigned sequentially from nextLoanId; scan 0..next.
      const n = Math.min(Number(next) + 1, 2000);
      const ids = Array.from({ length: n }, (_, i) => BigInt(i));
      const raw = (await readMany(
        client,
        ids.map((id) => ({
          address: c.loanVault.address,
          abi: c.loanVault.abi,
          functionName: 'loans',
          args: [id] as const,
        })),
      )) as (readonly unknown[] | null)[];
      const me = address!.toLowerCase();
      const mine = ids.filter((_, i) => {
        const borrower = raw[i]?.[0];
        return typeof borrower === 'string' && borrower.toLowerCase() === me;
      });
      const fees = (await readMany(
        client,
        mine.map((id) => ({
          address: c.loanVault.address,
          abi: c.loanVault.abi,
          functionName: 'lateFee',
          args: [id] as const,
        })),
      )) as (bigint | null)[];
      return mine.map((loanId, j) => {
        const s = raw[Number(loanId)]!;
        return {
          loanId,
          bossId: (s[1] as bigint | undefined) ?? 0n,
          principal: (s[2] as bigint | undefined) ?? 0n,
          ethNotional: (s[3] as bigint | undefined) ?? 0n,
          startAt: BigInt((s[4] as bigint | number | undefined) ?? 0),
          dueAt: BigInt((s[5] as bigint | number | undefined) ?? 0),
          closed: Boolean(s[6]),
          lateFee: fees[j] ?? 0n,
        };
      });
    },
  });
}

export default function LoansPage() {
  const { isConnected, address } = useAccount();
  const { c } = useContracts();
  const client = usePublicClient();
  const { send, approveIfNeeded, busy } = useTx();
  const deployed = isDeployed(c.loanVault.address);

  const [term, setTerm] = useState(30); // days
  const [bossId, setBossId] = useState('');

  const principalPit = useRead<bigint>({ contract: c.loanVault, functionName: 'principalPit' });
  const aprBps = useRead<bigint>({ contract: c.loanVault, functionName: 'APR_BPS' });
  const quote = useRead<readonly [bigint, bigint]>({
    contract: c.loanVault,
    functionName: 'quoteFee',
    args: [BigInt(term * DAY)],
    refetchInterval: 30_000,
  });

  const bosses = useMyBossIds();
  const loans = useMyLoans();
  const openLoans = (loans.data ?? []).filter((l) => !l.closed);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const bossIdOk = /^\d+$/.test(bossId.trim());

  async function onBorrow() {
    if (!bossIdOk || quote.data == null) return;
    const id = BigInt(bossId.trim());
    // Step 1: approve the vault to pull the Boss NFT (collateral).
    const approved = await send(
      {
        address: c.pitBoss.address,
        abi: c.pitBoss.abi,
        functionName: 'approve',
        args: [c.loanVault.address, id],
      },
      { title: `Approve Boss #${bossId.trim()}` },
    );
    if (!approved) return;
    // Step 2: borrow — fee is paid in ETH.
    await send(
      {
        address: c.loanVault.address,
        abi: c.loanVault.abi,
        functionName: 'borrow',
        args: [id, BigInt(term * DAY)],
        value: quote.data[0],
      },
      { title: `Borrow against #${bossId.trim()}` },
    );
  }

  async function onRepay(loan: Loan) {
    if (!address) return;
    // Step 1: approve PIT principal back to the vault.
    const ok = await approveIfNeeded(
      c.pit.address as Address,
      address,
      c.loanVault.address,
      loan.principal,
    );
    if (!ok) return;
    // Step 2: repay, sending a freshly-read late fee (ETH) when overdue.
    const fee = (await safeRead(client, c.loanVault, 'lateFee', [loan.loanId])) as bigint | null;
    await send(
      {
        address: c.loanVault.address,
        abi: c.loanVault.abi,
        functionName: 'repay',
        args: [loan.loanId],
        value: fee ?? loan.lateFee,
      },
      { title: `Repay loan #${loan.loanId.toString()}` },
    );
  }

  return (
    <ChainGuard>
      <PageHeader
        eyebrow="Loans"
        title="Borrow against it."
        emphasis="Keep your streak."
        lede="Put your Boss to work without selling it. Borrow PIT, repay, reclaim. No custody, no middleman."
      />

      <Section label="Vault" title="The" emphasis="numbers.">
        {!deployed ? (
          <>
            <DemoBanner>
              The pawn desk isn&apos;t deployed yet — the terms and tickets below are simulated.
              Live quotes and your real loans replace them at deployment.
            </DemoBanner>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Loan principal" value="10,000" sub="PIT per loan, flat" />
              <Stat label="APR" value="15.00%" sub="pro-rated by term · 30% late" />
              <Stat label="Fee for 30 days" value="Ξ0.0037" sub="paid upfront" />
              <Stat label="Liquidations" value="None" sub="default returns the Boss to the vault" />
            </div>
          </>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Loan principal"
              value={principalPit.data != null ? formatEther(principalPit.data) : '…'}
              sub="PIT per loan"
            />
            <Stat
              label="APR"
              value={aprBps.data != null ? `${(Number(aprBps.data) / 100).toFixed(2)}%` : '…'}
              sub="pro-rated by term"
            />
            <Stat
              label="Fee for term"
              value={quote.data != null ? `Ξ${formatEther(quote.data[0])}` : '…'}
              sub={`${term} days, paid upfront`}
            />
            <Stat
              label="ETH notional"
              value={quote.data != null ? `Ξ${formatEther(quote.data[1])}` : '…'}
              sub="principal value in ETH"
            />
          </div>
        )}
      </Section>

      {deployed ? (
        <Section label="Borrow" title="Take the" emphasis="loan.">
          <div className="card max-w-xl">
            <label className="block">
              <span className="eyebrow">
                Term · <span className="data text-lime">{term} days</span>
              </span>
              <input
                type="range"
                min={3}
                max={90}
                value={term}
                onChange={(e) => setTerm(Number(e.target.value))}
                className="mt-2 w-full accent-lime"
              />
              <div className="data mt-1 flex justify-between text-[11px] text-mute">
                <span>3d</span>
                <span>90d</span>
              </div>
            </label>

            <label className="mt-4 block">
              <span className="eyebrow">Collateral Boss id</span>
              {bosses.data && bosses.data.length > 0 ? (
                <select
                  value={bossId}
                  onChange={(e) => setBossId(e.target.value)}
                  className="data mt-1 w-full rounded-xl border border-line bg-black/40 px-4 py-3 text-sm"
                >
                  <option value="">Select a Boss…</option>
                  {bosses.data.map((id) => (
                    <option key={id.toString()} value={id.toString()}>
                      Boss #{id.toString()}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={bossId}
                  onChange={(e) => setBossId(e.target.value)}
                  placeholder="Boss id"
                  inputMode="numeric"
                  className="data mt-1 w-full rounded-xl border border-line bg-black/40 px-4 py-3 text-sm"
                />
              )}
            </label>

            <p className="mt-3 text-xs text-mute">
              Two transactions: approve the Boss NFT to the vault, then borrow. The Boss is held as
              collateral until repayment.
            </p>

            <button
              onClick={onBorrow}
              disabled={!isConnected || busy || !bossIdOk || quote.data == null}
              className="pill-lime mt-4 w-full disabled:opacity-50"
            >
              {!isConnected
                ? 'Connect to borrow'
                : `Borrow ${principalPit.data != null ? formatEther(principalPit.data) : ''} PIT`}
            </button>
          </div>
        </Section>
      ) : null}

      <Section label="History" title="Your" emphasis="tickets.">
        {!deployed ? (
          <DemoTickets />
        ) : !isConnected ? (
          <EmptyState
            title="Connect to see your loans"
            hint="Open and past loans, their fees and repayment status show here."
          />
        ) : loans.isLoading ? (
          <p className="data text-sm text-mute">Scanning loans…</p>
        ) : !loans.data || loans.data.length === 0 ? (
          <EmptyState
            title="No loans yet"
            hint="Borrow against a Boss above — the loan, its due date and repayment controls show here."
          />
        ) : (
          <div className="grid gap-3">
            {loans.data.map((l) => {
              const dueMs = Number(l.dueAt) * 1000;
              const cd = countdown(dueMs, now);
              const overdue = !l.closed && dueMs <= now;
              return (
                <div key={l.loanId.toString()} className="card border-dashed">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <BossFace n={Number(l.bossId) || 1} size={52} />
                      <div>
                        <p className="data text-sm">
                          Ticket #{l.loanId.toString()} · Boss #{l.bossId.toString()} ·{' '}
                          {formatEther(l.principal)} PIT
                        </p>
                        <p className="mt-1 text-xs text-mute">
                        {l.closed ? (
                          'closed'
                        ) : overdue ? (
                          <span className="text-red-300">
                            overdue · late fee Ξ{formatEther(l.lateFee)}
                          </span>
                        ) : (
                          `due in ${cd.days}d ${cd.hours}h ${cd.minutes}m ${cd.seconds}s`
                        )}
                        </p>
                      </div>
                    </div>
                    {!l.closed ? (
                      <button
                        onClick={() => onRepay(l)}
                        disabled={busy}
                        className="pill-lime disabled:opacity-50"
                      >
                        Repay {formatEther(l.principal)} PIT
                        {l.lateFee > 0n ? ` + Ξ${formatEther(l.lateFee)}` : ''}
                      </button>
                    ) : (
                      <span className="chip">repaid</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </ChainGuard>
  );
}

/* ------------------------------------------------------------ demo tickets */

const DEMO_TICKETS = [
  {
    id: 14,
    boss: 217,
    principal: '10,000',
    line: 'due in 12d 4h · on time',
    stamp: 'ON TIME',
    stampCls: 'border-acid/50 text-acid',
  },
  {
    id: 3,
    boss: 888,
    principal: '10,000',
    line: 'overdue · late fee Ξ0.0041 accruing at 30% APR',
    stamp: 'OVERDUE',
    stampCls: 'border-ember/60 text-ember',
  },
] as const;

/** The pawn desk, simulated: two tickets showing both states of a loan. */
function DemoTickets() {
  return (
    <div className="grid gap-3">
      {DEMO_TICKETS.map((t) => (
        <div key={t.id} className="card relative overflow-hidden border-dashed">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <BossFace n={t.boss} size={52} />
              <div>
                <p className="data text-sm">
                  Ticket #{t.id} · Boss #{t.boss} · {t.principal} PIT
                </p>
                <p className={`mt-1 text-xs ${t.stamp === 'OVERDUE' ? 'text-ember' : 'text-mute'}`}>
                  {t.line}
                </p>
                <p className="mt-1 text-xs text-mute">
                  Boss held as collateral · repay exactly what you took to reclaim it
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`data rotate-[-6deg] rounded border-2 px-2.5 py-1 text-[11px] font-bold tracking-[0.18em] ${t.stampCls}`}
              >
                {t.stamp}
              </span>
              <SimBadge />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
