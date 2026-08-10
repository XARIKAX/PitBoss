# PitBosses — Contract Deployment Handover

Everything a developer needs to deploy the **entire PitBosses protocol** to
Robinhood Chain. This document is written against the repo as of this commit —
every path, env var, address and command is real. Where a value must still be
supplied by you (a launchpad token address, a router address), it is marked
🔲 and listed in one place (§10).

> **Read this first, in full, before broadcasting anything.** §8 (before real
> money) contains the on-chain facts that the repo alone cannot prove — the
> testnet dry-run is a hard gate, not a nicety.

---

## 0. TL;DR — the whole system in the right order

1. **Fund a fresh deployer wallet** with ETH on Robinhood Chain (chainId
   **4663**, RPC `https://rpc.mainnet.chain.robinhood.com`). Gas is cheap;
   ~0.1 ETH covers the full system.
2. **Launch `$PITBOSS` on Pons** (1–2% tax token). Note its address → that is
   `PIT_TOKEN`.
3. **Fill the two blanks** (§10): `UNIV3_ROUTER` and `PIT_TOKEN`.
4. **Deploy the adapters** (`DeployIntegrations.s.sol`) → prints `ORACLE` and
   `SWAP_ROUTER`.
5. **Deploy the system** (`Deploy.s.sol`) with those two addresses, `USE_MOCKS=false`.
6. **Owner wiring** (§6): per-stock feeds + routes, create the games, pair the
   VRF service, fund the conductor, seed capital.
7. **Dry-run on chain** (`VerifyIntegrations.s.sol`) — proves feeds + the live
   `WETH→USDG→stock` swap.
8. **Commit `deployments/deployments.4663.json`** → the Vercel site flips every
   page from "not deployed" to live automatically.

There are **two deploy scripts**: adapters first, then the system. That order
matters — the system consumes the adapters' addresses.

---

## 1. Repo layout

```
contracts/                         Foundry project (Solidity ^0.8.24, OZ v5)
  src/                             47 contracts (see §3)
  script/DeployIntegrations.s.sol  Chainlink oracle + UniV3 multi-hop router (run 1st)
  script/Deploy.s.sol              Full-system deploy + JSON writer         (run 2nd)
  script/VerifyIntegrations.s.sol  On-chain dry-run (oracle read + live swap)
  test/                            14 suites: invariants, EV=0.90, chi-square, adapters, VRF
  deployments/                     deployments.<chainId>.json (consumed by the web app)
apps/web/                          Next.js 14 static export (wagmi v2/viem), Vercel
apps/keeper/                       fulfill / restock / crank-watch / season-agg (TS/viem, Docker)
docs/                              LAUNCH_CONFIG.md (addresses), this file, module notes
```

- **Tests**: `forge test` — green in CI. Run them before any deploy.
- **No Foundry?** `node scripts/compile-check.js src,test,script` compiles the
  whole tree on solc directly. CI runs the full `forge test`.
- **CI proves the deploy**: every push runs `Deploy.s.sol` against anvil and
  uploads the resulting JSON. Green = the script wires end-to-end.

## 2. Prerequisites

- Foundry (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)
- Node 20+ (`npm install` inside `contracts/` pulls solc + OZ + erc6551)
- A funded deployer key on chain 4663
- Explorer for verification: `https://robinhoodchain.blockscout.com`

## 3. What gets deployed

### 3a. Adapters — `DeployIntegrations.s.sol` (run FIRST)

These replace the mocks with Robinhood's real external infrastructure:

| Contract | Role |
|----------|------|
| `ChainlinkOracleAdapter` | `IOracle` over **Chainlink Data Feeds** (`AggregatorV3Interface`, 8-dec USD). ETH/USD via the UnstaleWrapper; per-stock feeds added after deploy. Staleness-guarded (`CHAINLINK_MAX_AGE`). |
| `UniV3RouterAdapter` | ETH→stock swaps over **Uniswap V3**, multi-hop `WETH→USDG→stock` (no direct ETH/stock pools exist). Route set per stock after deploy. |

