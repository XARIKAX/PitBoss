'use client';

import { useConnectModal, useAccountModal } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { shortAddr } from '@/lib/format';

/**
 * Connect / account pill.
 *
 * Opens RainbowKit's "Connect a Wallet" modal, which lists installed extensions
 * (MetaMask, Phantom, Rabby, Coinbase) AND WalletConnect for mobile, and handles
 * QR / deep-links itself — no third-party badge. When connected the pill shows
 * the address and opens the account modal (balance, chain, disconnect).
 *
 * Custom pill styling is kept by driving RainbowKit through its modal hooks
 * rather than its default button component.
 */
export function ConnectButton({ compact = false }: { compact?: boolean }) {
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();
  const { address, isConnected } = useAccount();

  if (isConnected && address) {
    return (
      <button
        onClick={() => openAccountModal?.()}
        className="pill-ghost data"
        title={address}
      >
        {shortAddr(address)}
      </button>
    );
  }

  return (
    <button onClick={() => openConnectModal?.()} className="pill-lime">
      {compact ? 'Connect' : 'Connect wallet'}
    </button>
  );
}
