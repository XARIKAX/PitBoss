/** Inline stroke icons (18px grid). No external icon dependency. */
import type { SVGProps } from 'react';

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...p,
});

export const IconHome = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M9.5 21v-6h5v6" /></svg>
);
export const IconFloor = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 3 3 8l9 5 9-5-9-5Z" /><path d="M3 12l9 5 9-5" /><path d="M3 16l9 5 9-5" /></svg>
);
export const IconPit = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" /><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" /></svg>
);
export const IconRoulette = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3" /><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2.1 2.1M15.9 15.9 18 18M18 6l-2.1 2.1M8.1 15.9 6 18" /></svg>
);
export const IconCert = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="4" y="3.5" width="16" height="13" rx="2" /><path d="M7 8h10M7 11h6" /><circle cx="12" cy="18.5" r="2.2" /><path d="m10.4 20 -0.6 2.5 2.2-1.2 2.2 1.2-0.6-2.5" /></svg>
);
export const IconLauncher = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 3c3.2 1.4 5 4.6 5 8 0 1.6-.5 3-1.2 4.2H8.2C7.5 14 7 12.6 7 11c0-3.4 1.8-6.6 5-8Z" /><circle cx="12" cy="10" r="1.6" /><path d="M8.5 16.5 7 20l3-1M15.5 16.5 17 20l-3-1" /></svg>
);
export const IconLocker = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="4.5" y="10" width="15" height="10.5" rx="2" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10" /><circle cx="12" cy="15" r="1.3" fill="currentColor" stroke="none" /></svg>
);
export const IconLoans = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 9.5 12 4l9 5.5" /><path d="M4.5 9.5V19M19.5 9.5V19M9 9.5V19M15 9.5V19" /><path d="M3 21h18" /></svg>
);
export const IconBook = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M5 4.5h9a3 3 0 0 1 3 3V21a2.5 2.5 0 0 0-2.5-2.5H5Z" /><path d="M19 6.5V21" /><path d="M8 8.5h6M8 11.5h6" /></svg>
);
export const IconSeasons = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M7 4h10v3a5 5 0 0 1-10 0Z" /><path d="M7 5H4.5v1.5A2.5 2.5 0 0 0 7 9M17 5h2.5v1.5A2.5 2.5 0 0 1 17 9" /><path d="M12 12v3M9 20h6M10 17h4l.5 3h-5Z" /></svg>
);
export const IconDocs = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M6 3.5h8l4 4V20.5H6Z" /><path d="M13.5 3.5V8H18" /><path d="M9 12h6M9 15h6M9 18h4" /></svg>
);
export const IconWallet = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="3.5" y="6" width="17" height="13" rx="2.5" /><path d="M3.5 9.5h17" /><circle cx="16.5" cy="13" r="1.2" fill="currentColor" stroke="none" /></svg>
);
export const IconMenu = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);
export const IconClose = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IconArrow = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
