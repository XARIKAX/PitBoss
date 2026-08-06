import Link from 'next/link';
import { Reveal } from '@/components/Reveal';
import { OddsTable } from '@/components/OddsTable';
import { PillLink } from '@/components/ui';

/**
 * Landing page — port of the pitbosses.html reference.
 * Structure: hero → The Floor (modules grid) → The Pit (odds) → Be the House
 * (lime slab) → The Launcher / Opening Bell → House Book visual.
 * Nav, footer and ticker live in the root layout.
 */

const FLOOR_MODULES = [
  {
    tag: 'Floor',
    href: '/floor',
    title: 'Get a Boss',
    body: 'Buy off the flat AMM or snipe a listing. Activate it and it starts working the floor.',
  },
  {
    tag: 'Pit',
    href: '/pit',
    title: 'Work the Pit',
    body: 'Buy a ticket, pick a lane, pull the machine. Every roll is verifiable. The edge is 10%.',
  },
  {
    tag: 'Certificates',
    href: '/certificates',
    title: 'Mint a deed',
    body: 'Bearer certificates, rendered fully onchain. Buy, gift, redeem. The paper is the asset.',
  },
  {
    tag: 'Launcher',
    href: '/launcher',
    title: 'Ring the bell',
    body: 'Launch a token on a live curve with a public Buyback Bar. Fill it and the bell rings.',
  },
  {
    tag: 'Locker',
    href: '/locker',
    title: 'Lock it up',
    body: 'Hard lock, linear vest, or burn the key. Collect fees while it sits. Proof, not promises.',
  },
  {
    tag: 'Loans',
    href: '/loans',
    title: 'Borrow against it',
    body: 'Put your position to work. Borrow, repay, keep your streak. No custody, no middleman.',
  },
];

const HOUSE_SOURCES = [
  { name: 'PitEdge', pct: 42 },
  { name: 'CertFees', pct: 14 },
  { name: 'LauncherFees', pct: 18 },
  { name: 'LockerFees', pct: 9 },
  { name: 'LoanInterest', pct: 11 },
  { name: 'AmmFees', pct: 6 },
];

