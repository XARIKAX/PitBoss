'use client';

/**
 * Shared demo-scene primitives. Every module page renders a simulated,
 * clearly-badged scene while its contract has no address on the connected
 * chain, so the product is visible (and playable where it makes sense)
 * before deployments land. Live data replaces the demos automatically.
 */

export function DemoBanner({ children }: { children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-gold/40 bg-gold/[0.05] px-4 py-3">
      <span className="chip border-gold/60 text-gold">DEMO MODE</span>
      <p className="text-xs text-mute">
        {children ??
          "Contracts aren't deployed on this chain yet — this is a simulated preview. Live data replaces it automatically at deployment."}
      </p>
    </div>
  );
}

export function Meter({ pct, className = '' }: { pct: number; className?: string }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-black/60 ${className}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-lime to-gold transition-all duration-700"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

/** Pixel boss portrait. Maps any id onto the 10 shipped genesis stills. */
export function BossFace({
  n,
  size = 40,
  className = '',
}: {
  n: number;
  size?: number;
  className?: string;
}) {
  const img = ((Math.abs(n) - 1) % 10) + 1;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/bosses/${img}.png`}
      alt={`PitBoss #${n}`}
      width={size}
      height={size}
      className={`rounded-lg border border-line [image-rendering:pixelated] ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/** Gold "sim" pill used on demo cards. */
export function SimBadge({ label = 'sim' }: { label?: string }) {
  return (
    <span className="data inline-flex items-center gap-1.5 rounded-full border border-gold/40 px-2 py-1 text-[11px] text-gold">
      <span className="h-1.5 w-1.5 rounded-full bg-gold" />
      {label}
    </span>
  );
}
