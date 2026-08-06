/**
 * season-agg — builds the season leaderboard from on-chain events.
 *
 * Polls activations (ActivationManager), rolls (Degen Roll `Bought`), bankroll
 * stakes (Degen Roll `Staked`) and launcher participation (Opening Bell
 * `Participated`), aggregates a per-address leaderboard for the CURRENT quarterly
 * season, and writes it to the site's published path (default
 * ../web/public/leaderboard.json).
 *
 * Quarterly epoch aware: an event only counts toward the current season if its
 * block timestamp falls within the current UTC quarter. Stateless & resumable:
 * every tick rebuilds the leaderboard from chain — no local accumulation to drift.
 */

import {mkdirSync, renameSync, writeFileSync} from "node:fs";
import {dirname} from "node:path";
import {formatEther, getContract, type Address} from "viem";
import {
  activationManagerAbi,
  degenRollAbi,
  degenRollFactoryAbi,
  openingBellAbi,
} from "./lib/abis.js";
import {attempt, Backoff} from "./lib/backoff.js";
import {makeClients} from "./lib/client.js";
import {loadConfig, type Config} from "./lib/config.js";
import {createLogger, type Logger} from "./lib/log.js";
import {runLoop} from "./lib/runtime.js";

const BOT = "season-agg";

// Scoring weights (points). Tunable via env; documented in README.
const PTS_ACTIVATION = Number(process.env.PTS_ACTIVATION ?? 100);
const PTS_PER_ROLL = Number(process.env.PTS_PER_ROLL ?? 5);
const PTS_PER_ETH_ROLLED = Number(process.env.PTS_PER_ETH_ROLLED ?? 1000);
const PTS_PER_ETH_STAKED_NOTIONAL = Number(process.env.PTS_PER_STAKE ?? 2);
const PTS_LAUNCHER = Number(process.env.PTS_LAUNCHER ?? 50);

interface Entry {
  address: Address;
  activations: number;
  rolls: number;
  rollVolumeEth: string;
  stakes: number;
  launcherParticipations: number;
  score: number;
}

interface Leaderboard {
  season: string;
  chainId: number;
  generatedAt: string;
  fromBlock: string;
  toBlock: string;
  quarterStart: string;
  entries: Entry[];
}

/** UTC quarter label, e.g. "2026-Q3", plus the quarter's start unix seconds. */
function currentSeason(nowMs: number): {label: string; startSec: number} {
  const d = new Date(nowMs);
  const y = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3); // 0..3
  const startMonth = q * 3;
  const startSec = Math.floor(Date.UTC(y, startMonth, 1, 0, 0, 0) / 1000);
  return {label: `${y}-Q${q + 1}`, startSec};
}

/** Estimate the block at/just before `targetSec` via seconds-per-block sampling. */
async function blockAtTimestamp(
  publicClient: ReturnType<typeof makeClients>["publicClient"],
  head: bigint,
  targetSec: number,
  backoff: Backoff,
  log: Logger,
): Promise<bigint> {
  const headBlock = await attempt(() => publicClient.getBlock({blockNumber: head}), {
    retries: 5,
    backoff,
    log,
    label: "getBlock(head)",
  });
  const headSec = Number(headBlock.timestamp);
  if (headSec <= targetSec) return head;

  // Sample ~5000 blocks back to estimate seconds/block.
  const sampleBack = head > 5000n ? head - 5000n : 0n;
  const sampleBlock = await attempt(() => publicClient.getBlock({blockNumber: sampleBack}), {
    retries: 5,
    backoff,
    log,
    label: "getBlock(sample)",
  });
  const spanBlocks = Number(head - sampleBack) || 1;
  const spanSecs = headSec - Number(sampleBlock.timestamp) || spanBlocks; // fallback ~1s/block
  const secPerBlock = spanSecs / spanBlocks || 1;

  const estBack = Math.ceil((headSec - targetSec) / secPerBlock);
  const est = head > BigInt(estBack) ? head - BigInt(estBack) : 0n;
  // Bias a little earlier so we never clip the quarter start; timestamp filter trims the rest.
  const cushion = est > 2000n ? est - 2000n : 0n;
  return cushion;
}

async function discoverMachines(
  publicClient: ReturnType<typeof makeClients>["publicClient"],
  factory: Address | undefined,
  backoff: Backoff,
  log: Logger,
): Promise<Address[]> {
  if (process.env.MACHINES) {
    return process.env.MACHINES.split(",").map((s) => s.trim()).filter(Boolean) as Address[];
  }
  if (!factory) return [];
  const f = getContract({address: factory, abi: degenRollFactoryAbi, client: publicClient});
  const count = await attempt(() => f.read.machineCount(), {retries: 5, backoff, log, label: "machineCount"});
  const out: Address[] = [];
  for (let i = 0n; i < count; i++) {
    out.push(await attempt(() => f.read.allMachines([i]), {retries: 5, backoff, log, label: "allMachines"}));
  }
  return out;
}

