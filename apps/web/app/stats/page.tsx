'use client';

import { PageHeader, Section } from '@/components/ui';
import { ChainGuard } from '@/components/ChainGuard';
import { LiveStats } from '@/components/LiveStats';
import { TokenAddress } from '@/components/TokenAddress';

/**
 * /stats — the public trackers. Activation and burn, read live off the chain,
 * so anyone can watch the floor fill and supply shrink without trusting us.
 */
export default function StatsPage() {
  return (
    <ChainGuard>
      <PageHeader
        eyebrow="Trackers"
        title="The floor,"
        emphasis="live."
        lede="Every number here is read straight off Robinhood Chain. Activated Bosses, $PITBOSS burned forever, and the House Book waiting to be cranked. Nothing cached, nothing seeded."
      />

      <Section label="Live" title="On" emphasis="chain.">
        <LiveStats />

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="card">
            <p className="headline text-[15px]">How the burn works</p>
            <p className="mt-2 text-[13px] leading-relaxed text-mute">
              Activating a Boss costs 888,888 $PITBOSS. Half — 444,444 — is sent to the dead
              address and can never be recovered. The other half funds the House Book that pays
              holders. Selling a Boss clears its activation, so the next owner burns again.
              The burn counter above is simply the balance held at the dead address.
            </p>
            <div className="mt-4">
              <TokenAddress />
            </div>
          </div>

          <div className="card">
            <p className="headline text-[15px]">How activation counts</p>
            <p className="mt-2 text-[13px] leading-relaxed text-mute">
              Every minted Boss is checked against the ActivationManager one by one, so the count
              is exact rather than estimated. A Boss drops off the moment it is transferred and
              rejoins when the new owner activates it. Only activated Bosses take a share when the
              House Book is cranked.
            </p>
            <p className="label mt-4">Refreshes every 60 seconds</p>
          </div>
        </div>
      </Section>
    </ChainGuard>
  );
}
