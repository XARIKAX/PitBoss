'use client';

import { useState } from 'react';
import { PageHeader, Section, EmptyState, Stat, TodoTag } from '@/components/ui';
import { ChainGuard } from '@/components/ChainGuard';

/**
 * Loans — borrow against a position, repay to reclaim it.
 * All figures are placeholders; wire to the loans module reads/writes.
 */
export default function LoansPage() {
  const [tab, setTab] = useState<'borrow' | 'repay'>('borrow');

  return (
    <ChainGuard>
      <PageHeader
        eyebrow="Loans"
        title="Borrow against it."
        emphasis="Keep your streak."
        lede="Put your position to work without selling it. Borrow, repay, reclaim. No custody, no middleman."
      />

      <Section label="Position" title="Your" emphasis="numbers.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Collateral" value="—" sub="TODO: position value" />
          <Stat label="Borrowed" value="—" sub="TODO: debt read" />
          <Stat label="Health factor" value="—" sub="TODO: liquidation math" />
          <Stat label="Borrow APR" value="—" sub="TODO: rate read" />
        </div>
      </Section>

      <Section label="Act" title="Borrow" emphasis="or repay.">
        <div className="card max-w-xl">
          <div className="grid grid-cols-2 gap-2">
            {(['borrow', 'repay'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-xl border px-4 py-3 text-sm capitalize ${
                  tab === t ? 'border-lime text-lime' : 'border-line text-mute hover:text-paper'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <label className="mt-4 block">
            <span className="eyebrow">{tab === 'borrow' ? 'Borrow amount' : 'Repay amount'}</span>
            <input
              inputMode="decimal"
              placeholder="0.0"
              className="data mt-1 w-full rounded-xl border border-line bg-black/40 px-4 py-3 text-sm"
            />
          </label>

          <button className="pill-lime mt-4 w-full">
            {tab === 'borrow' ? 'Borrow' : 'Repay'}
          </button>
          <div className="mt-3">
            <TodoTag>{tab === 'borrow' ? 'Loans.borrow()' : 'Loans.repay()'}</TodoTag>
          </div>
        </div>
      </Section>

      <Section label="History" title="Your" emphasis="loans.">
        <EmptyState
          title="No loans yet"
          hint="Open and past loans, their rates and repayment status show here."
          todo="Loans.loansOf(you)"
        />
      </Section>
    </ChainGuard>
  );
}
