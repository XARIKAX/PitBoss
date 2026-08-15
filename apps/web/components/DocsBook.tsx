'use client';

/**
 * The PitBosses book — the protocol explained properly, written and designed
 * as a first-class product surface. Twelve numbered chapters (numbering is
 * honest: this is a reading order), scrollspy chapter rail, instruments and
 * diagrams where a picture beats a paragraph. The auto-generated technical
 * reference (addresses, ABI quick-ref, legal) renders below via DocsViewer.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { OddsLadder } from '@/components/OddsLadder';

const CHAPTERS = [
  { id: 'one-pager', no: '00', title: 'The one-pager' },
  { id: 'floor', no: '01', title: 'The Floor' },
  { id: 'pit', no: '02', title: 'The Pit' },
  { id: 'bankroll', no: '03', title: 'Be the House' },
  { id: 'certificates', no: '04', title: 'Bearer Certificates' },
  { id: 'launcher', no: '05', title: 'Launcher & Bell' },
  { id: 'locker', no: '06', title: 'The Locker' },
  { id: 'loans', no: '07', title: 'Loans' },
  { id: 'book', no: '08', title: 'The House Book' },
  { id: 'seasons', no: '09', title: 'Seasons' },
  { id: 'fairness', no: '10', title: 'Fairness' },
  { id: 'fees', no: '11', title: 'Every fee' },
] as const;

/* ------------------------------------------------------------- primitives */

function P({ children }: { children: React.ReactNode }) {
  return <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-mute">{children}</p>;
}

function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-paper">{children}</strong>;
}

function L({ children }: { children: React.ReactNode }) {
  return <span className="text-lime">{children}</span>;
}

