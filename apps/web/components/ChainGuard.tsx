'use client';

import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { CHAINS, PRIMARY_CHAIN, isSupported, SUPPORTED_CHAIN_IDS } from '@/config/chains';

/**
 * Chain guard + add-network prompt.
 *
 * When connected to an unsupported chain, renders a banner that offers to switch
 * (or add) the primary chain. wagmi's switchChain will trigger wallet_addEthereumChain
 * when the chain is unknown to the wallet — that is the "add network" path.
 *
 * Renders children only when the connected chain is supported (or no wallet is
 * connected, so read-only browsing still works against the primary chain).
 */
export function ChainGuard({ children }: { children: React.ReactNode }) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  const ok = !isConnected || isSupported(chainId);

  if (ok) return <>{children}</>;

  return (
    <div className="shell py-10">
      <div className="card border-lime/40">
        <p className="eyebrow">Wrong network</p>
        <h2 className="headline mt-2 text-2xl">
          Step onto the <span className="em">floor.</span>
        </h2>
        <p className="mt-2 max-w-prose text-sm text-mute">
          You're connected to an unsupported chain. Switch to {PRIMARY_CHAIN.name} (or Base) to keep
          going. If your wallet doesn't know the network yet, we'll prompt you to add it.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          {SUPPORTED_CHAIN_IDS.map((id) => (
            <button
              key={id}
              onClick={() => switchChain({ chainId: id })}
              disabled={isPending}
              className="pill-lime disabled:opacity-60"
            >
              {isPending ? 'Switching…' : `Switch to ${CHAINS[id].name}`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
