'use client';

import { formatEther } from 'viem';
import { useContracts, useRead } from '@/lib/contracts';
import { isDeployed } from '@/lib/deployments';

/**
 * Bottom ticker strip. DATA — all mono. Live items where contracts are
 * deployed (House Book bar, entropy health); stock tickers stay static until a
 * price oracle address ships.
 */
const STATIC_ITEMS = [
  'AAPL 224.10 +0.8%',
  'TSLA 251.44 -1.2%',
  'NVDA 132.90 +2.1%',
  'HOOD 61.20 +3.4%',
];

export function Ticker() {
  const { c, chain } = useContracts();

  const bar = useRead<bigint>({
    contract: c.houseBook,
    functionName: 'bar',
    refetchInterval: 30_000,
  });
  const healthy = useRead<boolean>({
    contract: c.entropyConductor,
    functionName: 'healthy',
    refetchInterval: 30_000,
  });

  const live: string[] = [];
  if (isDeployed(c.houseBook.address)) {
    live.push(`HOUSE BOOK ${bar.data != null ? `Ξ${formatEther(bar.data)}` : '…'}`);
  } else {
    live.push('HOUSE BOOK —');
  }
  live.push(
    isDeployed(c.entropyConductor.address)
      ? `ENTROPY ${healthy.data == null ? '…' : healthy.data ? 'OK' : 'DEGRADED'} · ${chain.entropyKind}`
      : `ENTROPY — · ${chain.entropyKind}`,
  );

  const all = [...STATIC_ITEMS, ...live];
  // Duplicate the list so the -50% translate loops seamlessly.
  const items = [...all, ...all];

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-black/90 backdrop-blur lg:left-[var(--sidebar-w)]">
      <div className="relative overflow-hidden py-2">
        <div className="animate-ticker flex w-max whitespace-nowrap will-change-transform">
          {items.map((item, i) => (
            <span key={i} className="data mx-6 text-xs text-mute">
              <span className="text-lime">▸</span> {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
