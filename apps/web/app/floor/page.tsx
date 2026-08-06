'use client';

import { useAccount } from 'wagmi';
import { PageHeader, Section, EmptyState, Stat, TodoTag, PillLink } from '@/components/ui';
import { ChainGuard } from '@/components/ChainGuard';
import { ConnectButton } from '@/components/ConnectButton';

/**
 * The Floor.
 * - Get a Boss: AMM buy / snipe.
 * - My Bosses: TBA balances, elections, auto-DCA toggle, floor position + streak.
 * - Activate.
 *
 * All onchain reads/writes are marked TODO — this is the layout scaffold.
 */
export default function FloorPage() {
  const { isConnected } = useAccount();

  return (
    <ChainGuard>
      <PageHeader
        eyebrow="The Floor"
        title="Get a Boss."
        emphasis="Put it to work."
        lede="Buy off the flat AMM or snipe a listing. Activate it and it starts earning on the floor."
      >
        {!isConnected ? <ConnectButton /> : null}
      </PageHeader>

      {/* GET A BOSS */}
      <Section label="Get a Boss" title="Buy" emphasis="or snipe.">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card">
            <p className="headline text-[15px]">Buy off the AMM</p>
            <p className="mt-2 text-sm text-mute">
              Flat-price AMM vault. Pick a stock token, set your size, confirm.
            </p>
            <div className="mt-5 space-y-3">
              <label className="block">
                <span className="eyebrow">Pay with</span>
                <select className="data mt-1 w-full rounded-xl border border-line bg-black/40 px-4 py-3 text-sm">
                  <option>WETH</option>
                  <option>AAPL</option>
                  <option>TSLA</option>
                  <option>NVDA</option>
                  <option>HOOD</option>
                </select>
              </label>
              <label className="block">
                <span className="eyebrow">Amount</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.0"
                  className="data mt-1 w-full rounded-xl border border-line bg-black/40 px-4 py-3 text-sm"
                />
              </label>
              <button className="pill-lime w-full" disabled={!isConnected}>
                {isConnected ? 'Buy a Boss' : 'Connect to buy'}
              </button>
              <TodoTag>FlatAMMVault.buy()</TodoTag>
            </div>
          </div>

          <div className="card">
            <p className="headline text-[15px]">Snipe a listing</p>
            <p className="mt-2 text-sm text-mute">
              Watch the floor and take a specific Boss the moment it lists.
            </p>
            <div className="mt-5">
              <EmptyState
                title="No open listings"
                hint="When Bosses list on the AMM they show here. Set a max price and we'll try to fill it."
                todo="AMM listing feed"
              />
            </div>
          </div>
        </div>
      </Section>

      {/* MY BOSSES */}
      <Section label="My Bosses" title="Your" emphasis="floor.">
        {!isConnected ? (
          <EmptyState
            title="Connect to see your Bosses"
            hint="Your token-bound account balances, elections, DCA settings and streak live here once you connect."
            cta={{ href: '#', label: 'Connect wallet' }}
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Floor position" value="—" sub="TODO: FloorPosition.of(you)" />
              <Stat label="Streak" value="0 days" sub="TODO: streak read" />
              <Stat label="TBA balance" value="—" sub="TODO: TBA holdings" />
              <Stat label="Auto-DCA" value="Off" sub="toggle below" />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="card">
                <p className="headline text-[14px]">Elections</p>
                <p className="mt-2 text-sm text-mute">
                  Vote your Bosses on open proposals. Weight follows floor position.
                </p>
                <EmptyState
                  title="No open elections"
                  hint="Proposals you can vote on show here."
                  todo="elections read"
                />
              </div>
              <div className="card">
                <p className="headline text-[14px]">Auto-DCA</p>
                <p className="mt-2 text-sm text-mute">
                  Route rewards back into your Boss on a schedule.
                </p>
                <label className="mt-4 flex items-center gap-3">
                  <input type="checkbox" className="h-5 w-9 accent-lime" />
                  <span className="text-sm">Enable auto-DCA</span>
                </label>
                <div className="mt-3">
                  <TodoTag>ActivationManager.setDca()</TodoTag>
                </div>
              </div>
            </div>
          </>
        )}
      </Section>

      {/* ACTIVATE */}
      <Section label="Activate" title="Turn it" emphasis="on.">
        <div className="card">
          <p className="max-w-prose text-sm text-mute">
            A Boss earns nothing until it's activated. Activation binds the token-bound account and
            opens it to floor position, streaks and rewards.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button className="pill-lime" disabled={!isConnected}>
              Activate a Boss
            </button>
            <PillLink href="/docs" variant="ghost">
              How activation works
            </PillLink>
            <TodoTag>ActivationManager.activate()</TodoTag>
          </div>
        </div>
      </Section>
    </ChainGuard>
  );
}
