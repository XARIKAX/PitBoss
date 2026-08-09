# PitBosses — Build Flags & Config Report

This is the end-of-build report required by the brief (§9): every `[CONFIG]` with
the value used, all mocked dependencies, deliberate design decisions/deviations,
and the top items an auditor should scope first. Audit happens **before** mainnet.

---

## 1. `[CONFIG]` values used

All config lives in code as named constants/immutables (money contracts) or in
`src/config/Chains.sol` + `apps/web/config/chains.ts` (chain-specific). Change a
value in one place; the deploy script and frontend read from these.

### Chain / infra
| Config | Value used | Where |
|---|---|---|
| Primary chain | Robinhood Chain — chainId **4663**, ETH gas | `Chains.sol` |
| Fallback chain | Base — chainId **8453** | `Chains.sol` |
| Entropy backend (Robinhood) | **Blockhash commit-reveal** (`MinerEntropyConductor`) — operator-trust; no VRF on-chain | `Chains.entropyKind` |
| Entropy backend (Base) | Chainlink VRF v2.5 (`VRFEntropyConductor`) | `Chains.entropyKind` |
| Entropy stall window | **30 min** (fail-closed threshold) | `EntropyConductorBase.STALL_WINDOW` |
| Blockhash target | `committedBlock + delay/blockTime + 2` (tracks `readyAt`) | `MinerEntropyConductor` |
| Assumed block time (Robinhood) | **250 ms** (fastest-plausible; keeps hash in 256-block window) | `Chains.blockTimeMs` |

### The Floor
| Config | Value used | Where |
|---|---|---|
| `$PIT` total supply | **42,000,000** × 1e18 (fixed, no mint) | `PIT.INITIAL_SUPPLY` |
| PitBoss max supply | **888** | `PitBoss.MAX_SUPPLY` |
| AMM flat price | **500,000 $PIT** per Boss | `FlatAMMVault.PRICE_PIT` |
| AMM buy fee (next) | **0.002 ETH** | `FlatAMMVault.buyFee` |
| AMM snipe fee (specific id) | **0.006 ETH** | `FlatAMMVault.snipeFee` |
| Activation fee | **500 $PIT** (50% burned / 50% parked at House Book) | `ActivationManager.activationFee` |
| Floor epoch | **1 day** | `FloorPosition.EPOCH` |
| Front-row cap | **3.33×** base weight | `FloorPosition.FRONT_ROW_CAP_BPS` (33,300) |
| Score → cap saturation | 10,000 | `FloorPosition.SCORE_FOR_CAP` |
| Decay per idle epoch | 100 | `FloorPosition.DECAY_PER_EPOCH` |
| Streak points / epoch | 25 | `ActivationManager.STREAK_POINTS_PER_EPOCH` |

### House Book
| Config | Value used | Where |
|---|---|---|
| Crank threshold | **1 ETH** | `HouseBook.crankThreshold` |
| Cranker tip | **0.5%** of pot | `HouseBook.crankTipBps` (50) |
| Delivery swap slippage cap | 3% | `HouseBook.maxSlippageBps` (300) |
| Fee sources | PitEdge, CertFees, LauncherFees, LockerFees, LoanInterest, **AmmFees** | `IHouseBook.Source` |

### The Pit
| Config | Value used | Where |
|---|---|---|
| Certificate flat fee | **$2** equiv, split 50/50 book/reserve | `CertificateCounter.feeUsd` (2e8) |
| Certificate royalty | 3.33%, hard cap 5% | `BearerCertificate` (333 bps) |
| Roll RTP | **90%** (EV = 0.90, verified) | `PrizeTable` |
| Prize floor / ceiling | **0.70× / 50×** | `PrizeTable` |
| Edge | 10% = 2.5% creator / 2.5% House Book / 5% protocol | `DegenRoll.*_BPS` |
| Instant lane ticket ceiling | **$100** | `DegenRoll.INSTANT_MAX_USD` |
| Instant entropy delay | 30 s | `DegenRoll.INSTANT_DELAY` |
| Vault commit delay | **10 min** (anti entropy-grind) | `DegenRoll.VAULT_DELAY` |
| Reserve per open pull | worst-case **50×** notional | `DegenRoll.buy` |
| Sell-back rate | **95%** of oracle mark (5% spread stays) | `DegenRoll.SELLBACK_BPS` |
| Unfulfilled-pull refund | **48 h** | `DegenRoll.REFUND_WINDOW` |
| Loss-streak length | **5** consecutive floor rolls | `DegenRoll.LOSS_STREAK_LEN` |
| Loss-streak rebate | **10%** of avg ticket | `DegenRoll.REBATE_BPS` |

