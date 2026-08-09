/**
 * Config loading. One `.env` file feeds every bot; on-chain addresses come from
 * the committed `deployments.<chainId>.json` when present, and can be overridden
 * per-bot via env. Nothing here is bot-specific — the four bots share it.
 */

import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";
import {getAddress, type Address} from "viem";

/** Addresses populated by the deploy script into deployments.<chainId>.json. */
export interface Deployments {
  PIT?: Address;
  PitBoss?: Address;
  InitializingRegistry?: Address;
  PitBossAccount?: Address;
  FlatAMMVault?: Address;
  ActivationManager?: Address;
  FloorPosition?: Address;
  HouseBook?: Address;
  CertificateCounter?: Address;
  BearerCertificate?: Address;
  DegenRollFactory?: Address;
  RouletteWheelFactory?: Address;
  LiquidityLocker?: Address;
  LoanVault?: Address;
  LauncherFactory?: Address;
  OpeningBell?: Address;
  EntropyConductor?: Address;
  [key: string]: Address | undefined;
}

export interface Config {
  rpcUrl: string;
  chainId: number;
  privateKey?: `0x${string}`;
  pollIntervalMs: number;
  /** Max exponential-backoff ceiling for RPC error retries. */
  maxBackoffMs: number;
  /** Confirmations to wait on writes before considering a tx landed. */
  confirmations: number;
  /** Absolute path the season-agg bot writes its leaderboard JSON to. */
  leaderboardPath: string;
  /** Directory that holds deployments.<chainId>.json. */
  deploymentsDir: string;
  deployments: Deployments;
  addresses: {
    houseBook?: Address;
    factory?: Address;
    rouletteFactory?: Address;
    conductor?: Address;
    activation?: Address;
    floorPosition?: Address;
    openingBell?: Address;
    launcherFactory?: Address;
  };
  /** crank-watch: bar balance (wei) at/above which a crank is considered. */
  crankThresholdWei: bigint;
  /** Fixed gas-price fallback (wei) when the node cannot estimate. */
  gasPriceFallbackWei: bigint;
}

function req(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") throw new Error(`missing required env: ${name}`);
  return v;
}

function opt(name: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? undefined : v;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`env ${name} is not a number: ${v}`);
  return n;
}

function bigintWei(name: string, fallback: bigint): bigint {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return BigInt(v);
}

function addr(name: string): Address | undefined {
  const v = opt(name);
  return v ? getAddress(v) : undefined;
}

/** Read and checksum every address in the committed deployments file, if any. */
export function loadDeployments(dir: string, chainId: number): Deployments {
  const file = resolve(dir, `deployments.${chainId}.json`);
  if (!existsSync(file)) return {};
  const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  // Deploy scripts sometimes nest under a "contracts" or "addresses" key.
  const flat = (raw.contracts ?? raw.addresses ?? raw) as Record<string, unknown>;
  const out: Deployments = {};
  for (const [k, v] of Object.entries(flat)) {
    if (typeof v === "string" && v.startsWith("0x") && v.length === 42) {
      out[k] = getAddress(v);
    }
  }
  return out;
}

export function loadConfig(): Config {
  const chainId = num("CHAIN_ID", 4663);
  const deploymentsDir = resolve(
    process.env.DEPLOYMENTS_DIR ?? "../../contracts/deployments",
  );
  const deployments = loadDeployments(deploymentsDir, chainId);

  // env override wins over the deployments file for every address.
  const pick = (envName: string, key: keyof Deployments): Address | undefined =>
    addr(envName) ?? deployments[key];

  const pk = opt("PRIVATE_KEY");
  const privateKey = pk ? ((pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`) : undefined;

  return {
    rpcUrl: req("RPC_URL"),
    chainId,
    privateKey,
    pollIntervalMs: num("POLL_INTERVAL_MS", 15_000),
    maxBackoffMs: num("MAX_BACKOFF_MS", 60_000),
    confirmations: num("CONFIRMATIONS", 1),
    leaderboardPath: resolve(
      process.env.LEADERBOARD_PATH ?? "../web/public/leaderboard.json",
    ),
    deploymentsDir,
    deployments,
    addresses: {
      houseBook: pick("HOUSE_BOOK_ADDRESS", "HouseBook"),
      factory: pick("FACTORY_ADDRESS", "DegenRollFactory"),
      rouletteFactory: pick("ROULETTE_FACTORY_ADDRESS", "RouletteWheelFactory"),
      conductor: pick("CONDUCTOR_ADDRESS", "EntropyConductor"),
      activation: pick("ACTIVATION_ADDRESS", "ActivationManager"),
      floorPosition: pick("FLOOR_POSITION_ADDRESS", "FloorPosition"),
      openingBell: pick("OPENING_BELL_ADDRESS", "OpeningBell"),
      launcherFactory: pick("LAUNCHER_FACTORY_ADDRESS", "LauncherFactory"),
    },
    crankThresholdWei: bigintWei("CRANK_THRESHOLD_WEI", 1_000_000_000_000_000_000n), // 1 ETH
    gasPriceFallbackWei: bigintWei("GAS_PRICE_FALLBACK_WEI", 100_000_000n), // 0.1 gwei
  };
}