async function main() {
  const log = createLogger(BOT);
  const cfg: Config = loadConfig();
  const {publicClient} = makeClients(cfg);
  const rpcBackoff = new Backoff({maxMs: cfg.maxBackoffMs});

  log.info("season aggregator up", {out: cfg.leaderboardPath});

  await runLoop(cfg, log, async () => {
    const now = Date.now();
    const {label: season, startSec} = currentSeason(now);

    const head = await attempt(() => publicClient.getBlockNumber(), {
      retries: 5,
      backoff: rpcBackoff,
      log,
      label: "getBlockNumber",
    });

    // Prefer an explicit season start block if the operator pins one.
    const pinned = process.env.SEASON_START_BLOCK ? BigInt(process.env.SEASON_START_BLOCK) : undefined;
    const fromBlock = pinned ?? (await blockAtTimestamp(publicClient, head, startSec, rpcBackoff, log));

    const machines = await discoverMachines(publicClient, cfg.addresses.factory, rpcBackoff, log);

    // Cache block timestamps so the quarter filter is one fetch per event-bearing block.
    const tsCache = new Map<string, number>();
    const inSeason = async (blockNumber: bigint): Promise<boolean> => {
      const key = blockNumber.toString();
      let ts = tsCache.get(key);
      if (ts === undefined) {
        const b = await attempt(() => publicClient.getBlock({blockNumber}), {
          retries: 3,
          backoff: rpcBackoff,
          log,
          label: "getBlock(event)",
        });
        ts = Number(b.timestamp);
        tsCache.set(key, ts);
      }
      return ts >= startSec;
    };

    const entries = new Map<string, Entry>();
    const rollVolumeWei = new Map<string, bigint>();
    const ensure = (addr: Address): Entry => {
      const key = addr.toLowerCase();
      let e = entries.get(key);
      if (!e) {
        e = {
          address: addr,
          activations: 0,
          rolls: 0,
          rollVolumeEth: "0",
          stakes: 0,
          launcherParticipations: 0,
          score: 0,
        };
        entries.set(key, e);
        rollVolumeWei.set(key, 0n);
      }
      return e;
    };

    // ---- activations ----
    if (cfg.addresses.activation) {
      const logs = await attempt(
        () =>
          publicClient.getContractEvents({
            address: cfg.addresses.activation!,
            abi: activationManagerAbi,
            eventName: "Activated",
            fromBlock,
            toBlock: head,
          }),
        {retries: 5, backoff: rpcBackoff, log, label: "events(Activated)"},
      );
      for (const l of logs) {
        if (!(await inSeason(l.blockNumber!))) continue;
        const owner = l.args.owner as Address | undefined;
        if (owner) ensure(owner).activations++;
      }
    }

    // ---- rolls (Bought) + bankroll stakes (Staked), per machine ----
    for (const machine of machines) {
      const bought = await attempt(
        () =>
          publicClient.getContractEvents({
            address: machine,
            abi: degenRollAbi,
            eventName: "Bought",
            fromBlock,
            toBlock: head,
          }),
        {retries: 5, backoff: rpcBackoff, log, label: "events(Bought)"},
      );
      for (const l of bought) {
        if (!(await inSeason(l.blockNumber!))) continue;
        const player = l.args.player as Address | undefined;
        const ticketEth = (l.args.ticketEth as bigint | undefined) ?? 0n;
        if (!player) continue;
        const e = ensure(player);
        e.rolls++;
        const key = player.toLowerCase();
        rollVolumeWei.set(key, (rollVolumeWei.get(key) ?? 0n) + ticketEth);
      }

      const staked = await attempt(
        () =>
          publicClient.getContractEvents({
            address: machine,
            abi: degenRollAbi,
            eventName: "Staked",
            fromBlock,
            toBlock: head,
          }),
        {retries: 5, backoff: rpcBackoff, log, label: "events(Staked)"},
      );
      for (const l of staked) {
        if (!(await inSeason(l.blockNumber!))) continue;
        const staker = l.args.staker as Address | undefined;
        if (staker) ensure(staker).stakes++;
      }
    }

    // ---- launcher participation (Opening Bell) ----
    if (cfg.addresses.openingBell) {
      const logs = await attempt(
        () =>
          publicClient.getContractEvents({
            address: cfg.addresses.openingBell!,
            abi: openingBellAbi,
            eventName: "Participated",
            fromBlock,
            toBlock: head,
          }),
        {retries: 5, backoff: rpcBackoff, log, label: "events(Participated)"},
      );
      for (const l of logs) {
        if (!(await inSeason(l.blockNumber!))) continue;
        const p = l.args.participant as Address | undefined;
        if (p) ensure(p).launcherParticipations++;
      }
    }

    // ---- score + serialize ----
    const list: Entry[] = [];
    for (const [key, e] of entries) {
      const volWei = rollVolumeWei.get(key) ?? 0n;
      const volEth = Number(formatEther(volWei));
      e.rollVolumeEth = formatEther(volWei);
      e.score = Math.round(
        e.activations * PTS_ACTIVATION +
          e.rolls * PTS_PER_ROLL +
          volEth * PTS_PER_ETH_ROLLED +
          e.stakes * PTS_PER_ETH_STAKED_NOTIONAL +
          e.launcherParticipations * PTS_LAUNCHER,
      );
      list.push(e);
    }
    list.sort((a, b) => b.score - a.score);

    const board: Leaderboard = {
      season,
      chainId: cfg.chainId,
      generatedAt: new Date(now).toISOString(),
      fromBlock: fromBlock.toString(),
      toBlock: head.toString(),
      quarterStart: new Date(startSec * 1000).toISOString(),
      entries: list,
    };

    mkdirSync(dirname(cfg.leaderboardPath), {recursive: true});
    // Atomic write: temp file then rename, so the site never reads a half file.
    const tmp = `${cfg.leaderboardPath}.tmp`;
    writeFileSync(tmp, JSON.stringify(board, null, 2));
    renameSync(tmp, cfg.leaderboardPath);

    log.info("leaderboard written", {
      season,
      entries: list.length,
      machines: machines.length,
      fromBlock: fromBlock.toString(),
      toBlock: head.toString(),
      out: cfg.leaderboardPath,
    });
  });
}

main().catch((err) => {
  createLogger(BOT).error("fatal", {error: err instanceof Error ? err.stack : String(err)});
  process.exit(1);
});
