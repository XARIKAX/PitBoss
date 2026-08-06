'use client';

/**
 * Bottom ticker strip. DATA — all mono. Shows placeholder live prices, the
 * House Book total, and the last bell. Values are TODO wiring points:
 *   - prices: oracle reads per stock token
 *   - houseBook: HouseBook total accrued
 *   - lastBell: latest Launcher "ring the bell" event
 */
const PLACEHOLDER_ITEMS = [
  'AAPL 224.10 +0.8%',
  'TSLA 251.44 -1.2%',
  'NVDA 132.90 +2.1%',
  'HOOD 61.20 +3.4%',
  'HOUSE BOOK $2.41M',
  'LAST BELL $PIT/ACME +18.2%',
  '$PIT 0.0412 +0.6%',
  'ENTROPY OK · miner',
];

export function Ticker() {
  // Duplicate the list so the -50% translate loops seamlessly.
  const items = [...PLACEHOLDER_ITEMS, ...PLACEHOLDER_ITEMS];

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-black/90 backdrop-blur">
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