Prints `ORACLE` and `SWAP_ROUTER` — feed both into the system deploy.

### 3b. System — `Deploy.s.sol` (run SECOND, in one broadcast, auto-wired)

| # | Contract | Role | Wiring done by the script |
|---|----------|------|---------------------------|
| 1 | Externals | oracle / router / entropy | mocks if `USE_MOCKS`, else your `ORACLE`/`SWAP_ROUTER` + the chain's entropy conductor (§4) |
| 2 | `PIT` **or** `$PITBOSS` | protocol token | uses `PIT_TOKEN` (your Pons token) if set, else deploys reference `PIT.sol` for tests |
| 3 | `PitBossAccount` + `InitializingRegistry` | ERC-6551 impl + atomic clone/init registry | registry bound to impl |
| 4 | `PitBoss` | 888-supply ERC-721, TBA per token | minter = AMM |
| 5 | `FloorPosition` | weight/streak engine | `setRewardSink(HouseBook)` |
| 6 | `HouseBook` | single fee sink + crank | constructor(boss, floor, router) |
| 7 | `FlatAMMVault` | primary market — **mint is FREE** (ETH fee only, default price 0) | `PitBoss.setMinter(amm)`; optional paid mode via `setPrice` |
| 8 | `ActivationManager` | Boss activation (50% burn / 50% book) | `floor.setBumper(activation)`; fee **settable** (`setActivationFee`) |
| 9 | `BearerCertificate` + `CertificateCounter` | stock→deed NFTs, $2 flat fee | `cert.setIssuer(counter)` |
| 10 | `DegenRollFactory` | creates **Degen Roll** machines | full Wiring struct |
| 11 | `RouletteWheelFactory` | creates **Roulette** wheels | full Wiring struct |
| 12 | `LiquidityLocker` | locks/vests, no admin key | fee share → book |
| 13 | `LoanVault` | NFT-collateral loans, 15% APR | `amm.setLiquidator(loans)` |
| 14 | `OpeningBell` + `LauncherFactory` | launchpad + provably-fair bell | `bell.setLauncher(launcher)` |
| 15 | `SeasonEngine` | quarterly seasons | `floor.setBumper(season)` |

With `USE_MOCKS=true` the script also creates one sample Degen Roll machine
**and** one sample Roulette wheel (tNVDA) and grants each `cert.setIssuer` +
`floor.setBumper`. With mocks off you create the real games yourself (§6).

Output: `deployments/deployments.<chainId>.json` — PascalCase keys the web app
maps directly. **Don't rename keys.** `RouletteWheelFactory` is included.

## 4. Entropy (randomness) — how it's chosen

Picked per chain in `src/config/Chains.sol`:

| Chain | Entropy conductor | Deployed by |
|-------|-------------------|-------------|
| **Robinhood 4663** | `VRFServiceConductor` → your `IVRFService` (`BlockhashRandomnessServiceV3`) | the script, from `VRF_SERVICE` |
| Base / other | `VRFEntropyConductor` → Chainlink VRF | from `VRF_COORDINATOR` |
| Anvil 31337 | `MinerEntropyConductor` (blockhash, local only) | the script |

On Robinhood the conductor **adapts the managed VRF service**. `block.number`
there is L1-synced (~12s), and `ArbSys.arbBlockHash()` reverts — the service
handles delivery, so the game never touches raw blockhashes.

Two one-time actions make it live (§6e):
1. The **VRF service owner** calls `setSpinEngine(<VRFServiceConductor>)` so the
   conductor is the authorized consumer.
2. **Fund the conductor with ETH** — it pre-pays `vrfFeeNative()` per request.

> Swapping to **Pyth Entropy** later is a zero-code change: point `VRF_SERVICE`
> at the Pyth service and redeploy the conductor. A `PythEntropyService` adapter
> is already in the tree.

## 5. Environment variables

Optional on anvil (sender defaults + mocks). For Robinhood production:

