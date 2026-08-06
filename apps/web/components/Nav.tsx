'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ConnectButton } from '@/components/ConnectButton';

const LINKS = [
  { href: '/floor', label: 'Floor' },
  { href: '/pit', label: 'Pit' },
  { href: '/certificates', label: 'Certificates' },
  { href: '/launcher', label: 'Launcher' },
  { href: '/locker', label: 'Locker' },
  { href: '/loans', label: 'Loans' },
  { href: '/book', label: 'Book' },
  { href: '/seasons', label: 'Seasons' },
  { href: '/docs', label: 'Docs' },
];

/** Sticky top navigation. Serif wordmark left, routes center, connect right. */
export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-black/80 backdrop-blur">
      <div className="shell flex h-16 items-center justify-between gap-4">
        <Link href="/" className="font-serif text-2xl leading-none tracking-tight">
          Pit<span className="italic text-lime">Bosses</span>
        </Link>

        <nav className="hidden items-center gap-5 lg:flex">
          {LINKS.map((l) => {
            const active = pathname === l.href || (l.href !== '/' && pathname?.startsWith(l.href));
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`text-sm transition-colors ${active ? 'text-lime' : 'text-mute hover:text-paper'}`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            <ConnectButton compact />
          </div>
          <button
            className="lg:hidden text-paper"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
            aria-expanded={open}
          >
            ☰
          </button>
        </div>
      </div>

      {open ? (
        <nav className="lg:hidden border-t border-line bg-black/95">
          <div className="shell grid grid-cols-2 gap-2 py-4">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-mute hover:bg-ink hover:text-paper"
              >
                {l.label}
              </Link>
            ))}
            <div className="col-span-2 mt-2 sm:hidden">
              <ConnectButton />
            </div>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
