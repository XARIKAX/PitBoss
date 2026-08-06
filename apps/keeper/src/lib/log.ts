/**
 * Structured logging: `<ISO timestamp> <LEVEL> [<bot>] message {json?}`.
 * One line per event, stdout for info/debug, stderr for warn/error — so
 * `docker compose logs` and log shippers can split streams cleanly.
 */

export type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = {debug: 10, info: 20, warn: 30, error: 40};

const MIN_LEVEL: Level = (process.env.LOG_LEVEL as Level) ?? "info";

function enabled(level: Level): boolean {
  return ORDER[level] >= ORDER[MIN_LEVEL];
}

function fmt(level: Level, bot: string, msg: string, extra?: unknown): string {
  const ts = new Date().toISOString();
  let line = `${ts} ${level.toUpperCase().padEnd(5)} [${bot}] ${msg}`;
  if (extra !== undefined) {
    line += " " + safeJson(extra);
  }
  return line;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  } catch {
    return String(value);
  }
}

/** A logger bound to a single bot name. */
export interface Logger {
  debug(msg: string, extra?: unknown): void;
  info(msg: string, extra?: unknown): void;
  warn(msg: string, extra?: unknown): void;
  error(msg: string, extra?: unknown): void;
}

export function createLogger(bot: string): Logger {
  return {
    debug(msg, extra) {
      if (enabled("debug")) process.stdout.write(fmt("debug", bot, msg, extra) + "\n");
    },
    info(msg, extra) {
      if (enabled("info")) process.stdout.write(fmt("info", bot, msg, extra) + "\n");
    },
    warn(msg, extra) {
      if (enabled("warn")) process.stderr.write(fmt("warn", bot, msg, extra) + "\n");
    },
    error(msg, extra) {
      if (enabled("error")) process.stderr.write(fmt("error", bot, msg, extra) + "\n");
    },
  };
}
