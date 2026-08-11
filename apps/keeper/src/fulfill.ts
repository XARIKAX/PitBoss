/**
 * fulfill (settle keeper) — lands entropy and settles open rounds for both Pit
 * games (Degen Roll + Roulette).
 *
 * Since the audit namespaced conductor commitments by consumer, the word can only
 * be landed by the consumer itself — so this bot does NOT call conductor.fulfill
 * directly. Instead it calls the machine/wheel's `settle(roundId)`, which lands
 * the word and resolves the round in one tx (permissionless; a keeper may settle
 * on any player's behalf — win or lose).
 *
 * Blockhash timing: MinerEntropyConductor seeds each round from a target block's
 * hash, observable only for ~256 blocks. `targetBlockFor(consumer, id)` tells us
 * the target; we settle once `head > target` and warn if a round has aged past
 * `target + WINDOW` (it can then only be refunded after the consumer's 48h window).
 *
 * Stateless & resumable: each tick re-discovers consumers and re-derives the open
 * set from events, so a restart never misses or double-settles (settle on a
 * resolved round simply reverts and is skipped).
 */

import {encodeAbiParameters, getContract, keccak256, type Abi, type Address, type Hex} from "viem";
import {
  degenRollAbi,
  degenRollFactoryAbi,
  entropyConductorAbi,
  rouletteWheelAbi,
  rouletteWheelFactoryAbi,
} from "./lib/abis.js";
import {attempt, Backoff} from "./lib/backoff.js";
import {makeClients, requireWallet} from "./lib/client.js";
import {loadConfig, type Config} from "./lib/config.js";
import {createLogger} from "./lib/log.js";
import {runLoop} from "./lib/runtime.js";

const BOT = "fulfill";
const LOOKBACK_BLOCKS = BigInt(process.env.SETTLE_LOOKBACK_BLOCKS ?? "50000");
// Blockhash is observable for ~256 blocks after the target; leave a safety buffer.
const WINDOW = BigInt(process.env.SETTLE_WINDOW_BLOCKS ?? "256");
// Refresh conductor liveness this many seconds after the last fulfillment. Must
// stay well under the contract's 30-minute STALL_WINDOW so a slow beat (commit,
// wait ~3 blocks, fulfill) still lands before games start rejecting bets.
const HEARTBEAT_AFTER_SECS = BigInt(process.env.HEARTBEAT_AFTER_SECS ?? "600");

type Clients = ReturnType<typeof makeClients>;
type Logger = ReturnType<typeof createLogger>;

interface Game {
  name: string;
  factory?: Address;
  factoryAbi: Abi;
  countFn: string;
  listFn: string;
  abi: Abi;
  boughtEvent: string;
  settledEvent: string;
  refundedEvent: string;
  idKey: string;
}

async function discover(
  publicClient: Clients["publicClient"],
  game: Game,
  backoff: Backoff,
  log: Logger,
): Promise<Address[]> {
  if (!game.factory) return [];
  const f: any = getContract({address: game.factory, abi: game.factoryAbi, client: publicClient});
  const count = (await attempt(() => f.read[game.countFn](), {
    retries: 5,
    backoff,
    log,
    label: `${game.name}.${game.countFn}`,
  })) as bigint;
  const out: Address[] = [];
  for (let i = 0n; i < count; i++) {
    out.push(
      (await attempt(() => f.read[game.listFn]([i]), {
        retries: 5,
        backoff,
        log,
        label: `${game.name}.${game.listFn}`,
      })) as Address,
    );
  }
  return out;
}