export default function LandingPage() {
  return (
    <>
      {/* HERO */}
      <section className="relative border-b border-line">
        <div className="shell grid gap-10 py-20 lg:grid-cols-[1.2fr_0.8fr] lg:py-28">
          <div>
            <p className="eyebrow">PitBosses · $PIT</p>
            <h1 className="headline mt-5 text-display text-balance">
              Run the floor.
              <br />
              Get paid in <span className="em">stock.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-mute">
              Buy a Boss. Work the Pit. Be the House. A permissionless floor where the edge accrues
              to the book and the book pays out. Rewards are promotional — not dividends.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <PillLink href="/floor">Get a Boss</PillLink>
              <PillLink href="/pit" variant="ghost">
                Enter the Pit
              </PillLink>
            </div>
          </div>

          {/* Live figures — DATA, mono. TODO: wire to oracle + HouseBook reads. */}
          <Reveal className="grid grid-cols-2 gap-3 self-center">
            {[
              { k: 'House Book', v: '$2.41M', s: 'total accrued' },
              { k: 'Edge', v: '10%', s: 'return-to-player 90%' },
              { k: 'Bosses', v: '4,663', s: 'on the floor' },
              { k: 'Last bell', v: '+18.2%', s: '$PIT/ACME' },
            ].map((c) => (
              <div key={c.k} className="card">
                <p className="eyebrow">{c.k}</p>
                <p className="data mt-2 text-2xl text-lime">{c.v}</p>
                <p className="mt-1 text-xs text-mute">{c.s}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* THE FLOOR — modules grid */}
      <section className="shell py-20">
        <Reveal>
          <p className="eyebrow">The Floor</p>
          <h2 className="headline mt-2 text-section">
            Six ways to <span className="em">work it.</span>
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FLOOR_MODULES.map((m, idx) => (
            <Reveal key={m.title} delay={idx * 60}>
              <Link
                href={m.href}
                className="card group flex h-full flex-col transition-colors hover:border-lime/40"
              >
                <p className="eyebrow">{m.tag}</p>
                <p className="headline mt-3 text-2xl">{m.title}</p>
                <p className="mt-2 flex-1 text-sm text-mute">{m.body}</p>
                <span className="mt-4 text-sm text-lime opacity-0 transition-opacity group-hover:opacity-100">
                  Open →
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* THE PIT — odds table */}
      <section className="border-y border-line bg-ink/30">
        <div className="shell grid gap-10 py-20 lg:grid-cols-[0.9fr_1.1fr]">
          <Reveal>
            <p className="eyebrow">The Pit</p>
            <h2 className="headline mt-2 text-section">
              Every roll is <span className="em">verifiable.</span>
            </h2>
            <p className="mt-5 max-w-md text-mute">
              One table, twenty-one rows, no house tricks. The multiplier maps from a landed entropy
              word by a pure function anyone can recompute. RTP is 90%. The rest is the edge — and
              the edge is the point.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <PillLink href="/pit">Buy a ticket</PillLink>
              <PillLink href="/book" variant="ghost">
                See the book
              </PillLink>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <OddsTable />
          </Reveal>
        </div>
      </section>

      {/* BE THE HOUSE — the single full-bleed lime slab */}
      <section className="bg-lime text-black">
        <div className="shell py-24">
          <Reveal>
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-black/60">Be the House</p>
            <h2 className="headline mt-3 text-display">
              Don't beat the house.
              <br />
              <span className="italic">Be</span> it.
            </h2>
            <p className="mt-6 max-w-xl text-lg text-black/70">
              Stake the bankroll. Take the other side of every roll. The edge that leaves players'
              pockets lands in the book, and the book pays stakers in stock. Live APR, no lockups you
              didn't choose.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/pit#bankroll" className="pill bg-black text-lime hover:bg-black/90">
                Stake the bankroll
              </Link>
              <Link
                href="/book"
                className="pill border border-black/30 text-black hover:border-black/60"
              >
                Read the House Book
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* THE LAUNCHER — Opening Bell */}
      <section className="shell py-20">
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
          <Reveal>
            <p className="eyebrow">The Launcher · Opening Bell</p>
            <h2 className="headline mt-2 text-section">
              Fill the bar. <span className="em">Ring the bell.</span>
            </h2>
            <p className="mt-5 max-w-md text-mute">
              Every launch runs a live curve with a public Buyback Bar. When the bar fills, the bell
              rings — buybacks fire, the floor lifts, and the odds are printed for everyone before a
              single token moves.
            </p>
            <div className="mt-7">
              <PillLink href="/launcher">Ring the bell</PillLink>
            </div>
          </Reveal>

          {/* Buyback Bar visual */}
          <Reveal delay={80} className="card">
            <div className="flex items-center justify-between">
              <p className="eyebrow">Buyback Bar</p>
              <span className="data text-xs text-lime">64% filled</span>
            </div>
            <div className="mt-4 h-4 w-full overflow-hidden rounded-full bg-black/60">
              <div className="h-full rounded-full bg-lime" style={{ width: '64%' }} />
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              {[
                { k: 'Odds', v: '3.2×' },
                { k: 'Fill', v: '$41K' },
                { k: 'To bell', v: '$23K' },
              ].map((s) => (
                <div key={s.k} className="rounded-xl border border-line py-3">
                  <p className="eyebrow">{s.k}</p>
                  <p className="data mt-1 text-lg">{s.v}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-mute">
              Placeholder curve — TODO: wire to Launcher round reads.
            </p>
          </Reveal>
        </div>
      </section>

      {/* HOUSE BOOK visual */}
      <section className="border-t border-line">
        <div className="shell py-20">
          <Reveal>
            <p className="eyebrow">The House Book</p>
            <h2 className="headline mt-2 text-section">
              Where the edge <span className="em">accrues.</span>
            </h2>
            <p className="mt-4 max-w-xl text-mute">
              Six sources feed one book. Anyone can crank the payout and take a 0.5% tip for doing
              it. Fully onchain, fully public.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {HOUSE_SOURCES.map((s, idx) => (
              <Reveal key={s.name} delay={idx * 50} className="card">
                <div className="flex items-center justify-between">
                  <p className="data text-sm">{s.name}</p>
                  <span className="data text-xs text-mute">{s.pct}%</span>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-black/60">
                  <div className="h-full rounded-full bg-lime" style={{ width: `${s.pct}%` }} />
                </div>
              </Reveal>
            ))}
          </div>

          <div className="mt-8">
            <PillLink href="/book" variant="ghost">
              Crank the payout
            </PillLink>
          </div>
        </div>
      </section>
    </>
  );
}