| Var | Required when | Meaning |
|-----|---------------|---------|
| `DEPLOY_PRIVATE_KEY` | always (real chain) | funded deployer key |
| `USE_MOCKS` | set **`false`** for production | `true` deploys mock oracle/router/stock/entropy |
| **Adapters (`DeployIntegrations`)** | | |
| `ETH_USD_FEED` | production | Chainlink ETH/USD (UnstaleWrapper) `0x9F738359CF9A3630d08a79d80dE1aB803Cb2f7dD` |
| `CHAINLINK_MAX_AGE` | production | max feed staleness, seconds (e.g. `3600`) |
| `UNIV3_ROUTER` | production 🔲 | Uniswap V3 SwapRouter02 on Robinhood |
| `WETH` | production | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` |
| `OWNER` | production | adapter owner (intended: multisig / timelock) |
| **System (`Deploy`)** | | |
| `ORACLE` | production | `ChainlinkOracleAdapter` from step 3a |
| `SWAP_ROUTER` | production | `UniV3RouterAdapter` from step 3a |
| `STOCK_SAMPLE` | production | one real stock addr to bootstrap (e.g. NVDA) |
| `VRF_SERVICE` | Robinhood | `0x19856b7E4Ab191fC265525E400b9E686f75AE327` |
| `PIT_TOKEN` | production 🔲 | `$PITBOSS` (Pons). Omit → deploys reference `PIT.sol` |
| `TREASURY` | recommended | receives PIT mint (only if no `PIT_TOKEN`). Defaults to deployer |
| `PROTOCOL_RESERVE` | recommended | protocol fee share receiver. Defaults to deployer |
| `ROYALTY_RECEIVER` | recommended | NFT royalty receiver. Defaults to deployer |
| `VRF_COORDINATOR` | non-Robinhood only | Chainlink VRF v2.5 |

## 6. Deploy sequence (production)

### a) `.env`
```bash
# ---- infra (confirmed Robinhood addresses) ----
WETH=0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73
ETH_USD_FEED=0x9F738359CF9A3630d08a79d80dE1aB803Cb2f7dD
CHAINLINK_MAX_AGE=3600
VRF_SERVICE=0x19856b7E4Ab191fC265525E400b9E686f75AE327
UNIV3_ROUTER=0x...        # 🔲 Uniswap V3 SwapRouter02 on Robinhood
PIT_TOKEN=0x...           # 🔲 $PITBOSS (after Pons launch)
# ---- ownership (use a multisig for each) ----
OWNER=0x...
TREASURY=0x...
PROTOCOL_RESERVE=0x...
ROYALTY_RECEIVER=0x...
USE_MOCKS=false
```

### b) Deploy adapters, then the system
```bash
cd contracts && npm install
export RPC=https://rpc.mainnet.chain.robinhood.com

forge script script/DeployIntegrations.s.sol --rpc-url $RPC --broadcast \
  --private-key $DEPLOY_PRIVATE_KEY
# copy the printed ChainlinkOracleAdapter / UniV3RouterAdapter into:
export ORACLE=0x...        # ChainlinkOracleAdapter
export SWAP_ROUTER=0x...   # UniV3RouterAdapter
export STOCK_SAMPLE=0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC   # NVDA

forge script script/Deploy.s.sol --rpc-url $RPC --broadcast \
  --private-key $DEPLOY_PRIVATE_KEY
