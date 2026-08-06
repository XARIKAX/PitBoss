/**
 * Shared loop runner. Every bot is stateless and resumable: each tick derives
 * everything it needs from chain state, does its work, and sleeps. RPC errors
 * inside a tick are caught and backed off so one bad response never kills the
 * process. SIGINT/SIGTERM stop the loop cleanly after the in-flight tick.
 */

import {Backoff, sleep} from "./backoff.js";
import type {Config} from "./config.js";
import type {Logger} from "./log.js";

export interface LoopContext {
  log: Logger;
  /** True once a shutdown signal has been received; long ticks should bail. */
  stopping: () => boolean;
}

/**
 * Run `tick` forever on `pollIntervalMs`. `tick` should be idempotent — a missed
 * or repeated run must not corrupt anything, since all state lives on-chain.
 */
export async function runLoop(
  cfg: Config,
  log: Logger,
  tick: (ctx: LoopContext) => Promise<void>,
): Promise<void> {
  let stopping = false;
  const stop = (sig: string) => {
    if (stopping) return;
    stopping = true;
    log.info(`received ${sig}, finishing current tick then exiting`);
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));

  const ctx: LoopContext = {log, stopping: () => stopping};
  const backoff = new Backoff({maxMs: cfg.maxBackoffMs});

  log.info("started", {chainId: cfg.chainId, pollIntervalMs: cfg.pollIntervalMs});

  while (!stopping) {
    const startedAt = Date.now();
    try {
      await tick(ctx);
      backoff.reset();
    } catch (err) {
      const wait = backoff.next();
      log.error(`tick failed, backing off ${wait}ms`, {
        error: err instanceof Error ? err.message : String(err),
      });
      await sleep(wait);
      continue;
    }
    if (stopping) break;
    const elapsed = Date.now() - startedAt;
    const wait = Math.max(0, cfg.pollIntervalMs - elapsed);
    await sleep(wait);
  }

  log.info("stopped");
  process.exit(0);
}
