/** Small formatting helpers. Anything returning DATA should render in mono. */

/** Shorten an address: 0x1234…abcd. */
export function shortAddr(addr?: string, size = 4): string {
  if (!addr) return '—';
  if (addr.length <= 2 + size * 2) return addr;
  return `${addr.slice(0, 2 + size)}…${addr.slice(-size)}`;
}

/** Format a token amount from a bigint given decimals, trimmed. */
export function fmtUnits(value: bigint, decimals = 18, maxFrac = 4): string {
  const neg = value < 0n;
  const v = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = v % base;
  let fracStr = frac.toString().padStart(decimals, '0').slice(0, maxFrac).replace(/0+$/, '');
  const out = fracStr ? `${whole.toString()}.${fracStr}` : whole.toString();
  return neg ? `-${out}` : out;
}

/** Compact USD-ish figure, e.g. $1.2M, $840K. Used for House Book totals. */
export function fmtCompact(n: number, currency = '$'): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${currency}${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${currency}${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${currency}${(n / 1e3).toFixed(1)}K`;
  return `${currency}${n.toFixed(2)}`;
}

/** Percent with fixed places. */
export function fmtPct(n: number, places = 2): string {
  return `${n.toFixed(places)}%`;
}

/** Countdown parts from a target timestamp (ms). */
export function countdown(targetMs: number, nowMs = Date.now()) {
  const diff = Math.max(0, targetMs - nowMs);
  const s = Math.floor(diff / 1000);
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    done: diff === 0,
  };
}
