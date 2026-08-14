'use client';

import { PageHeader, Section } from '@/components/ui';
import { ChainGuard } from '@/components/ChainGuard';
import { TrackerBoard } from '@/components/LiveStats';
import { TopEarners } from '@/components/TopEarners';
import { TokenAddress } from '@/components/TokenAddress';

/**
 * /stats — the public trackers. Activation census and burn, read live off the
 * chain, so anyone can watch the floor fill and supply shrink without trusting
 * a number we typed.
 */
export default function StatsPage() {
  return (
    <ChainGuard>
      <PageHeader
        eyebrow="Trackers"
        title="The floor,"
        emphasis="live."
        lede="Activated Bosses, $PITBOSS burned forever, and the House Book waiting to be cranked. Every figure is read straight off Robinhood Chain — nothing cached, nothing seeded, all of it verifiable yourself."
      />

      <Section label="Live" title="On" emphasis="chain.">
        <TrackerBoard />
      </Section>

      <Section label="Leaderboard" title="Top" emphasis="earners.">
        <TopEarners />
      </Section>

      <Section label="How to read it" title="Trust the" emphasis="chain.">
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="card">
            <p className="label-lime">01</p>
            <p className="headline mt-2 text-[15px]">Why it is really gone</p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-mute">
              Activation costs 888,888 $PITBOSS. Half goes to the dead address, an account nobody
              holds the keys to, and burns on every activation and every resale. The other half
              funds rewards for activated Bosses. Early on it went to the House Book, which
              handles ETH and cannot move a token balance back out, so that portion is frozen
              here too.
            </p>
          </div>

          <div className="card">
            <p className="label-lime">02</p>
            <p className="headline mt-2 text-[15px]">Why the count is exact</p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-mute">
              Every minted Boss is checked individually against the ActivationManager, so the
              census is a headcount rather than an estimate. Transfer a Boss and its cell goes
              dark; the new owner activates and it lights again.
            </p>
          </div>

          <div className="card">
            <p className="label-lime">03</p>
            <p className="headline mt-2 text-[15px]">Verify it yourself</p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-mute">
              Open the token on the explorer and read two balances: the dead address, and the
              House Book. Add them together. They match the counter above to the token, because
              that is exactly how it is calculated.
            </p>
            <div className="mt-3">
              <TokenAddress compact />
            </div>
          </div>
        </div>
      </Section>
    </ChainGuard>
  );
}
