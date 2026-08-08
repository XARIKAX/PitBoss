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

  // Only one connector available → connect directly, no picker.
  if (connectors.length <= 1) {
    const only = connectors[0];
    return (
      <button
        onClick={() => only && connect({ connector: only })}
        disabled={isPending || !only}
        className="pill-lime disabled:opacity-60"
      >
        {label}
      </button>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className="pill-lime disabled:opacity-60"
      >
        {label}
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
