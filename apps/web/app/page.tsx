import Link from 'next/link';
import { Reveal } from '@/components/Reveal';
import { OddsTable } from '@/components/OddsTable';
import { HeroBanner } from '@/components/HeroBanner';
import { TokenAddress } from '@/components/TokenAddress';
import { LiveStats } from '@/components/LiveStats';

/**
 * Home — terminal-trading dashboard.
 * Cinematic banner band → type lockup on black → stat strip → module chip row →
 * module grid (boxed panels) → The Pit odds → Be the House → House Book.
 * Shell (sidebar/topbar), footer and ticker live in the root layout.
 * The band carries the wordmark; the H1 never sits on the art.
 */

const MODULES = [
  {
    tag: 'LIVE',
    href: '/floor',
    title: 'The Floor',
    body: '888 Bosses, each with its own onchain wallet. Activate one and every fee on the floor pays you — in the stock you elect.',
  },
  {
    tag: 'LIVE',
    href: '/pit',
    title: 'The Pit',
    body: 'Ticket in, stock out. Floor 0.70x, ceiling 50x, RTP 90%. Every roll committed to entropy that does not exist yet.',
  },
  {
    tag: 'NEW',
    href: '/roulette',
    title: 'Roulette',
    body: 'A European single-zero wheel — bet ETH, win tokenized stock. One green zero, a clean 2.70% edge, paid to the Bosses.',
  },
  {
    tag: 'LIVE',
    href: '/certificates',
    title: 'Bearer Certificates',
    body: 'Any listed stock, sealed 1:1 into a numbered deed drawn fully onchain. Redeem burns the note in the same transaction.',
  },
  {
    tag: 'SOON',
    href: '/launcher',
    title: 'Launcher',
    body: 'Fixed price or bonding curve. Every trade charges the Buyback Bar; a provably fair draw rings the Opening Bell. The bell rings in one week.',
  },
  {
    tag: 'LIVE',
    href: '/locker',
    title: 'Locker',
    body: 'Hard lock, linear vest, or permanent. Locked principal is mathematically untouchable. No admin key. Ever.',
  },
  {
    tag: 'LIVE',
    href: '/loans',
    title: 'Loans',
    body: 'Post a Boss, borrow the full flat principal back. Repay exactly what you took. Default just sends it back to the vault.',
  },
] as const;

const HOUSE_SOURCES = [
  { name: 'Pit edge', pct: 42, val: '4.21 ETH' },
  { name: 'Certificate fees', pct: 14, val: '1.08 ETH' },
  { name: 'Launcher fees', pct: 18, val: '2.66 ETH' },
  { name: 'Locker fees', pct: 9, val: '0.94 ETH' },
  { name: 'Loan interest', pct: 11, val: '0.53 ETH' },
  { name: 'AMM fees', pct: 6, val: '0.36 ETH' },
];

const CHIPS = [
  { href: '/floor', label: 'The Floor', live: true },
  { href: '/pit', label: 'The Pit', live: true },
  { href: '/roulette', label: 'Roulette', live: true },
  { href: '/certificates', label: 'Certificates', live: true },
  { href: '/launcher', label: 'Launcher', live: false },
  { href: '/locker', label: 'Locker', live: true },
  { href: '/loans', label: 'Loans', live: true },
  { href: '/seasons', label: 'Seasons', live: false },
  { href: '/docs', label: 'Docs', live: false },
];

