/**
 * Giant cropped lime wordmark. Used full-bleed in the footer — the baseline is
 * intentionally clipped so the letters bleed off the bottom edge.
 */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden ${className}`} aria-hidden>
      <span
        className="block select-none whitespace-nowrap text-center font-mono font-bold uppercase leading-[0.8] tracking-tighter text-lime/90"
        style={{ fontSize: 'clamp(3.5rem, 15vw, 14rem)', transform: 'translateY(16%)' }}
      >
        PitBosses
      </span>
    </div>
  );
}
