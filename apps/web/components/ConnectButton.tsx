'use client';

import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { shortAddr } from '@/lib/format';

/**
 * Connect / disconnect pill. Uses the first available connector by default and
 * shows the injected + WalletConnect choices when more than one is present.
 */
export function ConnectButton({ compact = false }: { compact?: boolean }) {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button onClick={() => disconnect()} className="pill-ghost data" title={address}>
        {shortAddr(address)}
      </button>
    );
  }

  const primary = connectors[0];

  return (
    <button
      onClick={() => primary && connect({ connector: primary })}
      disabled={isPending || !primary}
      className="pill-lime disabled:opacity-60"
    >
      {isPending ? 'Connecting…' : compact ? 'Connect' : 'Connect wallet'}
    </button>
  );
}
