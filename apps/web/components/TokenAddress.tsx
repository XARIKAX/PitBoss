'use client';

/**
 * $PITBOSS contract address — visible, copyable, verifiable.
 * Shown in the footer (every page) and on the home hero.
 */
import { useState } from 'react';

export const PITBOSS_TOKEN = '0xd6f542cAdD79F1ec824883a0fdb90cB8c980A7aD';
const EXPLORER = `https://robinhoodchain.blockscout.com/token/${PITBOSS_TOKEN}`;

export function TokenAddress({ compact = false }: { compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(PITBOSS_TOKEN);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — the explorer link still shows the address */
    }
  }

  const shown = compact
    ? `${PITBOSS_TOKEN.slice(0, 8)}…${PITBOSS_TOKEN.slice(-6)}`
    : PITBOSS_TOKEN;

  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-[10px] border border-line bg-black/30 py-1.5 pl-3 pr-1.5">
      <span className="label shrink-0 text-lime">$PITBOSS</span>
      <a
        href={EXPLORER}
        target="_blank"
        rel="noopener noreferrer"
        className="num truncate font-mono text-[11.5px] text-mute transition hover:text-paper"
        title={PITBOSS_TOKEN}
      >
        {shown}
      </a>
      <button
        onClick={copy}
        aria-label="Copy $PITBOSS contract address"
        className={`shrink-0 rounded-[7px] border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] transition ${
          copied
            ? 'border-lime/60 text-lime'
            : 'border-line text-mute hover:border-lime/50 hover:text-lime'
        }`}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
