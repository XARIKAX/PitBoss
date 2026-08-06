/**
 * Exponential backoff for flaky RPC. Successful calls reset the delay; failures
 * grow it geometrically (with jitter) up to a ceiling. Bots wrap their RPC work
 * in `attempt()` so a node hiccup slows the loop instead of crashing it.
 */

import type {Logger} from "./log.js";

export interface BackoffOptions {
  baseMs?: number;
  maxMs: number;
  factor?: number;
}

export class Backoff {
  private readonly base: number;
  private readonly max: number;
  private readonly factor: number;
  private current: number;

  constructor(opts: BackoffOptions) {
    this.base = opts.baseMs ?? 1_000;
    this.max = opts.maxMs;
    this.factor = opts.factor ?? 2;
    this.current = this.base;
  }

  reset(): void {
    this.current = this.base;
  }

  /** Next delay in ms, with ±20% jitter, then advance toward the ceiling. */
  next(): number {
    const jitter = 1 + (Math.random() * 0.4 - 0.2);
    const delay = Math.min(this.current, this.max) * jitter;
    this.current = Math.min(this.current * this.factor, this.max);
    return Math.round(delay);
  }
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/**
 * Run `fn` with exponential backoff on throw, up to `retries` attempts. Returns
 * the value on success; rethrows the last error once retries are exhausted.
 */
export async function attempt<T>(
  fn: () => Promise<T>,
  opts: {retries: number; backoff: Backoff; log?: Logger; label?: string},
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= opts.retries; i++) {
    try {
      const out = await fn();
      opts.backoff.reset();
      return out;
    } catch (err) {
      lastErr = err;
      if (i === opts.retries) break;
      const wait = opts.backoff.next();
      opts.log?.warn(`${opts.label ?? "rpc"} failed, backing off ${wait}ms`, {
        attempt: i + 1,
        error: err instanceof Error ? err.message : String(err),
      });
      await sleep(wait);
    }
  }
  throw lastErr;
}
