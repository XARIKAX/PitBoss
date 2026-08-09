import Link from 'next/link';
import { Wordmark } from '@/components/Wordmark';

const NAV = [
  { href: '/floor', label: 'Floor' },
  { href: '/pit', label: 'Pit' },
  { href: '/roulette', label: 'Roulette' },
  { href: '/certificates', label: 'Certificates' },
  { href: '/launcher', label: 'Launcher' },
  { href: '/locker', label: 'Locker' },
  { href: '/loans', label: 'Loans' },
  { href: '/book', label: 'House Book' },
  { href: '/seasons', label: 'Seasons' },
  { href: '/docs', label: 'Docs' },
];

/** Site footer: nav, verbatim legal, cropped lime wordmark. */
export function Footer() {
  return (
    <footer className="mt-24 border-t border-line bg-ink/30">
      <div className="shell py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="eyebrow">PitBoss Labs</p>
            <p className="headline mt-3 max-w-md text-3xl">
              Run the floor. <span className="em">Get paid in stock.</span>
            </p>
          </div>
          <nav className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-mute transition-colors hover:text-paper">
                {n.label}
              </Link>
            ))}
          </nav>
        </div>

        <p className="mt-12 max-w-4xl text-xs leading-relaxed text-mute">
          © 2026 PitBoss Labs. Rewards are promotional, not dividends — they confer no equity,
          ownership, or shareholder rights and are not a share of revenue or profits. Roll features
          are unavailable in restricted regions, including the United States. Nothing on this site is
          financial, investment, legal, or tax advice. This site is a front end only; the underlying
          contracts are permissionless. You are solely responsible for complying with the laws of
          your jurisdiction.
        </p>
      </div>

      {/* Cropped lime wordmark, bled off the bottom. */}
      <Wordmark className="-mb-2" />
    </footer>
  );
}
