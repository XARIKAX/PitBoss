'use client';

import { useEffect, useRef, useState } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { shortAddr } from '@/lib/format';

/**
 * Connect / disconnect pill.
 *
 * With a single connector (WalletConnect not configured) it connects directly.
 * With more than one (injected + WalletConnect) it opens a small picker so
 * phone users can choose WalletConnect (QR) instead of a browser-extension
 * wallet that doesn't exist on mobile. Previously this always used
 * connectors[0] (injected), which is why mobile never got a QR.
 */
export function ConnectButton({ compact = false }: { compact?: boolean }) {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close the picker on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (isConnected && address) {
    return (
      <button onClick={() => disconnect()} className="pill-ghost data" title={address}>
        {shortAddr(address)}
      </button>
    );
  }

  const label = isPending ? 'Connecting…' : compact ? 'Connect' : 'Connect wallet';

  // TEMP DIAGNOSTIC: is the WalletConnect connector present in this build?
  // If the projectId env var didn't bake in, WC is absent and mobile can't
  // connect. This marker lets us confirm on the phone without a console.
  const hasWC = connectors.some((c) => /walletconnect/i.test(c.name));
  const diag = (
    <sup
      className="ml-1 align-super text-[9px] font-mono"
      style={{ color: hasWC ? '#a3e635' : '#f87171' }}
      title={`connectors: ${connectors.map((c) => c.name).join(', ') || 'none'}`}
    >
      {hasWC ? 'wc✓' : 'wc✗'}
    </sup>
  );

  // Only one connector available → connect directly, no picker. The button is
  // never hard-disabled, so a hung attempt can always be retried.
  if (connectors.length <= 1) {
    const only = connectors[0];
    return (
      <button
        onClick={() => only && connect({ connector: only })}
        className="pill-lime"
      >
        {label}
        {diag}
      </button>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <button onClick={() => setOpen((v) => !v)} className="pill-lime">
        {label}
        {diag}
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-ink shadow-2xl">
          {connectors.map((c) => (
            <button
              key={c.uid}
              onClick={() => {
                setOpen(false);
                connect({ connector: c });
              }}
              className="block w-full border-b border-line/60 px-4 py-3 text-left text-sm text-paper transition last:border-0 hover:bg-ink2"
            >
              {connectorLabel(c.name)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Friendlier labels than raw connector names. */
function connectorLabel(name: string): string {
  if (/walletconnect/i.test(name)) return 'WalletConnect · mobile / QR';
  if (/coinbase/i.test(name)) return 'Coinbase Wallet';
  if (/injected|metamask|browser/i.test(name)) return 'Browser wallet · MetaMask';
  return name;
}