```

### c) Per reward stock — do BOTH (owner calls)
For **NVDA, TSLA, AAPL** (§10 has feeds):
```
oracle.setTokenFeed(<stock>, <chainlink feed>)
router.setRouteVia(<stock>, 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168, 3000, 3000)  # USDG mid-hop
rollFactory.createMachine(<stock>, <creator>)     # Degen Roll table
rouletteFactory.createWheel(<stock>, <creator>)   # Roulette wheel
```
Then register **each** new machine/wheel:
```
cert.setIssuer(<game>, true)
floor.setBumper(<game>, true)
```
> **SPCX is intentionally excluded** — no liquidity, never traded. Adding it as
> a reward would make the payout swap revert. Only add stocks with a proven route.

### d) Global config (owner calls)
```
# Activation defaults to 888,888 $PITBOSS (444,444 burned / 444,444 book).
# activation.setActivationFee(<fee>) only if changing that — confirm token decimals = 18.
counter.setRouted(<stock>, true)                # per stock sealable into a certificate
# MINT IS FREE by default (PRICE_PIT = 0): no setPrice call needed.
# amm.setPrice(<amount>) is OPTIONAL — setting it non-zero charges $PITBOSS
# per Boss AND opens the loan desk (loans lend that flat amount; they stay
# closed at price 0 so free-minted collateral can't drain the loan float).
```

### e) Randomness pairing + fee float (REQUIRED — games won't spin without it)
```
BlockhashRandomnessServiceV3.setSpinEngine(<VRFServiceConductor>)   # service owner, one-shot
send ETH → <VRFServiceConductor>                                    # pre-pays per-request VRF fees
```

### f) NFT art
```
Pin art/pitbosses/images + metadata to IPFS, swap REPLACE_CID, re-pin
PitBoss.setBaseURI("ipfs://<metadataCID>/")
```

### g) Seed capital
```
$PITBOSS  → FlatAMMVault (so Bosses are buyable) + your distribution plan
NVDA/TSLA/AAPL → each game's bankroll via stakeBankroll (needs an activated Boss)
ETH       → deployer + keeper wallets (gas) + VRFServiceConductor (VRF fees)
```

## 7. Dry-run before you trust it — `VerifyIntegrations.s.sol`

Proves the two things the repo cannot: that Chainlink feeds return data and the
`WETH→USDG→stock` route has real liquidity. It reads the oracle, logs the VRF
fee, and executes a **tiny live swap**.
```bash
ORACLE=$ORACLE SWAP_ROUTER=$SWAP_ROUTER \
STOCK=0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC \
VRF_SERVICE=$VRF_SERVICE PROBE_ETH=1000000000000000 \
forge script script/VerifyIntegrations.s.sol --rpc-url $RPC --broadcast \
  --private-key $DEPLOY_PRIVATE_KEY