### Locker / Loans / Launcher / Bell / Seasons
| Config | Value used | Where |
|---|---|---|
| Locker fee-share mode | **20%** of fee collects | `LiquidityLocker.FEE_SHARE_BPS` |
| Locker upfront mode | **0.005 ETH** upfront (proxy for "0.5%") | `LiquidityLocker.upfrontFee` |
| Permanent lock | `unlockTime = type(uint64).max` (never releasable) | `LiquidityLocker` |
| Loan APR | **15%** on ETH notional | `LoanVault.APR_BPS` |
| Loan min term | **3 days** | `LoanVault.MIN_TERM` |
| Loan late APR | 30% | `LoanVault.LATE_APR_BPS` |
| Loan fee split | **70% House Book / 30% reserve** | `LoanVault.BOOK_SHARE_BPS` |
| Loan fee floor | 0.006 ETH (never cheaper than AMM exit) | `LoanVault.minFee` |
| Launch fee | **0.00042 ETH** | `LauncherFactory.launchFee` |
| Curve fee | 1%, of which **30% → Opening Bell bar** | `LauncherFactory.*_BPS` |
| Tokens seeding pool at graduation | 20% of supply | `LauncherFactory.GRAD_TOKENS_TO_POOL_BPS` |
| Bell bar threshold | 0.25 ETH | `OpeningBell.barThreshold` |
| Bell ringer tip | **0.5%** | `OpeningBell.RINGER_TIP_BPS` |
| Bell per-token min weight | **1%** | `OpeningBell.MIN_WEIGHT_BPS` |
| Season length | **90 days** (quarterly) | `SeasonEngine.SEASON_LENGTH` |
| Season score carry | keep 50% (compress toward mean) | `SeasonEngine.keepBps` |
| Season bonus | 5% of season accrual | `SeasonEngine.SEASON_BONUS_BPS` |
| Geo-gate | Block **US + UK** on roll features; certificate counter open globally | `apps/web` GeoGate |

---

## 2. Mocked dependencies (testnet / local only)

Replace all of these with real addresses in `Chains` config / deploy env before
mainnet. On a real chain the deploy script wires the real entropy conductor and
expects real oracle/router/stock addresses via env (`USE_MOCKS=false`).

| Mock | Stands in for | Real replacement |
|---|---|---|
| `MockStockToken` | Tokenized stock (e.g. tokenized NVDA) | Real tokenized-stock address (live on Robinhood Chain) — config only |
| `MockOracle` | Price feed (ETH/token, USD/token, USD/ETH) | ✅ **`PythOracleAdapter`** (`src/integrations/`) — Pyth-backed, ready |
| `MockSwapRouter` | DEX router (ETH→token at oracle mark) | ✅ **`UniV3RouterAdapter`** (`src/integrations/`) — Uniswap-V3-backed, ready |
| `MockEntropyConductor` | Entropy source | ✅ **`MinerEntropyConductor`** (blockhash) — wired for Robinhood Chain |
| `MockPoolDeployer` | Uniswap V3 pool + LP creation on graduation | **Launcher only** — the Locker takes the real V3 position manager as a call parameter, so it needs no adapter |
| `VRFEntropyConductor` | Chainlink VRF v2.5 (chains with a coordinator, e.g. Base) | Wire `rawFulfillRandomWords` before Base mainnet; not used on Robinhood |