/** Open round ids for a consumer = bought − settled − refunded (from events). */
async function openRounds(
  publicClient: Clients["publicClient"],
  consumer: Address,
  game: Game,
  fromBlock: bigint,
  head: bigint,
  backoff: Backoff,
  log: Logger,
): Promise<bigint[]> {
  const scan = (eventName: string) =>
    attempt(
      () =>
        publicClient.getContractEvents({
          address: consumer,
          abi: game.abi,
          eventName: eventName as never,
          fromBlock,
          toBlock: head,
        }),
      {retries: 5, backoff, log, label: `${game.name}.${eventName}`},
    );

  const [bought, settled, refunded] = await Promise.all([
    scan(game.boughtEvent),
    scan(game.settledEvent),
    scan(game.refundedEvent),
  ]);

  const done = new Set<string>();
  for (const e of [...settled, ...refunded]) {
    const id = (e as any).args?.[game.idKey] as bigint | undefined;
    if (id !== undefined) done.add(id.toString());
  }
  const open: bigint[] = [];
  const seen = new Set<string>();
  for (const e of bought) {
    const id = (e as any).args?.[game.idKey] as bigint | undefined;
    if (id === undefined) continue;
    const k = id.toString();
    if (seen.has(k) || done.has(k)) continue;
    seen.add(k);
    open.push(id);
  }
  return open;
}

function entropyId(consumer: Address, roundId: bigint): Hex {
  return keccak256(
    encodeAbiParameters([{type: "address"}, {type: "uint256"}], [consumer, roundId]),
  );
}

/**
 * Conductor liveness heartbeat.
 *
 * `healthy()` is `now - lastFulfillAt <= 30 minutes`, and only `fulfill()` moves
 * `lastFulfillAt`. Games refuse new bets when the conductor is unhealthy, so on a
 * quiet chain the protocol deadlocks: no bets -> no fulfillments -> unhealthy ->
 * no bets. The keeper breaks the cycle by running its own commit/fulfill pair,
 * which is exactly the liveness `healthy()` is meant to measure — the keeper can
 * still land entropy.
 *
 * Commitments are namespaced by msg.sender on the conductor, so the keeper's ids
 * never collide with a game's. A beat spans ticks: commit, then retry fulfill on
 * each subsequent tick until it simulates clean. Readiness is decided by
 * simulating rather than by comparing block numbers, because Solidity's
 * `block.number` and `eth_blockNumber` live in different spaces on Orbit chains
 * (L1 vs L2) and are not comparable.
 */
type Beat = {id: Hex; attempts: number};
const pendingBeats = new Map<Address, Beat>();
// Give up on a beat after this many ticks and commit a fresh one — the target
// hash may have aged out of the conductor's 256-block observable window.
const MAX_BEAT_ATTEMPTS = Number(process.env.HEARTBEAT_MAX_ATTEMPTS ?? "40");

function beatId(nonce: bigint): Hex {
  return keccak256(
    encodeAbiParameters([{type: "string"}, {type: "uint256"}], ["pitboss-keeper-heartbeat", nonce]),
  );
}