export default function Home() {
  return (
    <div className="pb-10">
      {/* ---- Cinematic banner band (wordmark lives in the art) ---- */}
      <HeroBanner />

      {/* ---- Type lockup: tight to the band, on black ---- */}
      <section className="shell mt-10">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <h1 className="headline text-display">
              Run the floor.
              <br />
              Get paid in <span className="em">stock</span>.
            </h1>
            <p className="mt-5 max-w-xl text-[13.5px] leading-relaxed text-mute">
              Buy a Boss. Work the Pit. Be the House. Real tokenized stocks delivered straight to
              your Boss&apos;s onchain wallet. The worst roll on the board still returns 70% — you
              can never lose more than 30% on a pull.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/pit" className="btn-lime">
                Enter the Pit →
              </Link>
              <Link href="/floor" className="btn-ghost">
                Get a Boss
              </Link>
            </div>
            <p className="label mt-6">
              Provably fair · Paid in real stock · Never lose more than 30%
            </p>
            <div className="mt-4">
              <TokenAddress compact />
            </div>
          </div>

          {/* Stat rail — live chain reads (activated, burned, book, minted) */}
          <LiveStats />
        </div>
      </section>

      {/* ---- Module chip row ---- */}
      <nav className="shell mt-4 flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="chip transition hover:border-lime/50 hover:text-lime"
          >
            {c.live ? <span className="h-1.5 w-1.5 rounded-full bg-acid" /> : null}
            {c.label}
          </Link>
        ))}
      </nav>

      {/* ---- Modules grid ---- */}
      <section className="shell mt-10">
        <Reveal>
          <p className="label-lime mb-2 flex items-center gap-2">
            <span className="inline-block h-px w-5 bg-lime/60" /> The Floor
          </p>
          <h2 className="headline text-h2">
            Seven desks. One pot. <span className="em">Every fee pays you.</span>
          </h2>
        </Reveal>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m, i) => (
            <Reveal key={m.title} delay={i * 60}>
              <Link href={m.href} className="panel panel-hover group block h-full p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className={`chip ${m.tag === 'SOON' ? 'border-gold/60 text-gold' : 'chip-lime'}`}>
                    {m.tag}
                  </span>
                  <span className="text-dim transition group-hover:translate-x-0.5 group-hover:text-lime">
                    →
                  </span>
                </div>
                <h3 className="headline text-[15px]">{m.title}</h3>
                <p className="mt-2 text-[12.5px] leading-relaxed text-mute">{m.body}</p>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---- The Pit: odds ---- */}
      <section className="shell mt-12">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Reveal>
            <div>
              <p className="label-lime mb-2 flex items-center gap-2">
                <span className="inline-block h-px w-5 bg-lime/60" /> The Pit
              </p>
              <h2 className="headline text-h2">
                Real stock. Real odds. <span className="em">Sealed onchain.</span>
              </h2>
              <div className="mt-5 space-y-4">
                {[
                  ['01', 'The floor is 0.70×', 'The worst roll still returns 70% of your ticket — in stock.'],
                  ['02', 'Wins settle as stock', 'Sell back at 95% of the live mark, or seal the full prize into a certificate — no spread.'],
                  ['03', 'Two lanes, no cap', 'Instant lane for standard tickets. Vault lane with a longer commit delay for size.'],
                  ['04', 'A spent note cannot exist', 'Redeem burns the deed and releases the stock in the same transaction.'],
                ].map(([n, t, b]) => (
                  <div key={n} className="flex gap-4">
                    <span className="label-lime pt-0.5">{n}</span>
                    <div>
                      <p className="font-mono text-[13px] font-semibold uppercase tracking-wide text-paper">
                        {t}
                      </p>
                      <p className="mt-1 text-[12.5px] text-mute">{b}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Link href="/pit" className="btn-lime mt-6 inline-flex">
                Pull the machine →
              </Link>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <OddsTable />
          </Reveal>
        </div>
      </section>

      {/* ---- Be the House ---- */}
      <section className="shell mt-12">
        <Reveal>
          <div className="dashed bg-lime/[0.04] p-7 sm:p-9">
            <p className="label-lime mb-2">Be the House</p>
            <h2 className="headline text-h2">
              Don&apos;t beat the house. <span className="em">Become it.</span>
            </h2>
            <p className="mt-3 max-w-2xl text-[13px] text-mute">
              Stake stock into the pit bankroll and earn on every roll, pro rata. The machine
              inventory belongs to the Bosses who stake it — not a treasury.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                ['Player-owned bankroll', 'The house edge pays the floor, not a treasury.'],
                ['Every roll, your cut', 'Sell-back spread accrues to stakers pro rata.'],
                ['Exit when you want', 'Withdraw subject only to open-round reserves.'],
              ].map(([t, b]) => (
                <div key={t} className="panel-raised px-4 py-4">
                  <p className="font-mono text-[12.5px] font-semibold uppercase tracking-wide text-paper">
                    {t}
                  </p>
                  <p className="mt-1.5 text-[12px] text-mute">{b}</p>
                </div>
              ))}
            </div>
            <Link href="/pit" className="btn-lime mt-6 inline-flex">
              Stake the bankroll
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ---- House Book ---- */}
      <section className="shell mt-12">
        <div className="grid items-center gap-6 lg:grid-cols-2">
          <Reveal>
            <div>
              <p className="label-lime mb-2 flex items-center gap-2">
                <span className="inline-block h-px w-5 bg-lime/60" /> House Book
              </p>
              <h2 className="headline text-h2">
                Every stream. <span className="em">One public pot.</span>
              </h2>
              <p className="mt-3 max-w-lg text-[13px] text-mute">
                Pit edge, certificate fees, launcher fees, locker fees, loan interest — one book
                you can watch fill. When the bar is full, anyone cranks it and takes the tip.
              </p>
              <Link href="/book" className="btn-ghost mt-5 inline-flex">
                Open the book →
              </Link>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="panel p-6">
              {HOUSE_SOURCES.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center justify-between border-b border-line/60 py-2.5 last:border-0"
                >
                  <span className="text-[12px] text-mute">{s.name}</span>
                  <span className="num font-mono text-[13px] text-paper">{s.val}</span>
                </div>
              ))}
              <div className="mt-4 flex items-center justify-between border-t border-limeSoft pt-3.5">
                <span className="label">Accrued this round</span>
                <span className="num font-mono text-[15px] font-semibold text-lime">9.78 ETH</span>
              </div>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-line2">
                <div className="h-full w-[73%] bg-lime" />
              </div>
              <p className="label mt-2">73% to next crank · anyone can pull it</p>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