**Adapters (built, need real addresses at deploy):** `PythOracleAdapter` takes the
Pyth contract + ETH/USD feed id + per-token feed ids; `UniV3RouterAdapter` takes the
V3 SwapRouter02 + WETH + the oracle, with per-token fee tiers. Deploy via
`script/DeployIntegrations.s.sol`, then point `HouseBook.setRouter` /
`LoanVault.setConfig` / the machine wiring at them. Both assume 18-decimal stock
(FLAG deviation #4).

---

## 3. Deliberate design decisions / deviations (read before audit)

1. **House Book crank is O(1).** The brief's "pot swaps into each elected token in
   one pass" is realized as a per-Boss conversion at `deliver()` time, not a single
   giant crank-time swap. Rationale: crank must be gas-bounded across up to 888
   Bosses; per-Boss delivery also isolates slippage. The crank distributes ETH pro
   rata via an accumulator; `deliver()` converts each Boss's share into its elected
   token(s) with per-swap slippage caps and pushes to the TBA.
2. **Degen Roll economics.** Ticket `T` (ETH) is escrowed until resolution. At
   settle, 10% edge splits 2.5% creator / 2.5% House Book / 5% protocol; the 90% net
   feeds an ETH float the `restock` keeper converts to bankroll stock. Prize notional
   is the **full** ticket value in stock; table EV is 0.90, so the bankroll is flat
   in expectation and **earns the 5% sell-back spread + dust** — the steady edge goes
   to creator/book/protocol per §8. This resolves the tension with the landing copy
   ("earn the edge"): decide whether stakers should also capture part of the edge
   (product call). Reserve invariant `totalBankrollStock >= totalReserved` holds
   everywhere.
3. **Tickets are ETH-only** in v1. Stable-coin tickets are a clean extension point
   (accept token, same flow); not built.
4. **Oracle decimals.** Math assumes 18-decimal stock tokens and `ethPerToken` quoted
   as ETH-wei per 1e18 base units. Non-18-decimal routed stock needs a decimals-aware
   oracle adapter — flagged, not built.
5. **Activation "50% House Book"** is parked as `$PIT` at the House Book address (the
   book's ETH accounting is unaffected; activation is not an ETH fee source).
6. **`AmmFees` source added** to `IHouseBook.Source` so every ETH inflow is tagged
   (invariant #4). The landing shows 5 lines; the `/book` UI can group AMM under it.
7. **Locker "0.5% upfront"** is a configurable ETH `upfrontFee` (there is no
   per-position valuation oracle to take a true 0.5%-of-value cut). Fee-share mode is
   exact (20% of collects). Protocol fee share is forwarded to the House Book as the
   fee token.
8. **Launch buyback = buy-and-burn** into the curve (supply falls, backing rises).
9. **Loan default** sends the collateral Boss to the AMM as inventory; the loan
   vault's `$PIT` float falls by the principal, but the 500k-$PIT of value stays in
   the protocol (now as an AMM-held Boss). The loan vault holds an owner-funded `$PIT`
   float.
10. **Graduation pool creation** uses `MockPoolDeployer`; a real Uniswap V3 adapter
    implementing `IPoolDeployer` + `INonfungiblePositionManager` is required for
    mainnet.
11. **RouletteWheel** (`src/pit/RouletteWheel.sol`) is a second Pit game built on the
    exact bankroll / entropy / settlement machinery of `DegenRoll`, so it inherits
    the reserve invariant, fail-closed behavior, 48h refund, and dead-shares guard.
    European single-zero wheel (`Roulette.sol`, pure + verifiable, pocket = word%37);
    **one bet per spin in v1** so the reserve is a single bet's worst-case payout
    (multi-bet boards are a v2 extension). Payouts are total-return milli-x (straight
    36×, dozen/column 3×, even-money 2×); the single zero gives a uniform 2.70%
    structural edge to the bankroll, plus a 2% rake split 0.5/0.5/1 creator/book/
    protocol. House Book fee is tagged `PitEdge` (roulette is a Pit game) to avoid an
    enum change. **Audit-scoped the same as DegenRoll**; shares the same real-entropy
    requirement (no live randomness wired yet — see §entropy follow-up).

---

## 4. Top 5 for the auditor (scope first)

1. **`DegenRoll`** (`src/pit/DegenRoll.sol`) — the headline money contract:
   player-owned bankroll share accounting, the worst-case-50× reserve math, the
   `bankroll >= reserved` invariant across buy/settle/seal/refund/unstake/restock,
   fail-closed behavior, and the loss-streak rebate.
2. **`HouseBook`** (`src/book/HouseBook.sol`) — single fee sink: the crank
   accumulator, the `balance == bar + owed` runtime identity, exact 100%-of-pot
   distribution, and the FloorPosition→HouseBook weight-mirror (`syncWeight`) that
   keeps the accumulator exact across weight changes.
3. **`BearerCertificate` + `CertificateCounter`** (`src/pit/`) — vault backing ==
   supply (no empty notes), atomic burn-on-redeem, fee split, fee-on-transfer-safe
   crediting.
4. **`LiquidityLocker`** (`src/locker/LiquidityLocker.sol`) — no admin path to
   principal, permanent locks provably never releasable, hard-lock window
   enforcement, vest decrease/collect, fee-share routing.
5. **Entropy conductors + `LoanVault`** — commit-first verifiability
   (`wordOf == previewWord`), fail-closed and 48h refund path, and the loan
   liquidation/default accounting (`src/pit/entropy/`, `src/loans/LoanVault.sol`).

---

## 5. Repo structure for audit scoping

Money-holding contracts are cleanly separated by directory so scoping is by folder:

```
contracts/src/
  amm/FlatAMMVault.sol            [MONEY: $PIT reserve + transient ETH]
  book/HouseBook.sol              [MONEY: ETH fee sink + owed credits]
  pit/BearerCertificate.sol       [MONEY: stock vault]
  pit/CertificateCounter.sol      [MONEY: ETH fee + stock hop]
  pit/DegenRoll.sol               [MONEY: ETH float + stock bankroll + reserves]
  locker/LiquidityLocker.sol      [MONEY: escrowed LP positions]
  loans/LoanVault.sol             [MONEY: $PIT float + collateral Bosses]
  launcher/LauncherFactory.sol    [MONEY: raised ETH until graduation]
  launcher/OpeningBell.sol        [MONEY: buyback bar ETH]
  tba/PitBossAccount.sol          [MONEY: token-bound account holds rewards]
  --- non-custodial / logic ---
  nft/PitBoss.sol  floor/FloorPosition.sol  activation/ActivationManager.sol
  token/PIT.sol  season/SeasonEngine.sol  pit/PrizeTable.sol
  tba/InitializingRegistry.sol  config/Chains.sol  interfaces/  lib/  mocks/
```

**Admin surface (by design, everywhere):** fee-recipient rotation, conductor
migration (intended behind a 3-day timelock at the consumer — timelock wrapper is a
deploy-time wiring step, see below), and pause of NEW ticket sales only. No admin key
can touch locked liquidity, player-owed funds, reserved prizes, bankroll stakes, or
certificate vaults.

### Entropy on Robinhood Chain — blockhash (operator-trust), by decision
No two-party VRF (Chainlink / Pyth Entropy) is deployed on Robinhood Chain, so the
Degen Roll **and** Roulette use `MinerEntropyConductor`: the word is
`keccak(id, blockhash(targetBlock))`, where the target is a **future** block chosen
to land at/after the commitment's `readyAt` (`committedBlock + delay/blockTime + 2`).
This keeps the target's hash inside the 256-block (~64s) observable window even for
the 10-minute Vault lane — a naive `commit + k` target would age out and brick the
lane on a ~0.25s chain.

- **Trust model:** the sequencer produces the target block, so it is the trust root
  (operator-trust). Strictly weaker than a two-party VRF; accepted for launch and
  swappable behind `IEntropyConductor` (migrated in the consumers behind a timelock)
  for VRF/Pyth later with no change to the games.
- **Anti-abort:** a player cannot decline a losing pull — `settle` is permissionless
  (a keeper settles every round, win or lose) and refund is only available after 48h
  **and only if never fulfilled**. Worst case on keeper downtime is a stake refund,
  never a wrong payout (fail-closed).
- **Keeper liveness requirement (operational):** the settle keeper MUST call the
  consumer's `settle()` within the 256-block window after each target block
  (`targetBlockFor(consumer, id)` tells it when). Miss it and that pull becomes
  refund-only after 48h.

### Known follow-ups before mainnet
- Wrap owner roles (fee-recipient / conductor migration) in a **3-day timelock**
  (`TimelockController`) at deploy; owners are currently EOAs/deployer for testnet.
- Real Uniswap V3 adapter for `IPoolDeployer` + `INonfungiblePositionManager`.
- Optional upgrade: swap blockhash entropy for a two-party VRF (Chainlink VRF v2.5
  is wired in `VRFEntropyConductor` for chains that have a coordinator, e.g. Base) if
  one becomes available on Robinhood Chain.
- Decimals-aware oracle adapter for non-18-decimal stock tokens.
- `forge test` including invariant + fuzz suites is authored under `contracts/test/`;
  run with the Foundry binary (this build environment could not install Foundry due
  to egress policy, so contracts were compile-verified with solc 0.8.24 via
  `scripts/compile-check.js`).
```
