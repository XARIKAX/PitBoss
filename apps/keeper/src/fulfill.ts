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

async function settleGame(
  publicClient: Clients["publicClient"],
  wallet: ReturnType<typeof requireWallet>,
  cfg: Config,
  game: Game,
  conductor: Address,
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
    const ids = await openRounds(publicClient, consumer, game, fromBlock, head, backoff, log);
    open += ids.length;

    for (const roundId of ids) {
      if (stopping()) break;
      const id = entropyId(consumer, roundId);

      let target: bigint;
      try {
        target = (await publicClient.readContract({
          address: conductor,
          abi: entropyConductorAbi,
          functionName: "targetBlockFor",
          args: [consumer, id],
        })) as bigint;
      } catch {
        continue; // no commitment (shouldn't happen for an open round) — skip
      }

      if (head <= target) {
        pending++;
        continue; // target block not mined yet
      }
      if (head > target + WINDOW) {
        aged++;
        log.warn("round aged past blockhash window — refundable after 48h", {
          game: game.name,
          consumer,
          roundId: roundId.toString(),
          target: target.toString(),
          head: head.toString(),
        });
        continue;
      }

      // In window: settle through the consumer (lands the word + resolves).
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
        // Word not landed at target yet, or lost a race — retry next tick.
        log.debug("settle skipped (not ready or race)", {
          game: game.name,
          roundId: roundId.toString(),
          error: err instanceof Error ? err.message : String(err),
        });
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

  const conductor = cfg.addresses.conductor;
  if (!conductor) throw new Error("CONDUCTOR_ADDRESS / deployments EntropyConductor not set");

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

  const rpcBackoff = new Backoff({maxMs: cfg.maxBackoffMs});
  log.info("settle keeper up", {
    conductor,
    degen: cfg.addresses.factory ?? "(none)",
    roulette: cfg.addresses.rouletteFactory ?? "(none)",
    window: WINDOW.toString(),
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
    for (const game of games) {
      if (ctx.stopping()) break;
      if (!game.factory) continue;
      const r = await settleGame(
        publicClient,
        wallet,
        cfg,
        game,
        conductor,
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

    log.info("tick complete", {...totals, head: head.toString()});
  });
}

main().catch((err) => {
  createLogger(BOT).error("fatal", {error: err instanceof Error ? err.stack : String(err)});
  process.exit(1);
});