```
A green run ("VERIFY OK") is your on-chain go/no-go. Run it per stock.

## 8. BEFORE real money — decisions & known gaps

These are the honest, calibrated caveats. The code is complete, compiles, and
is unit-tested against mocks — but the following can only be proven on chain:

**(a) Testnet dry-run is a hard gate.** Run the full cycle on a Robinhood
testnet (or a mainnet fork): `commit → requestRandomWord → deliver → wordOf →
settle`, plus §7's swap probe, before mainnet. Confirm the VRF service actually
delivers and `wordOf` becomes readable.

**(b) `$PITBOSS` is a taxed token (1–2%).** All accounting is fee-on-transfer
safe (balance-diff, dead-address burn), but confirm on chain: the **decimals and
supply** of your Pons token, and that `setActivationFee` is tuned to them (mint
is free, so activation is the main token sink). A wrong decimals assumption
mis-prices activation. The loan desk stays closed until a non-zero `setPrice`
is deliberately configured.

**(c) USDG route slippage.** The payout swap is multi-hop through USDG. Verify
acceptable slippage per stock at realistic sizes — thin USDG↔stock liquidity
would make wins expensive to settle.

**(d) Stock token decimals.** Adapters assume 18-decimal stock tokens. Confirm
each reward stock's decimals; a non-18 token needs a normalization pass.

**(e) `MockPoolDeployer` is still used in real mode** (launcher graduation
pools). Fine for everything except live launchpad graduations — implement
`IPoolDeployer` against the chain's V3 DEX before enabling real launches. You
asked for everything working **apart from the launcher**; this is that seam.

**(f) Ownership → multisig.** Every `Ownable` is owned by the deployer at
first. Before real money, move `OWNER`/adapter/factory/token-setter ownership to
a multisig (or timelock) and decide which setters to renounce (fees, baseURI,
game creation) vs keep.

**(g) No external audit yet.** The suite is strong (reserve-solvency invariant,
EV=0.90, chi-square distribution, adapters, VRF conductor) but this is unaudited
money code. Audit scope: the taxed `$PITBOSS` paths, both adapters, and
`VRFServiceConductor`. Treat first mainnet as soft-launch.

**(h) Legal.** Gambling product paying out in tokenized equities. The app
geo-gates (attestation modal) and `docs/legal.md` exists — have counsel review
for your jurisdictions.

## 9. Keepers & ops (once live)

Run from `apps/keeper/` (Docker compose, funded hot wallet, RPC + key):

| Bot | Job |
|-----|-----|
| `fulfill` | settles both games (Degen Roll + Roulette) once entropy is ready |
| `restock` | converts each game's ETH float back into stock inventory (both games) |
| `crank-watch` | cranks the House Book when the bar fills (cranker takes 0.5%) |
| `season-agg` | season leaderboard aggregation |

Also ensure the **VRF service's own `deliver()` keeper** runs so `wordOf`
becomes available. Everything keepers do is permissionless — convenience, not
authority.

- **Entropy health**: `conductor.healthy()` (≥ one VRF fee of ETH). Degraded →
  rolls pause at commit; settles/refunds always work; unfulfilled pulls refund
  after 48h.
- **Machine solvency**: `totalBankrollStock >= totalReserved` enforced on-chain
  (reserve = notional × worst-case multiplier per open round).
- **Redeploys**: the script is a fresh system each run — never point the
  frontend at a mix of two deployments; take the whole JSON from one run.

## 10. Blanks to fill + address reference

**Fill these two:**
1. `UNIV3_ROUTER` — Uniswap V3 SwapRouter02 on Robinhood Chain.
2. `PIT_TOKEN` — `$PITBOSS`, after launching on Pons.

**Confirmed addresses (from the Robinhood pack — see `docs/LAUNCH_CONFIG.md`):**

| Purpose | Address |
|---|---|
| WETH9 | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` |
| USDG (swap mid-hop) | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` |
| ETH/USD feed (UnstaleWrapper) | `0x9F738359CF9A3630d08a79d80dE1aB803Cb2f7dD` |
| VRF service (BlockhashRandomnessServiceV3) | `0x19856b7E4Ab191fC265525E400b9E686f75AE327` |
| NVDA token / feed | `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC` / `0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15` |
| TSLA token / feed | `0x322F0929c4625eD5bAd873c95208D54E1c003b2d` / `0x4A1166a659A55625345e9515b32adECea5547C38` |
| AAPL token / feed | `0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9` / `0x6B22A786bAa607d76728168703a39Ea9C99f2cD0` |

## 11. Fee & parameter quick reference

| Thing | Value |
|---|---|
| Chain | Robinhood Chain, chainId 4663, ETH gas |
| RPC / Explorer | `https://rpc.mainnet.chain.robinhood.com` / `https://robinhoodchain.blockscout.com` |
| Entropy (4663) | `VRFServiceConductor` → `IVRFService` (Blockhash now, Pyth later — no code change) |
| **Degen Roll** edge | 10% total: 2.5% creator / 2.5% House Book / 5% protocol (RTP 90%) |
| **Roulette** rake | 2% total: 0.5% creator / 0.5% House Book / 1% protocol (single-zero, 2.70% edge) |
| Sell-back | 95% of the oracle mark (both games) |
| Refund window | unfulfilled pull refunds after 48h |
| Activation | **888,888 $PITBOSS** default (settable): 444,444 burned / 444,444 House Book |
| Certificate fee | $2 in ETH (`feeUsd`, settable): 50% book / 50% reserve |
| Loans | 15% APR (30% late), NFT collateral; desk closed while mint is free |
| Launcher | 1% curve fee, 30% of it → Opening Bell; 20% supply seeds the pool |
| Crank tip | 0.5% of the pot |
| Boss mint | **FREE** (`PRICE_PIT = 0` default) + 0.002 ETH fee → House Book; snipe 0.006 ETH |

`docs/LAUNCH_CONFIG.md` is the address appendix; `contracts/test/` shows every
flow working end-to-end; `docs/modules/` has per-module notes.
