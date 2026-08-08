'use client';

/**
 * Instrument components — the difference between a stat and a gauge.
 * ProgressRing: circular dial (vault doors, graduation). LedBar: segmented
 * meter that fills like hardware (the House Book bar, the Bell bar) — the
 * last segments run gold so "nearly full" reads at a glance.
 */

export function ProgressRing({
  pct,
  size = 92,
  stroke = 6,
  color = '#C6FF00',
  children,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
}) {
  const p = Math.max(0, Math.min(100, pct));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p / 100)}
          style={{
            filter: `drop-shadow(0 0 6px ${color}66)`,
            transition: 'stroke-dashoffset 0.9s cubic-bezier(.2,.8,.2,1)',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}

export function LedBar({
  pct,
  segments = 26,
  className = '',
}: {
  pct: number;
  segments?: number;
  className?: string;
}) {
  const lit = Math.round((Math.max(0, Math.min(100, pct)) / 100) * segments);
  return (
    <div className={`flex gap-[3px] ${className}`}>
      {Array.from({ length: segments }, (_, i) => {
        const on = i < lit;
        const gold = i >= segments - 3;
        const c = gold ? '#F5C842' : '#C6FF00';
        return (
          <span
            key={i}
            className="h-3.5 flex-1 rounded-[2px]"
            style={{
              background: on ? c : 'rgba(255,255,255,0.055)',
              boxShadow: on ? `0 0 8px ${c}55` : undefined,
              transition: 'background .3s, box-shadow .3s',
            }}
          />
        );
      })}
    </div>
  );
}
