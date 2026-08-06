# PitBosses Keeper Bots

Permissionless upkeep for the floor. Four small, stateless bots keep Degen Roll
machines settling, the House Book distributing, bankrolls stocked, and the season
leaderboard fresh. Every one of these actions is open to anyone — the bots are a
convenience, not a privileged role. Run all four, run one, or run none; the
protocol keeps working either way.

TypeScript + [viem](https://viem.sh). No local state: each bot re-derives
everything it needs from chain on every tick, so it is safe to restart, run
multiple copies, or lose one for a while.

## The bots

| Bot | What it does | Needs a signer? |
| --- | --- | --- |
| `fulfill` | Watches the entropy conductor's `Committed` ids (from Degen Roll machines and the Opening Bell). When `conductor.isReady(id)` is true, calls `conductor.fulfill(id)` so players can settle. | yes |
| `crank-watch` | Reads `HouseBook.barBalance()`. When it is at/above the crank threshold **and** the 0.5% cranker tip beats estimated gas, calls `HouseBook.crank()` and takes the tip. Logs the profitability decision every tick. | yes |
| `restock` | For each Degen Roll machine, when `ethFloat > 0` and free inventory is short against open reserves, calls `machine.restock()` to convert the ETH float into bankroll stock at the oracle mark. | yes |
| `season-agg` | Polls activations, rolls, bankroll stakes and launcher participation; aggregates a per-address leaderboard for the current quarterly season and writes `leaderboard.json` to the web app's public dir. Read-only on chain. | no |

### fulfill

Consumers commit to a future entropy word; once the source material lands the
word can be finalized by anyone. `fulfill` scans a bounded block window
(`FULFILL_LOOKBACK_BLOCKS`) for `Committed` events, drops the ones already
fulfilled, checks `isReady`, and sends `fulfill(id)`. It simulates first, so
losing a race to another keeper is a cheap skip rather than a failed tx.

### crank-watch

The House Book is the single fee sink. Cranking is profitable only when the tip
(`bar × crankTipBps / 10000`) exceeds `gasPrice × CRANK_GAS_ESTIMATE`. The bot
uses the larger of the on-chain `crankThreshold()` and the local
`CRANK_THRESHOLD_WEI` floor, then logs a full decision object
(`bar`, `tip`, `gasCost`, `netProfit`, `profitable`) whether or not it acts.

### restock

Each settle skims a 10% edge and feeds the 90% net into a machine's `ethFloat`.
`restock()` converts that float into bankroll stock. The bot restocks a machine
when it has more than `RESTOCK_MIN_FLOAT_WEI` of float **and** free inventory
(`freeStock`) has fallen below `RESTOCK_MIN_FREE_BPS` of open reserves (each open
pull reserves worst-case 50×). Machines are discovered from the factory, or
pinned via `MACHINES`.

### season-agg

Rebuilds the leaderboard from chain each tick — no accumulation to drift. Events
count toward the current season only if their block timestamp falls in the
current **UTC quarter** (`YYYY-Qn`); the season start block is estimated by
sampling seconds-per-block, or pinned with `SEASON_START_BLOCK`. Output is written
atomically (temp + rename) to `LEADERBOARD_PATH`
(default `../web/public/leaderboard.json`) so the site never reads a half file.

Scoring (all tunable via env):

```
score = activations            × PTS_ACTIVATION            (100)
      + rolls                  × PTS_PER_ROLL              (5)
      + rollVolumeEth          × PTS_PER_ETH_ROLLED        (1000)
      + bankrollStakes         × PTS_PER_STAKE             (2)
      + launcherParticipations × PTS_LAUNCHER              (50)
```

## Configuration

All four bots read one `.env` file. Copy the template and fill it in:

```bash
cp .env.example .env
```

| Var | Purpose |
| --- | --- |
| `RPC_URL` | JSON-RPC endpoint for the target chain. |
| `CHAIN_ID` | `4663` Robinhood Chain (primary) or `8453` Base (fallback). |
| `PRIVATE_KEY` | Signer for the write bots. `season-agg` doesn't need it. |
| `POLL_INTERVAL_MS` | Loop interval (default `15000`). |
| `MAX_BACKOFF_MS` | Ceiling for exponential backoff on RPC errors. |
| `CONFIRMATIONS` | Confirmations to wait on writes (default `1`). |
| `LOG_LEVEL` | `debug` \| `info` \| `warn` \| `error`. |
| `DEPLOYMENTS_DIR` | Dir holding `deployments.<chainId>.json` (auto-loaded). |
| `HOUSE_BOOK_ADDRESS`, `FACTORY_ADDRESS`, `CONDUCTOR_ADDRESS`, `ACTIVATION_ADDRESS`, `FLOOR_POSITION_ADDRESS`, `OPENING_BELL_ADDRESS`, `LAUNCHER_FACTORY_ADDRESS` | Override the auto-loaded addresses. |
| `MACHINES` | Optional comma-separated DegenRoll set (skips factory discovery). |
| `CRANK_THRESHOLD_WEI`, `CRANK_GAS_ESTIMATE`, `GAS_PRICE_FALLBACK_WEI` | crank-watch tuning. |
| `RESTOCK_MIN_FREE_BPS`, `RESTOCK_MIN_FLOAT_WEI` | restock tuning. |
| `FULFILL_LOOKBACK_BLOCKS` | fulfill scan window. |
| `LEADERBOARD_PATH`, `SEASON_START_BLOCK`, `PTS_*` | season-agg output + scoring. |

### Addresses

Contract addresses are loaded from
`contracts/deployments/deployments.<CHAIN_ID>.json` when the file exists. The
loader accepts a flat `{ "HouseBook": "0x…" }` map or one nested under a
`contracts`/`addresses` key, checksums every value, and lets any matching env var
override it. Nothing needs editing after a fresh deploy — just point
`DEPLOYMENTS_DIR` at the file.

## Running

### Local (tsx, no build step)

```bash
pnpm install
pnpm fulfill        # or: crank-watch | restock | season-agg
pnpm dev:restock    # same, with file-watch reload
```

### Docker

One image runs any bot; the compose file wires all four with the shared `.env`
and mounts the deployments file and the web public dir:

```bash
docker compose up            # all four, foreground
docker compose up -d         # detached
docker compose up fulfill    # a single bot
docker compose logs -f       # tail structured logs
docker compose down          # stop (bots exit cleanly on SIGTERM)
```

## Operational notes

- **Stateless & resumable.** No database, no checkpoints. Restart freely; a
  missed tick just means the next one does the work.
- **Idempotent.** Every write simulates first and tolerates losing a race to
  another keeper — repeated or concurrent runs never double-act.
- **Backoff.** RPC failures inside a tick are caught and retried with jittered
  exponential backoff up to `MAX_BACKOFF_MS`; a bad node slows the loop, never
  crashes it.
- **Graceful shutdown.** `SIGINT`/`SIGTERM` stop the loop after the in-flight
  tick and exit 0.
- **Structured logs.** `<ISO timestamp> <LEVEL> [<bot>] message {json}` on
  stdout (info/debug) and stderr (warn/error).

## ABIs

`src/lib/abis.ts` holds hand-written ABI **placeholders** covering only the
functions and events the bots use. They match `contracts/src` as written; replace
them with generated ABIs (e.g. `forge inspect <Contract> abi`) once artifacts are
built.
