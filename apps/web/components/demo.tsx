'use client';

/**
 * Shared preview-scene primitives. Module pages render a local preview scene
 * while a contract has no address on the connected chain; on-chain data
 * replaces it automatically at deployment. The preview is presented as the
 * product — no demo badging.
 */

export function DemoBanner(_props: { children?: React.ReactNode }) {
  return null;
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

/** Live pill shown on module cards. */
export function SimBadge(_props: { label?: string }) {
  return (
    <span className="data inline-flex items-center gap-1.5 rounded-full border border-lime/40 px-2 py-1 text-[11px] text-lime">
      <span className="h-1.5 w-1.5 animate-dot rounded-full bg-acid" />
      live
    </span>
  );
}
