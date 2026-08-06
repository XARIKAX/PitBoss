/**
 * fulfill — permissionless convenience keeper.
 *
 * Degen Roll machines and the Opening Bell commit to future entropy through the
 * conductor. Once the source material lands, `conductor.isReady(id)` flips true
 * and anyone may call `conductor.fulfill(id)` to finalize the word so players can
 * settle. This bot watches the conductor's `Committed` events and fulfills every
 * ready-but-unfulfilled id.
 *
 * Stateless & resumable: each tick re-scans a bounded block window and re-derives
 * readiness from chain, so a restart never misses or double-pays (fulfill is
 * idempotent — a second call on a landed id simply reverts and is skipped).
 */

import {getContract, type Hex} from "viem";
import {entropyConductorAbi} from "./lib/abis.js";
import {attempt, Backoff} from "./lib/backoff.js";
import {makeClients, requireWallet} from "./lib/client.js";
import {loadConfig} from "./lib/config.js";
import {createLogger} from "./lib/log.js";
import {runLoop} from "./lib/runtime.js";

const BOT = "fulfill";
const LOOKBACK_BLOCKS = BigInt(process.env.FULFILL_LOOKBACK_BLOCKS ?? "50000");

async function main() {
  const log = createLogger(BOT);
  const cfg = loadConfig();
  const clients = makeClients(cfg);
  const {publicClient} = clients;
  const {walletClient, account} = requireWallet(clients);

  const conductorAddr = cfg.addresses.conductor;
  if (!conductorAddr) throw new Error("CONDUCTOR_ADDRESS / deployments EntropyConductor not set");

  const conductor = getContract({address: conductorAddr, abi: entropyConductorAbi, client: publicClient});
  const rpcBackoff = new Backoff({maxMs: cfg.maxBackoffMs});

  log.info("watching conductor", {conductor: conductorAddr, lookback: LOOKBACK_BLOCKS.toString()});

  await runLoop(cfg, log, async (ctx) => {
    const head = await attempt(() => publicClient.getBlockNumber(), {
      retries: 5,
      backoff: rpcBackoff,
      log,
      label: "getBlockNumber",
    });
    const fromBlock = head > LOOKBACK_BLOCKS ? head - LOOKBACK_BLOCKS : 0n;

    const committed = await attempt(
      () =>
        publicClient.getContractEvents({
          address: conductorAddr,
          abi: entropyConductorAbi,
          eventName: "Committed",
          fromBlock,
          toBlock: head,
        }),
      {retries: 5, backoff: rpcBackoff, log, label: "getContractEvents(Committed)"},
    );

    // De-dup ids (a machine may re-use scoping across the window is impossible,
    // but events can repeat across overlapping scans).
    const ids = new Set<Hex>();
    for (const e of committed) {
      const id = e.args.id as Hex | undefined;
      if (id) ids.add(id);
    }

    let ready = 0;
    let sent = 0;
    for (const id of ids) {
      if (ctx.stopping()) break;

      const done = await attempt(() => conductor.read.isFulfilled([id]), {
        retries: 3,
        backoff: rpcBackoff,
        log,
        label: "isFulfilled",
      });
      if (done) continue;

      const isReady = await attempt(() => conductor.read.isReady([id]), {
        retries: 3,
        backoff: rpcBackoff,
        log,
        label: "isReady",
      });
      if (!isReady) continue;
      ready++;

      try {
        // simulate first so a losing race (someone else fulfilled) is a cheap skip
        const {request} = await publicClient.simulateContract({
          address: conductorAddr,
          abi: entropyConductorAbi,
          functionName: "fulfill",
          args: [id],
          account,
        });
        const hash = await walletClient.writeContract(request);
        log.info("fulfilled", {id, tx: hash});
        await publicClient.waitForTransactionReceipt({hash, confirmations: cfg.confirmations});
        sent++;
      } catch (err) {
        // Lost the race or transient revert — safe to skip; next tick re-derives.
        log.debug("skip id (already fulfilled or reverted)", {
          id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    log.info("tick complete", {committedSeen: ids.size, ready, fulfilled: sent, head: head.toString()});
  });
}

main().catch((err) => {
  createLogger(BOT).error("fatal", {error: err instanceof Error ? err.stack : String(err)});
  process.exit(1);
});
