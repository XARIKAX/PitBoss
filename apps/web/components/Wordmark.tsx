/**
 * Giant cropped lime wordmark. Used full-bleed in the footer — the baseline is
 * intentionally clipped so the letters bleed off the bottom edge.
 */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden ${className}`} aria-hidden>
      <span
        className="block select-none whitespace-nowrap font-serif italic leading-[0.72] text-lime"
        style={{ fontSize: 'clamp(5rem, 22vw, 20rem)', transform: 'translateY(12%)' }}
      >
        PitBosses
      </span>
    </div>
  );
}
