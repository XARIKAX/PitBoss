/**
 * Social links — X + Telegram, inline SVG (no external assets).
 * Used in the sidebar footer and the site footer.
 */
const SOCIALS = [
  {
    name: 'X',
    href: 'https://x.com/PitBossLabs',
    // X logo
    path: 'M14.23 10.16 22.98 0h-2.07l-7.6 8.82L7.25 0H.25l9.18 13.34L.25 24h2.07l8.02-9.31L16.75 24h7l-9.52-13.84Zm-2.84 3.3-.93-1.33L3.07 1.56h3.19l5.97 8.53.93 1.33 7.76 11.1h-3.19l-6.34-9.06Z',
  },
  {
    name: 'Telegram',
    href: 'https://t.me/PitBossLabs',
    // Telegram paper plane
    path: 'M11.94 0A12 12 0 1 0 24 12 12 12 0 0 0 11.94 0Zm5.9 8.16-1.97 9.3c-.15.66-.54.82-1.1.51l-3.02-2.23-1.46 1.4a.76.76 0 0 1-.61.3l.22-3.08 5.6-5.06c.24-.22-.05-.34-.38-.13l-6.92 4.36-2.98-.93c-.65-.2-.66-.65.14-.96l11.64-4.49c.54-.2 1.01.13.84 1.01Z',
  },
] as const;

export function SocialLinks({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {SOCIALS.map((s) => (
        <a
          key={s.name}
          href={s.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`PitBosses on ${s.name}`}
          className="grid h-8 w-8 place-items-center rounded-[8px] border border-line text-mute transition hover:border-lime/50 hover:text-lime"
        >
          <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d={s.path} />
          </svg>
        </a>
      ))}
    </div>
  );
}
