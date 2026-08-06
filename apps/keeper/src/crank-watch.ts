/**
 * crank-watch — cranks the House Book when it is profitable to.
 *
 * The House Book is the single fee sink. Once `barBalance() >= crankThreshold`,
 * anyone may call `crank()` and take the 0.5% cranker tip; the rest is distributed
 * pro rata by floor position. This bot only cranks when the tip beats the gas it
 * would spend, and logs the profitability decision either way.
 *
 * Stateless & resumable: the bar balance and threshold are read fresh each tick,
 * so nothing needs to persist across restarts.
 */

import {formatEther, getContract} from "viem";
import {houseBookAbi} from "./lib/abis.js";
import {attempt, Backoff} from "./lib/backoff.js";
import {makeClients, requireWallet} from "./lib/client.js";
import {loadConfig} from "./lib/config.js";
import {createLogger} from "./lib/log.js";
import {runLoop} from "./lib/runtime.js";

const BOT = "crank-watch";
// Gas the crank() call is expected to burn; distribution is O(1) (accumulator),
// but delivery is separate, so this stays modest. Override via env for tuning.
const CRANK_GAS_ESTIMATE = BigInt(process.env.CRANK_GAS_ESTIMATE ?? "180000");

async function main() {
  const log = createLogger(BOT);
  const cfg = loadConfig();
  const clients = makeClients(cfg);
  const {publicClient} = clients;
  const {walletClient, account} = requireWallet(clients);

  const bookAddr = cfg.addresses.houseBook;
  if (!bookAddr) throw new Error("HOUSE_BOOK_ADDRESS / deployments HouseBook not set");

  const book = getContract({address: bookAddr, abi: houseBookAbi, client: publicClient});
  const rpcBackoff = new Backoff({maxMs: cfg.maxBackoffMs});

  log.info("watching House Book", {houseBook: bookAddr});

  await runLoop(cfg, log, async (ctx) => {
    const [bar, chainThreshold, tipBps] = await Promise.all([
      attempt(() => book.read.barBalance(), {retries: 5, backoff: rpcBackoff, log, label: "barBalance"}),
      attempt(() => book.read.crankThreshold(), {retries: 5, backoff: rpcBackoff, log, label: "crankThreshold"}),
      attempt(() => book.read.crankTipBps(), {retries: 5, backoff: rpcBackoff, log, label: "crankTipBps"}),
    ]);

    // Respect both the on-chain threshold and a local floor from env.
    const threshold = chainThreshold > cfg.crankThresholdWei ? chainThreshold : cfg.crankThresholdWei;

    if (bar < threshold) {
      log.info("bar below threshold, waiting", {
        bar: formatEther(bar),
        threshold: formatEther(threshold),
      });
      return;
    }

    // Profitability: tip = bar * tipBps / 10000; gas cost = gasPrice * gasEstimate.
    const tip = (bar * BigInt(tipBps)) / 10_000n;
    const gasPrice = await attempt(
      async () => {
        try {
          return await publicClient.getGasPrice();
        } catch {
          return cfg.gasPriceFallbackWei;
        }
      },
      {retries: 3, backoff: rpcBackoff, log, label: "getGasPrice"},
    );
    const gasCost = gasPrice * CRANK_GAS_ESTIMATE;
    const profit = tip - gasCost;

    const decision = {
      bar: formatEther(bar),
      tipBps,
      tip: formatEther(tip),
      gasPrice: gasPrice.toString(),
      gasCost: formatEther(gasCost),
      netProfit: formatEther(profit),
      profitable: profit > 0n,
    };

    if (profit <= 0n) {
      log.info("crank not profitable, skipping", decision);
      return;
    }
    log.info("crank profitable, cranking", decision);

    if (ctx.stopping()) return;

    try {
      const {request} = await publicClient.simulateContract({
        address: bookAddr,
        abi: houseBookAbi,
        functionName: "crank",
        account,
      });
      const hash = await walletClient.writeContract(request);
      log.info("crank sent", {tx: hash});
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: cfg.confirmations,
      });
      log.info("crank landed", {tx: hash, status: receipt.status, gasUsed: receipt.gasUsed.toString()});
    } catch (err) {
      // Lost the race to another cranker, or bar drained — re-derive next tick.
      log.warn("crank reverted or lost race", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

main().catch((err) => {
  createLogger(BOT).error("fatal", {error: err instanceof Error ? err.stack : String(err)});
  process.exit(1);
});