async function heartbeat(
  publicClient: Clients["publicClient"],
  wallet: ReturnType<typeof requireWallet>,
  cfg: Config,
  conductor: Address,
  head: bigint,
  log: Logger,
): Promise<void> {
  const {walletClient, account} = wallet;

  const pending = pendingBeats.get(conductor);
  if (pending) {
    try {
      const {request} = await publicClient.simulateContract({
        address: conductor,
        abi: entropyConductorAbi,
        functionName: "fulfill",
        args: [pending.id],
        account,
      });
      const hash = await walletClient.writeContract(request);
      await publicClient.waitForTransactionReceipt({hash, confirmations: cfg.confirmations});
      pendingBeats.delete(conductor);
      log.info("heartbeat landed", {conductor, tx: hash});
    } catch (err) {
      pending.attempts += 1;
      if (pending.attempts >= MAX_BEAT_ATTEMPTS) {
        pendingBeats.delete(conductor);
        log.warn("heartbeat abandoned, will re-commit", {
          conductor,
          attempts: pending.attempts,
          error: err instanceof Error ? err.message : String(err),
        });
      } else {
        log.debug("heartbeat not ready yet", {conductor, attempts: pending.attempts});
      }
    }
    return;
  }

  const lastFulfillAt = (await publicClient.readContract({
    address: conductor,
    abi: entropyConductorAbi,
    functionName: "lastFulfillAt",
  })) as bigint;
  const age = BigInt(Math.floor(Date.now() / 1000)) - lastFulfillAt;
  if (age < HEARTBEAT_AFTER_SECS) return; // still fresh

  // `head` only namespaces the id so repeat beats never reuse a commitment slot;
  // readyAt = now gives the shortest possible delay to the target block.
  const id = beatId(head);
  try {
    const {request} = await publicClient.simulateContract({
      address: conductor,
      abi: entropyConductorAbi,
      functionName: "commit",
      args: [id, BigInt(Math.floor(Date.now() / 1000))],
      account,
    });
    const hash = await walletClient.writeContract(request);
    await publicClient.waitForTransactionReceipt({hash, confirmations: cfg.confirmations});
    pendingBeats.set(conductor, {id, attempts: 0});
    log.info("heartbeat committed", {conductor, ageSecs: age.toString(), tx: hash});
  } catch (err) {
    log.warn("heartbeat commit failed", {
      conductor,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function settleGame(
  publicClient: Clients["publicClient"],
  wallet: ReturnType<typeof requireWallet>,
  cfg: Config,
  game: Game,
  fallbackConductor: Address | undefined,
  conductorsSeen: Set<Address>,
  fromBlock: bigint,
  head: bigint,
  backoff: Backoff,
  log: Logger,
  stopping: () => boolean,
): Promise<{open: number; settled: number; aged: number; pending: number}> {
  const {walletClient, account} = wallet;
  const consumers = await discover(publicClient, game, backoff, log);
  let open = 0,
    settled = 0,
    aged = 0,
    pending = 0;

  for (const consumer of consumers) {
    if (stopping()) break;

    // Read the conductor off the consumer itself — the deployments file can lag
    // behind what the deployed games are actually wired to.
    let conductor = fallbackConductor;
    try {
      conductor = (await publicClient.readContract({
        address: consumer,
        abi: game.abi,
        functionName: "conductor",
      })) as Address;
    } catch {
      // Older build without the getter — fall back to the configured address.
    }
    if (!conductor) continue;
    conductorsSeen.add(conductor);

    const ids = await openRounds(publicClient, consumer, game, fromBlock, head, backoff, log);
    open += ids.length;

    for (const roundId of ids) {
      if (stopping()) break;
      const id = entropyId(consumer, roundId);

      // Advisory only. `head` comes from eth_blockNumber while `target` derives
      // from Solidity's block.number, and on Orbit chains those are different
      // spaces (L2 vs L1) — so this cannot gate the settle. The simulate below is
      // the real readiness check; this read only enriches the aged-out warning.
      // Never skip the round on a failed read: targetBlockFor is declared only on
      // MinerEntropyConductor, so against any other conductor this reverts every
      // time and a `continue` here would silently skip every round forever while
      // the tick still reported settled: 0 as though there were nothing to do.
      let target: bigint | null = null;
      try {
        target = (await publicClient.readContract({
          address: conductor,
          abi: entropyConductorAbi,
          functionName: "targetBlockFor",
          args: [consumer, id],
        })) as bigint;
      } catch {
        target = null; // conductor doesn't expose it — the simulate still decides
      }

      // Settle through the consumer (lands the word + resolves).
      try {
        const {request} = await publicClient.simulateContract({
          address: consumer,
          abi: game.abi,
          functionName: "settle",
          args: [roundId],
          account,
        });
        const hash = await walletClient.writeContract(request);
        log.info("settled", {game: game.name, consumer, roundId: roundId.toString(), tx: hash});
        await publicClient.waitForTransactionReceipt({hash, confirmations: cfg.confirmations});
        settled++;
      } catch (err) {
        // Not ready yet, aged out of the blockhash window, or lost a race. The
        // first is normal and clears on a later tick; only warn once a round is
        // old enough that the hash is likely gone for good.
        pending++;
        const staleBlocks = target === null ? 0n : head > target ? head - target : 0n;
        if (staleBlocks > WINDOW) {
          aged++;
          log.warn("round may have aged past blockhash window — refundable after 48h", {
            game: game.name,
            consumer,
            roundId: roundId.toString(),
            target: target?.toString(),
            head: head.toString(),
          });
        } else {
          log.debug("settle skipped (not ready or race)", {
            game: game.name,
            roundId: roundId.toString(),
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }
  return {open, settled, aged, pending};
}

async function main() {
  const log = createLogger(BOT);
  const cfg = loadConfig();
  const clients = makeClients(cfg);
  const {publicClient} = clients;
  const wallet = requireWallet(clients); // fail fast if no signer

  // Advisory only — the real conductor is read off each consumer below. Kept as a
  // fallback for builds whose games predate the `conductor()` getter.
  const fallbackConductor = cfg.addresses.conductor;

  const games: Game[] = [
    {
      name: "degen",
      factory: cfg.addresses.factory,
      factoryAbi: degenRollFactoryAbi as Abi,
      countFn: "machineCount",
      listFn: "allMachines",
      abi: degenRollAbi as Abi,
      boughtEvent: "Bought",
      settledEvent: "Settled",
      refundedEvent: "Refunded",
      idKey: "roundId",
    },
    {
      name: "roulette",
      factory: cfg.addresses.rouletteFactory,
      factoryAbi: rouletteWheelFactoryAbi as Abi,
      countFn: "wheelCount",
      listFn: "allWheels",
      abi: rouletteWheelAbi as Abi,
      boughtEvent: "SpinBought",
      settledEvent: "SpinSettled",
      refundedEvent: "SpinRefunded",
      idKey: "spinId",
    },
  ];

  // With no factory the loop below skips every game and reports a clean tick
  // forever — a dead keeper that looks healthy. Refuse to start instead.
  if (!cfg.addresses.factory && !cfg.addresses.rouletteFactory) {
    throw new Error(
      "no game factories resolved — the settle keeper would idle forever. " +
        "Set FACTORY_ADDRESS and/or ROULETTE_FACTORY_ADDRESS, or point " +
        `DEPLOYMENTS_DIR at a directory containing deployments.${cfg.chainId}.json ` +
        `(currently ${cfg.deploymentsDir}).`,
    );
  }

  const rpcBackoff = new Backoff({maxMs: cfg.maxBackoffMs});
  log.info("settle keeper up", {
    fallbackConductor: fallbackConductor ?? "(none)",
    degen: cfg.addresses.factory ?? "(none)",
    roulette: cfg.addresses.rouletteFactory ?? "(none)",
    window: WINDOW.toString(),
    heartbeatAfterSecs: HEARTBEAT_AFTER_SECS.toString(),
  });

  await runLoop(cfg, log, async (ctx) => {
    const head = await attempt(() => publicClient.getBlockNumber(), {
      retries: 5,
      backoff: rpcBackoff,
      log,
      label: "getBlockNumber",
    });
    const fromBlock = head > LOOKBACK_BLOCKS ? head - LOOKBACK_BLOCKS : 0n;

    let totals = {open: 0, settled: 0, aged: 0, pending: 0};
    const conductorsSeen = new Set<Address>();
    for (const game of games) {
      if (ctx.stopping()) break;
      if (!game.factory) continue;
      const r = await settleGame(
        publicClient,
        wallet,
        cfg,
        game,
        fallbackConductor,
        conductorsSeen,
        fromBlock,
        head,
        rpcBackoff,
        log,
        ctx.stopping,
      );
      totals = {
        open: totals.open + r.open,
        settled: totals.settled + r.settled,
        aged: totals.aged + r.aged,
        pending: totals.pending + r.pending,
      };
    }

    // Keep every conductor the games depend on above the stall window, so bets
    // stay open on a quiet chain.
    for (const conductor of conductorsSeen) {
      if (ctx.stopping()) break;
      await heartbeat(publicClient, wallet, cfg, conductor, head, log);
    }

    log.info("tick complete", {
      ...totals,
      head: head.toString(),
      conductors: conductorsSeen.size,
    });
  });
}

main().catch((err) => {
  createLogger(BOT).error("fatal", {error: err instanceof Error ? err.stack : String(err)});
  process.exit(1);
});
