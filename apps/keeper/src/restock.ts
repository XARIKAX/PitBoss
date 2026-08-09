/**
 * restock — keeps both Pit games' bankrolls stocked (Degen Roll + Roulette).
 *
 * Each settle skims the edge/rake and feeds the net into the machine's `ethFloat`.
 * `restock()` converts that ETH float into bankroll stock at the oracle mark
 * (permissionless). This bot walks every Degen Roll machine and Roulette wheel
 * registered on their factories and restocks when there is float to convert AND
 * free inventory is short of the headroom it wants against open reserves.
 *
 * Stateless & resumable: consumer set and balances are read fresh each tick.
 */

import {formatEther, getContract, type Abi, type Address} from "viem";
import {
  degenRollAbi,
  degenRollFactoryAbi,
  rouletteWheelAbi,
  rouletteWheelFactoryAbi,
} from "./lib/abis.js";
import {attempt, Backoff} from "./lib/backoff.js";
import {makeClients, requireWallet} from "./lib/client.js";
import {loadConfig} from "./lib/config.js";
import {createLogger} from "./lib/log.js";
import {runLoop} from "./lib/runtime.js";

const BOT = "restock";
const MIN_FREE_BPS = BigInt(process.env.RESTOCK_MIN_FREE_BPS ?? "2000"); // 20%
const MIN_FLOAT_WEI = BigInt(process.env.RESTOCK_MIN_FLOAT_WEI ?? "1000000000000000"); // 0.001 ETH

type PublicClient = ReturnType<typeof makeClients>["publicClient"];
type Logger = ReturnType<typeof createLogger>;
interface Consumer {
  addr: Address;
  abi: Abi;
  kind: string;
}

async function fromFactory(
  publicClient: PublicClient,
  factory: Address,
  factoryAbi: Abi,
  countFn: string,
  listFn: string,
  abi: Abi,
  kind: string,
  backoff: Backoff,
  log: Logger,
): Promise<Consumer[]> {
  const f: any = getContract({address: factory, abi: factoryAbi, client: publicClient});
  const count = (await attempt(() => f.read[countFn](), {
    retries: 5,
    backoff,
    log,
    label: `${kind}.${countFn}`,
  })) as bigint;
  const out: Consumer[] = [];
  for (let i = 0n; i < count; i++) {
    const addr = (await attempt(() => f.read[listFn]([i]), {
      retries: 5,
      backoff,
      log,
      label: `${kind}.${listFn}`,
    })) as Address;
    out.push({addr, abi, kind});
  }
  return out;
}

async function discoverConsumers(
  publicClient: PublicClient,
  degenFactory: Address | undefined,
  rouletteFactory: Address | undefined,
  backoff: Backoff,
  log: Logger,
): Promise<Consumer[]> {
  // Explicit override (comma-separated Degen Roll machines) still supported.
  const override = process.env.MACHINES;
  if (override) {
    return override
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((addr) => ({addr: addr as Address, abi: degenRollAbi as Abi, kind: "degen"}));
  }
  const out: Consumer[] = [];
  if (degenFactory) {
    out.push(
      ...(await fromFactory(
        publicClient,
        degenFactory,
        degenRollFactoryAbi as Abi,
        "machineCount",
        "allMachines",
        degenRollAbi as Abi,
        "degen",
        backoff,
        log,
      )),
    );
  }
  if (rouletteFactory) {
    out.push(
      ...(await fromFactory(
        publicClient,
        rouletteFactory,
        rouletteWheelFactoryAbi as Abi,
        "wheelCount",
        "allWheels",
        rouletteWheelAbi as Abi,
        "roulette",
        backoff,
        log,
      )),
    );
  }
  return out;
}

async function main() {
  const log = createLogger(BOT);
  const cfg = loadConfig();
  const clients = makeClients(cfg);
  const {publicClient} = clients;
  const {walletClient, account} = requireWallet(clients);

  const degenFactory = cfg.addresses.factory;
  const rouletteFactory = cfg.addresses.rouletteFactory;
  if (!degenFactory && !rouletteFactory && !process.env.MACHINES) {
    throw new Error(
      "No factories set (DegenRollFactory / RouletteWheelFactory) and no MACHINES override",
    );
  }

  const rpcBackoff = new Backoff({maxMs: cfg.maxBackoffMs});
  log.info("restock keeper up", {
    degen: degenFactory ?? "(none)",
    roulette: rouletteFactory ?? "(none)",
    minFreeBps: MIN_FREE_BPS.toString(),
  });

  await runLoop(cfg, log, async (ctx) => {
    const consumers = await discoverConsumers(publicClient, degenFactory, rouletteFactory, rpcBackoff, log);
    log.info("consumers discovered", {count: consumers.length});

    for (const {addr, abi, kind} of consumers) {
      if (ctx.stopping()) break;
      const m: any = getContract({address: addr, abi, client: publicClient});

      const [ethFloat, free, reserved] = await Promise.all([
        attempt(() => m.read.ethFloat(), {retries: 3, backoff: rpcBackoff, log, label: "ethFloat"}),
        attempt(() => m.read.freeStock(), {retries: 3, backoff: rpcBackoff, log, label: "freeStock"}),
        attempt(() => m.read.totalReserved(), {
          retries: 3,
          backoff: rpcBackoff,
          log,
          label: "totalReserved",
        }),
      ]) as [bigint, bigint, bigint];

      const target = (reserved * MIN_FREE_BPS) / 10_000n;
      const short = reserved === 0n ? free === 0n : free < target;

      const decision = {
        kind,
        consumer: addr,
        ethFloat: formatEther(ethFloat),
        freeStock: free.toString(),
        reserved: reserved.toString(),
        short,
      };

      if (ethFloat < MIN_FLOAT_WEI) {
        log.debug("no meaningful float, skip", decision);
        continue;
      }
      if (!short) {
        log.debug("inventory adequately stocked, skip", decision);
        continue;
      }

      log.info("restocking", decision);
      try {
        const {request} = await publicClient.simulateContract({
          address: addr,
          abi,
          functionName: "restock",
          account,
        });
        const hash = await walletClient.writeContract(request);
        log.info("restock sent", {consumer: addr, tx: hash});
        const receipt = await publicClient.waitForTransactionReceipt({
          hash,
          confirmations: cfg.confirmations,
        });
        log.info("restock landed", {consumer: addr, tx: hash, status: receipt.status});
      } catch (err) {
        log.warn("restock reverted or lost race", {
          consumer: addr,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  });
}

main().catch((err) => {
  createLogger(BOT).error("fatal", {error: err instanceof Error ? err.stack : String(err)});
  process.exit(1);
});
