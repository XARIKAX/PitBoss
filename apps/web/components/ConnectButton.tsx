'use client';

import { useAppKit } from '@reown/appkit/react';
import { useAccount } from 'wagmi';
import { shortAddr } from '@/lib/format';

/**
 * Connect / account pill.
 *
 * Opens the Reown AppKit "Connect a Wallet" modal, which lists installed
 * extensions (MetaMask, Phantom, Coinbase) AND WalletConnect for mobile, and
 * handles QR / deep-links itself. When connected the pill shows the address and
 * opens the account view (network switch, balance, disconnect).
 */
export function ConnectButton({ compact = false }: { compact?: boolean }) {
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();

  if (isConnected && address) {
    return (
      <button
        onClick={() => open({ view: 'Account' })}
        className="pill-ghost data"
        title={address}
      >
        {shortAddr(address)}
      </button>
    );
  }

  return (
    <button onClick={() => open()} className="pill-lime">
      {compact ? 'Connect' : 'Connect wallet'}
    </button>
  );
}
