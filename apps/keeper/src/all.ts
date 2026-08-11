/**
 * all — supervisor that runs every keeper bot in a single container.
 *
 * The bots are independent processes with no shared state (everything they need
 * lives on-chain), so a host that can only run one container still gets full
 * upkeep. Set KEEPER_BOTS to run a subset — e.g. one Railway service per bot:
 *
 *   KEEPER_BOTS=fulfill              # settle keeper only
 *   KEEPER_BOTS=fulfill,crank-watch  # two of them
 *   (unset)                          # all four
 *
 * Crash policy: if any child exits, the supervisor tears down its siblings and
 * exits non-zero so the platform restarts the whole container. Each bot already
 * backs off internally on RPC errors, so an exit means something the process
 * could not recover from — restarting everything is the honest response, and
 * keeps a half-dead container from looking healthy.
 */

import {spawn, type ChildProcess} from "node:child_process";
import {createLogger} from "./lib/log.js";

const BOT = "all";
const ALL_BOTS = ["fulfill", "crank-watch", "restock", "season-agg"] as const;

const ENTRY: Record<string, string> = {
  fulfill: "src/fulfill.ts",
  "crank-watch": "src/crank-watch.ts",
  restock: "src/restock.ts",
  "season-agg": "src/season-agg.ts",
};

function selected(): string[] {
  const raw = process.env.KEEPER_BOTS?.trim();
  if (!raw) return [...ALL_BOTS];
  const names = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const unknown = names.filter((n) => !(n in ENTRY));
  if (unknown.length > 0) {
    throw new Error(
      `KEEPER_BOTS names unknown bot(s): ${unknown.join(", ")}. ` +
        `Valid: ${ALL_BOTS.join(", ")}`,
    );
  }
  if (names.length === 0) throw new Error("KEEPER_BOTS is set but selects no bots");
  return names;
}

function main() {
  const log = createLogger(BOT);
  const bots = selected();
  const children = new Map<string, ChildProcess>();
  let shuttingDown = false;

  const shutdown = (reason: string, code: number) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`shutting down: ${reason}`, {bots: [...children.keys()]});
    for (const child of children.values()) child.kill("SIGTERM");
    // Give the bots a moment to finish their in-flight tick, then force exit so
    // a wedged child can never hold the container open.
    setTimeout(() => {
      for (const child of children.values()) child.kill("SIGKILL");
      process.exit(code);
    }, 10_000).unref();
  };

  log.info("supervisor up", {bots});

  for (const name of bots) {
    const child = spawn("npx", ["tsx", ENTRY[name]], {
      stdio: "inherit", // bots already log structured lines tagged with their name
      env: process.env,
    });
    children.set(name, child);

    child.on("error", (err) => {
      log.error("failed to spawn", {bot: name, error: err.message});
      shutdown(`${name} failed to spawn`, 1);
    });

    child.on("exit", (code, signal) => {
      children.delete(name);
      if (shuttingDown) return;
      log.error("bot exited, restarting container", {bot: name, code, signal});
      shutdown(`${name} exited`, code ?? 1);
    });
  }

  process.on("SIGINT", () => shutdown("SIGINT", 0));
  process.on("SIGTERM", () => shutdown("SIGTERM", 0));
}

main();
