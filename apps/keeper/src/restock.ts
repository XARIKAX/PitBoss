/**
 * restock — keeps Degen Roll bankrolls stocked.
 *
 * Each settle skims a 10% edge and feeds the 90% net into the machine's `ethFloat`.
 * `restock()` converts that ETH float into bankroll stock at the oracle mark
 * (permissionless). This bot walks every machine registered on the factory and
 * restocks when there is float to convert AND free inventory is running short of
 * the headroom it wants against open reserves (each open pull reserves worst-case
 * 50x). Converting float -> stock replenishes the inventory that backs tickets.
 *
 * Stateless & resumable: machine set and balances are read fresh each tick.
 */

import {formatEther, getContract, type Address} from "viem";
import {degenRollAbi, degenRollFactoryAbi} from "./lib/abis.js";
import {attempt, Backoff} from "./lib/backoff.js";
import {makeClients, requireWallet} from "./lib/client.js";
import {loadConfig} from "./lib/config.js";
import {createLogger} from "./lib/log.js";
import {runLoop} from "./lib/runtime.js";

const BOT = "restock";
// Want free inventory to be at least this fraction (bps) of open reserves before
// considering the machine "stocked". Below it, and with float on hand, restock.
const MIN_FREE_BPS = BigInt(process.env.RESTOCK_MIN_FREE_BPS ?? "2000"); // 20%
// Minimum float worth converting (avoids dust restocks that just pay gas).
const MIN_FLOAT_WEI = BigInt(process.env.RESTOCK_MIN_FLOAT_WEI ?? "1000000000000000"); // 0.001 ETH

async function discoverMachines(
  publicClient: ReturnType<typeof makeClients>["publicClient"],
  factory: Address,
  backoff: Backoff,
  log: ReturnType<typeof createLogger>,
): Promise<Address[]> {
  const override = process.env.MACHINES;
  if (override) {
    return override.split(",").map((s) => s.trim()).filter(Boolean) as Address[];
  }
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
  const cfg = loadConfig();
  const clients = makeClients(cfg);
  const {publicClient} = clients;
  const {walletClient, account} = requireWallet(clients);

  const factory = cfg.addresses.factory;
  if (!factory && !process.env.MACHINES) {
    throw new Error("FACTORY_ADDRESS / deployments DegenRollFactory not set (or provide MACHINES)");
  }

  const rpcBackoff = new Backoff({maxMs: cfg.maxBackoffMs});
  log.info("restock keeper up", {factory, minFreeBps: MIN_FREE_BPS.toString()});

  await runLoop(cfg, log, async (ctx) => {
    const machines = await discoverMachines(publicClient, factory as Address, rpcBackoff, log);
    log.info("machines discovered", {count: machines.length});

    for (const addr of machines) {
      if (ctx.stopping()) break;
      const m = getContract({address: addr, abi: degenRollAbi, client: publicClient});

      const [ethFloat, free, reserved] = await Promise.all([
        attempt(() => m.read.ethFloat(), {retries: 3, backoff: rpcBackoff, log, label: "ethFloat"}),
        attempt(() => m.read.freeStock(), {retries: 3, backoff: rpcBackoff, log, label: "freeStock"}),
        attempt(() => m.read.totalReserved(), {retries: 3, backoff: rpcBackoff, log, label: "totalReserved"}),
      ]);

      // "Short" = free inventory below the headroom target vs open reserves.
      // When there are no open reserves, any positive float is worth converting
      // to grow the bankroll.
      const target = (reserved * MIN_FREE_BPS) / 10_000n;
      const short = reserved === 0n ? free === 0n : free < target;

      const decision = {
        machine: addr,
        ethFloat: formatEther(ethFloat),
        freeStock: free.toString(),
        reserved: reserved.toString(),
        target: target.toString(),
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

      log.info("restocking machine", decision);
      try {
        const {request} = await publicClient.simulateContract({
          address: addr,
          abi: degenRollAbi,
          functionName: "restock",
          account,
        });
        const hash = await walletClient.writeContract(request);
        log.info("restock sent", {machine: addr, tx: hash});
        const receipt = await publicClient.waitForTransactionReceipt({
          hash,
          confirmations: cfg.confirmations,
        });
        log.info("restock landed", {machine: addr, tx: hash, status: receipt.status});
      } catch (err) {
        // Float may have been restocked by another keeper, or oracle stale — skip.
        log.warn("restock reverted or lost race", {
          machine: addr,
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
