'use client';

/**
 * /activate — how to put a Boss on the payroll, with the walkthrough video.
 * The doing happens on /floor; this page is the instruction card in front
 * of it, one nav stop below The Floor.
 */
import Link from 'next/link';
import { PageHeader, Section } from '@/components/ui';
import { ChainGuard } from '@/components/ChainGuard';
import { HowToActivate } from '@/components/HowToActivate';

export default function ActivatePage() {
  return (
    <ChainGuard>
      <PageHeader
        eyebrow="Activate"
        title="Switch it"
        emphasis="on."
        lede="A PitBoss earns nothing until it is activated. Three steps, two transactions, and your Boss takes a share of every fee on the floor. Watch the walkthrough, then do it on the Floor."
      />

      <Section label="How to" title="Put your Boss" emphasis="on the payroll.">
        <HowToActivate />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link href="/floor" className="btn-lime">
            Go to the Floor and activate →
          </Link>
          <Link href="/stats" className="btn-ghost">
            See who already has
          </Link>
        </div>
      </Section>
    </ChainGuard>
  );
}
