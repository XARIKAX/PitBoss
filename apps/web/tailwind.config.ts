import type { Config } from 'tailwindcss';

/**
 * PitBosses design tokens — terminal-trading system.
 * Mono-first, neon-green-on-black, boxed panels with dashed accents.
 * CSS variables live in app/globals.css; this file exposes them to utilities.
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
        black: '#080A08',
        base: '#0A0C0A',
        ink: '#0E110E', // panel background
        ink2: '#121612', // raised panel / hover
        lime: '#C6FF00', // primary accent
        acid: '#9EF01A', // secondary green (dots, positive)
        red: '#FF5C5C', // negative / down
        paper: '#EAEDE6', // primary text
        mute: '#8A8F84', // secondary text
        dim: '#565B54', // tertiary / labels
        line: 'rgba(198,255,0,0.10)', // hairline (green-tinted)
        line2: 'rgba(234,237,230,0.10)',
      },
      borderColor: {
        DEFAULT: 'rgba(198,255,0,0.10)',
        line: 'rgba(198,255,0,0.10)',
        limeSoft: 'rgba(198,255,0,0.35)',
      },
      fontFamily: {
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        sans: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.03em',
        label: '0.14em',
      },
      fontSize: {
        display: ['clamp(2.6rem, 6vw, 5rem)', { lineHeight: '0.96', letterSpacing: '-0.02em' }],
        h1: ['clamp(1.9rem, 3.4vw, 3rem)', { lineHeight: '1.0', letterSpacing: '-0.01em' }],
        h2: ['clamp(1.4rem, 2.2vw, 2rem)', { lineHeight: '1.05', letterSpacing: '-0.005em' }],
      },
      maxWidth: {
        shell: '1180px',
      },
      keyframes: {
        reveal: {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        ticker: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        blink: { '0%,49%': { opacity: '1' }, '50%,100%': { opacity: '0' } },
        pulseDot: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
        scan: { from: { backgroundPosition: '0 0' }, to: { backgroundPosition: '0 -800px' } },
      },
      animation: {
        reveal: 'reveal .55s cubic-bezier(.2,.7,.2,1) both',
        ticker: 'ticker 44s linear infinite',
        blink: 'blink 1.1s steps(1) infinite',
        dot: 'pulseDot 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
