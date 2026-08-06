'use client';

import { PageHeader, Section, EmptyState, TodoTag } from '@/components/ui';
import { ChainGuard } from '@/components/ChainGuard';
import { useToast } from '@/components/TxToast';
import { fmtCompact } from '@/lib/format';

/**
 * The House Book dashboard.
 * - Per-source accrual (PitEdge, CertFees, LauncherFees, LockerFees, LoanInterest, AmmFees)
 * - Bar fill
 * - Crank button + tip estimate (0.5% of the payout)
 * - Payout history
 *
 * Placeholder totals; every figure is a TODO read of HouseBook.
 */
const SOURCES: { key: string; label: string; accrued: number }[] = [
  { key: 'PitEdge', label: 'Pit edge', accrued: 1_012_400 },
  { key: 'CertFees', label: 'Certificate fees', accrued: 338_200 },
  { key: 'LauncherFees', label: 'Launcher fees', accrued: 434_900 },
  { key: 'LockerFees', label: 'Locker fees', accrued: 216_700 },
  { key: 'LoanInterest', label: 'Loan interest', accrued: 265_100 },
  { key: 'AmmFees', label: 'AMM fees', accrued: 144_800 },
];

export default function BookPage() {
  const { push } = useToast();
  const total = SOURCES.reduce((s, x) => s + x.accrued, 0);
  const tip = total * 0.005; // 0.5% crank tip
  const max = Math.max(...SOURCES.map((s) => s.accrued));

  return (
    <ChainGuard>
      <PageHeader
        eyebrow="The House Book"
        title="Where the edge"
        emphasis="accrues."
        lede="Six sources feed one book. Anyone can crank the payout and take a 0.5% tip for doing it. Fully onchain, fully public."
      />

      {/* TOTAL + CRANK */}
      <Section label="The Book" title="One" emphasis="ledger.">
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="card">
            <p className="eyebrow">Total accrued</p>
            <p className="data mt-2 text-5xl text-lime">{fmtCompact(total)}</p>
            <p className="mt-2 text-xs text-mute">
              Placeholder — TODO: HouseBook.totalAccrued()
            </p>
          </div>

          <div className="card flex flex-col justify-between">
            <div>
              <p className="font-serif text-lg">Crank the payout</p>
              <p className="mt-2 text-sm text-mute">
                Push accrued fees to recipients. You keep a 0.5% tip for the gas and the effort.
              </p>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-mute">Est. tip (0.5%)</span>
                <span className="data text-lime">{fmtCompact(tip)}</span>
              </div>
              <button
                onClick={() =>
                  push({ kind: 'pending', title: 'Cranking the book…', message: `tip ~ ${fmtCompact(tip)}` })
                }
                className="pill-lime mt-3 w-full"
              >
                Crank the payout
              </button>
              <div className="mt-3">
                <TodoTag>HouseBook.crank()</TodoTag>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* PER-SOURCE ACCRUAL */}
      <Section label="Sources" title="Six feeds," emphasis="one book.">
        <div className="grid gap-3">
          {SOURCES.map((s) => (
            <div key={s.key} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="data text-sm">{s.key}</p>
                  <p className="text-xs text-mute">{s.label}</p>
                </div>
                <span className="data text-sm text-lime">{fmtCompact(s.accrued)}</span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-black/60">
                <div
                  className="h-full rounded-full bg-lime"
                  style={{ width: `${(s.accrued / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <TodoTag>HouseBook.accruedBySource()</TodoTag>
        </div>
      </Section>

      {/* PAYOUT HISTORY */}
      <Section label="Payouts" title="What's been" emphasis="cranked.">
        <EmptyState
          title="No payouts recorded"
          hint="Every crank and its recipients show here with a tx link once the book has paid out."
          todo="HouseBook Payout event log"
        />
      </Section>
    </ChainGuard>
  );
}
