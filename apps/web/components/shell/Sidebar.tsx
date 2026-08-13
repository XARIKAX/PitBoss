'use client';

/**
 * Fixed left sidebar — the app-shell backbone of the terminal design.
 * Desktop: always visible. Mobile: slide-over drawer toggled from the TopBar.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@/components/ConnectButton';
import { SocialLinks } from '@/components/SocialLinks';
import {
  IconHome,
  IconFloor,
  IconPit,
  IconRoulette,
  IconCert,
  IconLauncher,
  IconLocker,
  IconLoans,
  IconBook,
  IconRewards,
  IconSeasons,
  IconDocs,
  IconStats,
  IconTables,
  IconClose,
} from './icons';

const NAV = [
  { href: '/', label: 'Home', icon: IconHome },
  { href: '/floor', label: 'The Floor', icon: IconFloor },
  { href: '/pit', label: 'The Pit', icon: IconPit },
  { href: '/roulette', label: 'Roulette', icon: IconRoulette },
  { href: '/tables', label: 'House Tables', icon: IconTables },
  { href: '/certificates', label: 'Certificates', icon: IconCert },
  { href: '/launcher', label: 'Launcher', icon: IconLauncher },
  { href: '/locker', label: 'Locker', icon: IconLocker },
  { href: '/loans', label: 'Loans', icon: IconLoans },
  { href: '/book', label: 'House Book', icon: IconBook },
  { href: '/rewards', label: 'Proof of Rewards', icon: IconRewards },
  { href: '/stats', label: 'Trackers', icon: IconStats },
  { href: '/seasons', label: 'Seasons', icon: IconSeasons },
  { href: '/docs', label: 'Docs', icon: IconDocs },
] as const;

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <>
      {/* Mobile scrim */}
      {open ? (
        <button
          aria-label="Close menu"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[var(--sidebar-w)] flex-col border-r border-line bg-base/95 backdrop-blur transition-transform lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand */}
        <div className="flex h-[var(--topbar-h)] items-center justify-between border-b border-line px-4">
          <Link href="/" onClick={onClose} className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/icon-64.png"
              alt="PitBosses logo — the Boss on his throne"
              width={28}
              height={28}
              className="h-7 w-7 rounded-[6px] border border-line [image-rendering:pixelated]"
            />
            <span className="font-mono text-[13.5px] font-bold uppercase tracking-[0.08em]">
              Pit<span className="text-lime">Bosses</span>
            </span>
          </Link>
          <button onClick={onClose} className="text-mute hover:text-paper lg:hidden" aria-label="Close">
            <IconClose />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                aria-current={active ? 'page' : undefined}
                className={`relative mx-2 mb-0.5 flex items-center gap-3 rounded-[6px] px-3 py-2.5 font-mono text-[12.5px] uppercase tracking-[0.09em] transition ${
                  active
                    ? 'bg-ink2 text-lime'
                    : 'text-mute hover:bg-ink hover:text-paper'
                }`}
              >
                {active ? (
                  <span className="absolute left-0 top-1/2 h-5 w-[2.5px] -translate-y-1/2 rounded-full bg-lime" />
                ) : null}
                <Icon className={active ? 'text-lime' : 'text-dim'} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Wallet + status */}
        <div className="border-t border-line p-4">
          <ConnectButton compact={false} />
          <div className="mt-3 flex items-center justify-between">
            <span className="label">Robinhood Chain</span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-acid">
              <span className="h-1.5 w-1.5 animate-dot rounded-full bg-acid" /> Online
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-3">
            <span className="label">Community</span>
            <SocialLinks />
          </div>
        </div>
      </aside>
    </>
  );
}
