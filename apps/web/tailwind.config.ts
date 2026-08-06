import type { Config } from 'tailwindcss';

/**
 * PitBosses design tokens.
 * Colors, fonts and motion are the single source of truth for the whole app.
 * CSS variables are declared in app/globals.css and referenced here so the
 * theme stays in one conceptual place.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './config/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        black: '#0A0A0A',
        ink: '#111110',
        lime: '#C6FF00',
        paper: '#F5F3EE',
        mute: '#8A8A84',
        line: 'rgba(245,243,238,.12)',
      },
      borderColor: {
        DEFAULT: 'rgba(245,243,238,.12)',
        line: 'rgba(245,243,238,.12)',
      },
      fontFamily: {
        // Instrument Serif — display / headlines, lime italic emphasis.
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        // Instrument Sans — body copy.
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        // IBM Plex Mono — DATA ONLY (odds, tickers, addresses, House Book figures).
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        display: ['clamp(2.75rem, 7vw, 6rem)', { lineHeight: '0.98', letterSpacing: '-0.02em' }],
        section: ['clamp(2rem, 4.5vw, 3.5rem)', { lineHeight: '1.02', letterSpacing: '-0.015em' }],
      },
      maxWidth: {
        shell: '1200px',
      },
      keyframes: {
        reveal: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        ticker: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        reveal: 'reveal .6s cubic-bezier(.2,.7,.2,1) both',
        ticker: 'ticker 40s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
