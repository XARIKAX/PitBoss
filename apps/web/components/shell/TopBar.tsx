'use client';

/**
 * Slim top bar inside the shell: mobile menu button, a live status line
 * ("THE PIT IS OPEN"), and the primary CTA. Mirrors the terminal reference's
 * "BROKER BOX IS LIVE · RING THE BELL →" strip.
 */
import Link from 'next/link';
import { IconMenu, IconArrow } from './icons';

export function TopBar({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-[var(--topbar-h)] items-center justify-between gap-3 border-b border-line bg-base/85 px-4 backdrop-blur sm:px-6">
      <button onClick={onMenu} className="text-mute hover:text-paper lg:hidden" aria-label="Open menu">
        <IconMenu />
      </button>

      <div className="hidden items-center gap-2.5 font-mono text-[11.5px] uppercase tracking-[0.14em] text-mute sm:flex">
        <span className="h-1.5 w-1.5 animate-dot rounded-full bg-lime" />
        The Pit is open
        <span className="text-dim">·</span>
        <span className="text-paper">House Book filling</span>
      </div>

      <div className="flex items-center gap-2.5">
        <Link href="/book" className="btn-ghost hidden sm:inline-flex">
          Crank the payout
        </Link>
        <Link href="/pit" className="btn-lime">
          Enter the Pit <IconArrow width={14} height={14} />
        </Link>
      </div>
    </header>
  );
}
