/**
 * The Degen Roll multiplier table.
 *
 * Mirror of contracts/src/pit/PrizeTable.sol. Multipliers are the payout on a
 * ticket (1.00 == stake returned); odds are the probability the row lands.
 * Odds sum to 100.00% and RTP (expected value) is 0.90 — the House keeps 10%.
 *
 * DATA — render with the mono font. Do not edit without regenerating the
 * Solidity table and re-verifying the EV test.
 */
export type PrizeRow = {
  /** Payout multiple on the ticket, e.g. 0.70 or 25.0. */
  multiplier: number;
  /** Probability this row lands, in percent (sums to 100). */
  oddsPct: number;
};

export const PRIZE_TABLE: readonly PrizeRow[] = [
  { multiplier: 0.7, oddsPct: 45.18 },
  { multiplier: 0.75, oddsPct: 36.4 },
  { multiplier: 0.8, oddsPct: 2.9 },
  { multiplier: 0.85, oddsPct: 2.24 },
  { multiplier: 0.9, oddsPct: 1.8 },
  { multiplier: 0.95, oddsPct: 1.5 },
  { multiplier: 1.0, oddsPct: 2.5 },
  { multiplier: 1.1, oddsPct: 1.8 },
  { multiplier: 1.25, oddsPct: 1.4 },
  { multiplier: 1.5, oddsPct: 1.1 },
  { multiplier: 1.75, oddsPct: 0.8 },
  { multiplier: 2.0, oddsPct: 0.7 },
  { multiplier: 2.5, oddsPct: 0.5 },
  { multiplier: 3.0, oddsPct: 0.35 },
  { multiplier: 4.0, oddsPct: 0.2 },
  { multiplier: 5.0, oddsPct: 0.16 },
  { multiplier: 7.5, oddsPct: 0.15 },
  { multiplier: 10.0, oddsPct: 0.12 },
  { multiplier: 15.0, oddsPct: 0.06 },
  { multiplier: 25.0, oddsPct: 0.04 },
  { multiplier: 50.0, oddsPct: 0.1 },
] as const;

/** Expected value of a ticket (return-to-player). Should be ~0.90. */
export function expectedValue(): number {
  return PRIZE_TABLE.reduce((ev, r) => ev + r.multiplier * (r.oddsPct / 100), 0);
}

/** House edge in percent, derived from EV. ~10%. */
export function houseEdgePct(): number {
  return (1 - expectedValue()) * 100;
}

/** Sum of odds — used in tests / integrity badges. Should be 100. */
export function totalOddsPct(): number {
  return PRIZE_TABLE.reduce((sum, r) => sum + r.oddsPct, 0);
}

/** Format a multiplier the way the table displays it (e.g. "0.70×", "25.0×"). */
export function fmtMultiplier(m: number): string {
  // Two decimals below 10 (0.70, 1.00, 7.50); one decimal at/above 10 (10.0, 50.0).
  return `${m.toFixed(m >= 10 ? 1 : 2)}×`;
}

/** Format odds as a percent string, e.g. "45.18%". */
export function fmtOdds(pct: number): string {
  return `${pct.toFixed(2)}%`;
}