function Chapter({
  id,
  no,
  kicker,
  title,
  children,
}: {
  id: string;
  no: string;
  kicker: string;
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28 border-t border-line/70 pt-10">
      <div className="flex items-start gap-5">
        <span className="data mt-1 text-[13px] text-dim">{no}</span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{kicker}</p>
          <h2 className="headline mt-1.5 text-h2">{title}</h2>
          <div className="mt-5 space-y-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

/** The one rule worth remembering from a chapter. */
function Rule({ children }: { children: React.ReactNode }) {
  return (
    <div className="dashed max-w-[62ch] bg-lime/[0.04] px-5 py-4">
      <p className="label-lime mb-1.5">The rule</p>
      <p className="text-[13px] leading-relaxed text-paper">{children}</p>
    </div>
  );
}

/** Chapter fact strip: the numbers that matter, nothing else. */
function Facts({ items }: { items: [string, string][] }) {
  return (
    <div className="flex max-w-[68ch] flex-wrap gap-2.5">
      {items.map(([k, v]) => (
        <div key={k} className="panel-raised px-3.5 py-2.5">
          <p className="label">{k}</p>
          <p className="num mt-0.5 font-mono text-[15px] font-semibold text-lime">{v}</p>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- diagrams */

/** The money loop: six desks -> one book -> crank -> 888 bosses. */
function MoneyLoop() {
  const streams = ['Pit edge', 'AMM fees', 'Certificates', 'Launcher', 'Locker', 'Loans'];
  return (
    <div className="surface-hero max-w-[68ch] p-6">
      <svg viewBox="0 0 640 240" className="w-full" role="img" aria-label="Six fee streams flow into the House Book; a crank pays 888 bosses in stock.">
        {streams.map((s, i) => {
          const y = 22 + i * 38;
          return (
            <g key={s}>
              <rect x="0" y={y - 14} width="132" height="26" rx="5" fill="rgba(198,255,0,0.05)" stroke="rgba(198,255,0,0.22)" />
              <text x="66" y={y + 3.5} textAnchor="middle" fill="#8A8F84" fontSize="11" fontFamily="monospace">
                {s}
              </text>
              <path d={`M132 ${y} C 200 ${y}, 210 120, 268 120`} fill="none" stroke="rgba(198,255,0,0.3)" strokeWidth="1.2" />
            </g>
          );
        })}
        <rect x="268" y="88" width="120" height="64" rx="7" fill="rgba(198,255,0,0.08)" stroke="#C6FF00" strokeWidth="1.2" />
        <text x="328" y="115" textAnchor="middle" fill="#EAEDE6" fontSize="12" fontFamily="monospace" fontWeight="bold">
          HOUSE BOOK
        </text>
        <text x="328" y="132" textAnchor="middle" fill="#8A8F84" fontSize="10" fontFamily="monospace">
          one public pot
        </text>
        <path d="M388 120 L 452 120" fill="none" stroke="#F5C842" strokeWidth="1.4" markerEnd="url(#gold-arrow)" />
        <text x="420" y="108" textAnchor="middle" fill="#F5C842" fontSize="10" fontFamily="monospace">
          crank
        </text>
        <text x="420" y="140" textAnchor="middle" fill="#565B54" fontSize="9" fontFamily="monospace">
          anyone · 0.5% tip
        </text>
        <rect x="456" y="80" width="184" height="80" rx="7" fill="rgba(245,200,66,0.05)" stroke="rgba(245,200,66,0.4)" />
        <text x="548" y="112" textAnchor="middle" fill="#EAEDE6" fontSize="12" fontFamily="monospace" fontWeight="bold">
          888 BOSSES
        </text>
        <text x="548" y="130" textAnchor="middle" fill="#8A8F84" fontSize="10" fontFamily="monospace">
          paid in the stock they elect
        </text>
        <defs>
          <marker id="gold-arrow" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 Z" fill="#F5C842" />
          </marker>
        </defs>
      </svg>
    </div>
  );
}

/** Commit -> future block -> settle: why nobody can rig a roll. */
function EntropyTimeline() {
  const steps = [
    { t: 'T+0', label: 'You buy a ticket', sub: 'roll committed to a future block' },
    { t: 'T+n', label: 'The block arrives', sub: 'entropy now exists — visible to all' },
    { t: 'settle', label: 'Anyone settles', sub: 'multiplier is pure math on the word' },
  ];
  return (
    <div className="flex max-w-[68ch] flex-col gap-0 sm:flex-row sm:items-stretch sm:gap-3">
      {steps.map((s, i) => (
        <div key={s.t} className="relative flex-1">
          <div className="panel-raised h-full px-4 py-3.5">
            <p className="label-lime">{s.t}</p>
            <p className="mt-1 font-mono text-[12.5px] font-semibold uppercase tracking-wide text-paper">
              {s.label}
            </p>
            <p className="mt-1 text-[11.5px] text-mute">{s.sub}</p>
          </div>
          {i < steps.length - 1 ? (
            <span className="absolute -right-3 top-1/2 hidden -translate-y-1/2 text-dim sm:block">→</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ book */

export function DocsBook() {
  const [active, setActive] = useState<string>(CHAPTERS[0].id);
  const refs = useRef<Record<string, IntersectionObserverEntry>>({});

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) refs.current[e.target.id] = e;
        const visible = CHAPTERS.filter((c) => refs.current[c.id]?.isIntersecting);
        if (visible.length > 0) setActive(visible[0].id);
      },
      { rootMargin: '-15% 0px -70% 0px' },
    );
    for (const c of CHAPTERS) {
      const el = document.getElementById(c.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="grid gap-10 lg:grid-cols-[210px_1fr]">
      {/* chapter rail */}
      <aside className="hidden lg:block">
        <nav className="sticky top-24 space-y-0.5">
          <p className="label mb-3">Chapters</p>
          {CHAPTERS.map((c) => (
            <a
              key={c.id}
              href={`#${c.id}`}
              className={`flex items-baseline gap-2.5 rounded-md px-2.5 py-[7px] text-[12px] transition-colors ${
                active === c.id ? 'bg-ink text-lime' : 'text-mute hover:text-paper'
              }`}
            >
              <span className="data text-[10px] text-dim">{c.no}</span>
              {c.title}
            </a>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 space-y-12">
        {/* ------------------------------------------------ 00 one-pager */}
        <section id="one-pager" className="scroll-mt-28">
          <div className="flex items-start gap-5">
            <span className="data mt-1 text-[13px] text-dim">00</span>
            <div className="min-w-0 flex-1">
              <p className="eyebrow">Start here</p>
              <h2 className="headline mt-1.5 text-h2">
                A casino <span className="em">the players own.</span>
              </h2>
              <div className="mt-5 space-y-4">
                <P>
                  PitBosses is a casino protocol on Robinhood Chain with one structural difference
                  from every casino before it: <B>the house's profit doesn't go to an owner.</B>{' '}
                  Every fee the protocol generates — the pit's edge, trading fees, launch fees,
                  lock fees, loan interest — flows into a single public pot and is paid back out,
                  in tokenized stock, to the people holding its 888 Boss NFTs and staking its
                  bankrolls.
                </P>
                <P>
                  That gives you three ways to stand on the floor, and you can take all three at
                  once. <B>Play</B> — buy tickets in the Pit, where the worst roll still returns
                  70% and the best pays 50×. <B>Bankroll</B> — stake stock into a machine and earn
                  the house edge on every roll against it. <B>Own</B> — hold an activated Boss and
                  collect a pro-rata slice of every fee in the building, delivered as actual stock
                  to a wallet the NFT itself owns.
                </P>
                <Facts
                  items={[
                    ['Bosses', '888'],
                    ['Worst roll', '0.70×'],
                    ['Best roll', '50×'],
                    ['Return to player', '90%'],
                    ['Chain', 'Robinhood · 4663'],
                  ]}
                />
                <Rule>
                  Everything here is permissionless. Every payout, crank, settle and season roll
                  can be triggered by anyone; the contracts hold no admin key over user funds.
                </Rule>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ 01 floor */}
        <Chapter id="floor" no="01" kicker="The collection" title={<>888 Bosses, <span className="em">each with a wallet.</span></>}>
          <P>
            A Boss is an ERC-721 with a trick: through ERC-6551, <B>every token owns a real
            on-chain wallet</B> (a token-bound account). Rewards aren't IOUs in a claims
            contract — stock lands in the Boss's own wallet, and whoever holds the Boss holds the
            wallet. Sell the Boss and the wallet, with everything in it, goes to the buyer.
          </P>
          <P>
            <B>Minting is free.</B> A Boss costs no tokens — only a small ETH fee that goes
            straight to the House Book, so every mint already pays the floor. Two doors:{' '}
            <L>buy next</L> takes whatever's up, <L>snipe</L> pays a higher fee to pull a
            specific Boss out of vault inventory. No bonding curve on the collection, no price
            discovery games: the scarcity is the 888 cap, not the chart.
          </P>
          <P>
            A fresh Boss earns nothing. <B>Activation</B> costs <B>888,888 $PITBOSS</B> —
            444,444 burned forever at the dead address, 444,444 to the reward treasury, where it
            is sold for ETH and paid into the House Book — and switches the Boss onto the floor:
            it accrues weight, builds streaks the longer it stays active, and starts collecting
            from every crank. Transferring a Boss clears activation; the new owner pays to switch
            it back on. You choose what you're paid in: <B>elect any listed stock</B> and the
            book delivers that, or set an auto-DCA target.
          </P>
          <Facts
            items={[
              ['Supply', '888 fixed'],
              ['Mint price', 'free'],
              ['Activation', '888,888 PIT'],
              ['Of which burned', '50%'],
              ['Streak cap', '3.33×'],
            ]}
          />
          <Rule>
            The NFT is the account. Whoever holds the Boss holds its wallet, its history and its
            floor position — there is nothing to migrate and nothing to claim.
          </Rule>
        </Chapter>

        {/* ------------------------------------------------ 02 pit */}
        <Chapter id="pit" no="02" kicker="The game" title={<>Ticket in. <span className="em">Stock out.</span></>}>
          <P>
            Every machine in the Pit is tied to one tokenized stock. You buy a ticket in ETH,
            choose a lane — <L>Instant</L> for standard tickets (capped ~$100), <L>Vault</L> for
            size, with a longer entropy delay and full escrow — and roll. Your multiplier lands on
            a fixed, public 21-rung board, and your payout is delivered as the machine's stock.
          </P>
          <P>
            The board is engineered around one promise: <B>you can never lose more than 30% of a
            ticket.</B> There is no zero on this wheel. ~82% of rolls land on the 0.70–0.75×
            floor — that steady trickle is the house edge working — and the tail runs up through
            2×, 10×, 25×, to a genuine 1-in-1,000 50×. Summed and weighted, the board returns 90
            cents on the dollar; the missing dime is the only house edge in the building.
          </P>
          <OddsLadder />
          <P>
            When a roll settles you choose the exit: <B>sell back instantly</B> at 95% of the live
            oracle mark, hold the stock, or <B>seal the full prize into a bearer certificate</B> —
            no spread on the seal. Lose too many rolls in a row and the machine pays a{' '}
            <B>streak rebate</B> — 10% of your average ticket back, an on-chain tilt cushion.
          </P>
          <P>
            <B>Two tables, one floor.</B> Alongside the Degen Roll, the Pit runs a{' '}
            <B>European single-zero Roulette</B> — bet ETH on a number, colour, dozen or column and
            settle in the same tokenized stock from the same player-owned bankroll. One green zero
            is the only edge (a clean 2.70%), and every spin's rake flows to the Bosses like
            everything else. More tables (crash, plinko, blackjack) plug into the same engine — each
            one another fee tap for the Bosses.
          </P>
          <Rule>
            The floor is law, not policy: every outcome is a pure function of a verifiable random
            word — the Degen Roll's 21-rung board and Roulette's single-zero wheel alike. Nobody,
            including us, can change what a landed roll or spin pays.
          </Rule>
        </Chapter>

        {/* ------------------------------------------------ 03 bankroll */}
        <Chapter id="bankroll" no="03" kicker="The other side of the table" title={<>Don't beat the house. <span className="em">Become it.</span></>}>
          <P>
            The stock a machine pays winners from isn't a treasury — it's a <B>bankroll staked by
            players</B>. Stake stock into a machine (you'll need an activated Boss) and you own a
            pro-rata share of that machine's fate: every losing roll accrues to you, every winning
            roll pays out of the pool, and the sell-back spread lands on your side of the table.
            Over volume, the 10% edge is yours.
          </P>
          <P>
            Solvency is enforced, not promised. A machine <B>reserves 50× of every open ticket</B>{' '}
            before the roll is accepted — the worst case is always funded — and an on-chain
            invariant guarantees the bankroll always covers open reserves. Withdrawals are subject
            only to those open rounds; there is no lockup beyond math. Machine creation is
            permissionless too: spin up a machine for any listed stock and earn{' '}
            <B>2.5% of its action forever</B> as its creator.
          </P>
          <Facts
            items={[
              ['House edge', '10%'],
              ['Worst-case reserve', '50×'],
              ['Creator cut', '2.5%'],
              ['Sell-back', '95% of mark'],
            ]}
          />
        </Chapter>

        {/* ------------------------------------------------ 04 certificates */}
        <Chapter id="certificates" no="04" kicker="Proof you can hold" title={<>Stock, sealed into <span className="em">a deed.</span></>}>
          <P>
            A bearer certificate is a numbered NFT that seals tokenized stock 1:1 — a deed drawn
            fully on-chain, art included. Seal 10 shares of a stock into certificate #217 and that
            note <B>is</B> 10 shares: whoever bears it can redeem it, and redeeming{' '}
            <B>burns the note and releases the stock in the same transaction</B>. A spent note
            cannot exist, so a certificate in your wallet is always backed — there is no state
            where the paper outlives the stock.
          </P>
          <P>
            Sealing costs a flat <B>$2 in ETH</B> (oracle-priced), split between the House Book
            and the protocol reserve. Pit winnings can be sealed straight from a settled roll at
            the full prize value, no sell-back spread — the certificate route is the no-haircut
            exit.
          </P>
          <Rule>
            Redeem burns the deed atomically. Backing is a property of the contract, not a promise
            of the issuer.
          </Rule>
        </Chapter>

        {/* ------------------------------------------------ 05 launcher */}
        <Chapter id="launcher" no="05" kicker="New listings" title={<>Fill the bar. <span className="em">Ring the bell.</span></>}>
          <P>
            The Launcher takes a token from nothing to a live market: launch at a{' '}
            <L>fixed price</L> or on a <L>bonding curve</L>, and when a curve launch hits its
            raise threshold it <B>graduates</B> — 20% of supply seeds a real pool and trading
            moves to the open market. Every curve trade pays a 1% fee.
          </P>
          <P>
            30% of that fee charges the <B>Opening Bell</B> — a buyback bar shared by every live
            launch. When the bar fills, anyone commits a provably fair draw and rings: <B>one
            random live launch gets the whole bar as buy pressure</B>, purchased off its curve and
            burned. The ringer keeps a 0.5% tip. Launching here means every other launch's volume
            might ring for you.
          </P>
          <Facts
            items={[
              ['Curve fee', '1%'],
              ['To the Bell', '30% of fee'],
              ['Graduation seed', '20% supply'],
              ['Ringer tip', '0.5%'],
            ]}
          />
        </Chapter>

        {/* ------------------------------------------------ 06 locker */}
        <Chapter id="locker" no="06" kicker="Proof, not promises" title={<>Locked is <span className="em">locked.</span></>}>
          <P>
            The Locker holds LP positions under three regimes. <B>Hard lock</B>: sealed until a
            date, no early exit, no exceptions. <B>Linear vest</B>: principal streams back
            continuously across the window. <B>Permanent</B>: the key is burned and the liquidity
            is locked forever — the strongest rug-proof statement a token team can make. In every
            mode, <B>trading fees keep flowing</B> and can be collected any time without touching
            principal.
          </P>
          <P>
            The lock itself is an NFT — transferable, sellable, verifiable by anyone on-chain.
            There is deliberately <B>no admin key</B>: the contract cannot release early for
            anyone, including its deployers. A flat Ξ0.01 up-front fee plus a 20% share of
            collected trading fees feeds the House Book.
          </P>
          <Rule>
            "Locked" is checkable by anyone in one read. If the lock says March 2027, no human
            being on earth can open it in February.
          </Rule>
        </Chapter>

        {/* ------------------------------------------------ 07 loans */}
        <Chapter id="loans" no="07" kicker="The pawn desk" title={<>Borrow against it. <span className="em">Keep the upside.</span></>}>
          <P>
            Need liquidity without selling your Boss? Post it at the pawn desk. The vault holds
            the NFT and hands you the <B>full flat principal in $PITBOSS</B> — the same amount for
            every Boss, no appraisal, no oracle games. You pick the term (3–90 days) and pay the
            interest up front in ETH: <B>15% APR pro-rated to the term</B>, so a 30-day loan costs
            a little over 1%. The desk opens once a flat principal is configured for the
            collection (mint itself is free).
          </P>
          <P>
            Repay the exact principal and the Boss comes home. Run late and a 30% APR late fee
            accrues in ETH — but <B>there is no liquidation engine and no margin call</B>. Default
            simply sends the Boss back to the AMM vault it originally came from. Your maximum
            downside is known the moment you borrow, and it's the Boss — never more.
          </P>
          <Facts
            items={[
              ['Principal', 'flat, in PIT'],
              ['APR', '15% pro-rated'],
              ['Late APR', '30%'],
              ['Terms', '3–90 days'],
              ['Liquidations', 'none'],
            ]}
          />
        </Chapter>

        {/* ------------------------------------------------ 08 book */}
        <Chapter id="book" no="08" kicker="Where it all lands" title={<>Six feeds. <span className="em">One public pot.</span></>}>
          <P>
            Every fee in the protocol drains to one place: the <B>House Book</B>. Pit edge,
            AMM trading fees, certificate fees, launcher fees, locker fees, loan interest — six
            streams, one bar, filling in public. You can watch it tick upward in real time on the{' '}
            <Link href="/book" className="text-lime underline underline-offset-2">
              House Book page
            </Link>
            .
          </P>
          <MoneyLoop />
          <P>
            The token feeds the same pot. Half of every 888,888 activation fee burns at the dead
            address; the other half pools at the <B>reward treasury</B>, is sold for ETH, and is
            paid into the bar alongside the game rake.
          </P>
          <P>
            When the bar crosses its threshold, <B>anyone can pull the crank</B>. The crank
            credits the pot across all activated Bosses by floor weight — heavier weight (longer
            streaks, more activity) earns a larger slice, capped at 3.33× so the front row can't
            run away with the room. Each Boss then pulls its share with <L>deliver</L>, arriving
            as ETH or swapped into whichever stock it elected. The cranker keeps 0.5% for the gas
            and the effort; a keeper bot usually beats you to it, and that's fine — the point is
            that <B>nobody has to be trusted to press the button.</B>
          </P>
          <Rule>
            The book's accounting is one invariant: balance always equals the bar plus what's owed.
            The pot cannot leak, and it cannot be skimmed.
          </Rule>
        </Chapter>

        {/* ------------------------------------------------ 09 seasons */}
        <Chapter id="seasons" no="09" kicker="The long game" title={<>Quarterly. <span className="em">Then the reset.</span></>}>
          <P>
            Floor weight compounds — play, stake, launch and borrow, and your Bosses' scores
            climb all quarter. Every season end (anyone can roll it), scores{' '}
            <B>compress 50% toward the mean</B>: the leaders keep an edge but the ladder re-opens,
            and a 5% season bonus pays the quarter's standings. Dynasties are possible;
            monopolies aren't.
          </P>
          <Facts
            items={[
              ['Cadence', 'quarterly'],
              ['Compression', 'keep 50%'],
              ['Season bonus', '5%'],
              ['Roll', 'permissionless'],
            ]}
          />
        </Chapter>

        {/* ------------------------------------------------ 10 fairness */}
        <Chapter id="fairness" no="10" kicker="Why you can't be cheated" title={<>Dice that don't exist <span className="em">yet.</span></>}>
          <P>
            Every random outcome — every pit roll, every bell draw — follows the same discipline:{' '}
            <B>commit first, randomize later.</B> When you buy a ticket, the contract locks your
            roll to entropy from a block that hasn't been produced yet. At commit time the
            information you'd need to cheat does not exist anywhere in the universe — not for
            you, not for us, not for the sequencer.
          </P>
          <EntropyTimeline />
          <P>
            When the target block lands, the entropy word is public and the outcome is frozen —
            settling is just arithmetic anyone can run. The mapping from word to multiplier is a
            pure function in the contract: take any settled roll's word from the chain, run it
            through the table yourself, and you must get the payout you were paid.{' '}
            <B>Every outcome is verifiable after the fact by anyone, forever.</B> If a machine's
            entropy source ever degrades, its badge flips on the Pit page and new rolls pause at
            commit — fail safe, not fail open.
          </P>
          <Rule>
            Trust nothing, verify one thing: word in, multiplier out. If the math checks, the roll
            was fair — no other trust required.
          </Rule>
        </Chapter>

        {/* ------------------------------------------------ 11 fees */}
        <Chapter id="fees" no="11" kicker="The complete schedule" title={<>Every fee, <span className="em">on one page.</span></>}>
          <P>
            No hidden take. This is the complete list of what the protocol charges, and where
            every basis point goes. "Book" means the House Book — the pot that pays Boss holders.
          </P>
          <div className="max-w-[68ch] overflow-x-auto rounded-xl border border-line">
            <table className="data w-full min-w-[560px] border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-mute">
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Fee</th>
                  <th className="px-4 py-3 font-medium">Where it goes</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['Roulette spin', '2% rake', '0.5% creator · 0.5% book · 1% protocol'],
                    ['Pit roll', '10% edge', '2.5% creator · 2.5% book · 5% protocol'],
                    ['Pit sell-back', '5% spread', 'bankroll stakers'],
                    ['Boss buy (AMM)', '0.002 ETH', 'fee → book'],
                    ['Boss snipe (AMM)', '0.006 ETH', 'fee → book'],
                    ['Activation', '888,888 PIT', '50% burned · 50% treasury → book'],
                    ['Certificate seal', '$2 in ETH', '50% book · 50% reserve'],
                    ['Launcher trade', '1% of trade', '70% book · 30% Opening Bell'],
                    ['Bell ring', '—', '0.5% tip to the ringer'],
                    ['Locker', 'Ξ0.01 + 20% of LP fees', 'book'],
                    ['Loan', '15% APR (30% late)', '70% book · 30% reserve'],
                    ['Crank', '—', '0.5% tip to the cranker'],
                  ] as const
                ).map(([a, f, w]) => (
                  <tr key={a} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-2.5 text-paper">{a}</td>
                    <td className="px-4 py-2.5 text-lime">{f}</td>
                    <td className="px-4 py-2.5 text-mute">{w}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <P>
            One reading of that table matters more than the rest: <B>every row ends at the House
            Book or a burn.</B> Fees don't exit the system — they circle back to the people
            holding it up. That's the whole design, and it fits in one sentence: the house always
            wins, so be the house.
          </P>
        </Chapter>
      </div>
    </div>
  );
}
