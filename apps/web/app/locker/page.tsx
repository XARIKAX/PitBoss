'use client';

import { useState } from 'react';
import { PageHeader, Section, EmptyState, TodoTag } from '@/components/ui';
import { ChainGuard } from '@/components/ChainGuard';

/**
 * The Locker.
 * - Lock wizard (hard lock / linear vest / permanent)
 * - My locks
 * - Collect fees
 */
const LOCK_KINDS = [
  { id: 'hard', label: 'Hard lock', desc: 'Locked solid until the unlock date. No early exit.' },
  { id: 'vest', label: 'Linear vest', desc: 'Unlocks continuously over the vesting window.' },
  { id: 'perm', label: 'Permanent', desc: 'Burn the key. Liquidity locked forever.' },
] as const;

export default function LockerPage() {
  const [kind, setKind] = useState<(typeof LOCK_KINDS)[number]['id']>('hard');

  return (
    <ChainGuard>
      <PageHeader
        eyebrow="The Locker"
        title="Lock it up."
        emphasis="Proof, not promises."
        lede="Hard lock, linear vest, or burn the key. Collect fees while it sits. The lock is onchain and anyone can verify it."
      />

      <Section label="Lock wizard" title="Choose your" emphasis="lock.">
        <div className="grid gap-3 sm:grid-cols-3">
          {LOCK_KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => setKind(k.id)}
              className={`card text-left transition-colors ${kind === k.id ? 'border-lime' : 'hover:border-lime/40'}`}
            >
              <p className="headline text-[14px]">{k.label}</p>
              <p className="mt-2 text-sm text-mute">{k.desc}</p>
            </button>
          ))}
        </div>

        <div className="card mt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="eyebrow">Token / LP</span>
              <input
                placeholder="0x…"
                className="data mt-1 w-full rounded-xl border border-line bg-black/40 px-4 py-3 text-sm"
              />
            </label>
            <label className="block">
              <span className="eyebrow">Amount</span>
              <input
                inputMode="decimal"
                placeholder="0.0"
                className="data mt-1 w-full rounded-xl border border-line bg-black/40 px-4 py-3 text-sm"
              />
            </label>
            {kind !== 'perm' && (
              <label className="block">
                <span className="eyebrow">{kind === 'vest' ? 'Vest end' : 'Unlock date'}</span>
                <input
                  type="date"
                  className="data mt-1 w-full rounded-xl border border-line bg-black/40 px-4 py-3 text-sm"
                />
              </label>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button className="pill-lime">Seal the lock</button>
            <TodoTag>Locker.lock({kind})</TodoTag>
          </div>
        </div>
      </Section>

      <Section label="My locks" title="What's" emphasis="sealed.">
        <EmptyState
          title="No locks yet"
          hint="Your active locks, their kind, unlock schedule and claimable fees show here."
          todo="Locker.locksOf(you)"
        />
      </Section>

      <Section label="Fees" title="Collect" emphasis="while it sits.">
        <div className="card">
          <p className="max-w-prose text-sm text-mute">
            Locked LP still earns trading fees. Collect them any time without touching the principal.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button className="pill-lime">Collect fees</button>
            <TodoTag>Locker.collectFees()</TodoTag>
          </div>
        </div>
      </Section>
    </ChainGuard>
  );
}
