# PitBosses — Launch Config (Robinhood Chain, 4663)

Real, verified addresses from the Robinhood pack. Your dev fills the **two blanks**
(🔲) and runs the sequence below. Nothing here is guessed — placeholders are marked.

> ⚠️ Randomness is `BlockhashRandomnessServiceV3` (`PRODUCTION_SAFE = false`,
> bootstrap-grade). Swap to Pyth Entropy later with **zero code change** — just point
> `VRF_SERVICE` at the Pyth service.

---

## 1. Infrastructure addresses (confirmed)

| Purpose | Env / usage | Address |
|---|---|---|
| **WETH9** | `WETH` | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` |
| **USDG** (swap mid-hop) | `setRouteVia(..)` mid | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` |
| **ETH/USD feed** (UnstaleWrapper) | `ETH_USD_FEED` | `0x9F738359CF9A3630d08a79d80dE1aB803Cb2f7dD` |
| **VRF service** (BlockhashRandomnessServiceV3) | `VRF_SERVICE` | `0x19856b7E4Ab191fC265525E400b9E686f75AE327` |
| **Uniswap V3 SwapRouter02** | `UNIV3_ROUTER` | 🔲 *fill from Uniswap · Robinhood deployments* |
| **`$PITBOSS`** (Pons launch) | `PIT_TOKEN` | 🔲 *fill after launching on Pons* |

## 2. Reward stocks (proven liquidity — `WETH → USDG → stock`, both 0.3%)

| Symbol | Token address | Chainlink feed | Route |
|---|---|---|---|
| **NVDA** | `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC` | `0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15` | WETH→USDG→NVDA |
| **TSLA** | `0x322F0929c4625eD5bAd873c95208D54E1c003b2d` | `0x4A1166a659A55625345e9515b32adECea5547C38` | WETH→USDG→TSLA |
| **AAPL** | `0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9` | `0x6B22A786bAa607d76728168703a39Ea9C99f2cD0` | WETH→USDG→AAPL |

**Excluded:** `SPCX` (`0x4a0E…5eEa`) — **no liquidity, never traded.** Do NOT add it
as a reward until it has a real pool + route; the payout swap would revert.

---

## 3. Deploy sequence

### a) `.env`
```bash
# infra
WETH=0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73
ETH_USD_FEED=0x9F738359CF9A3630d08a79d80dE1aB803Cb2f7dD
CHAINLINK_MAX_AGE=3600            # seconds; tune to feed heartbeat
UNIV3_ROUTER=0x...                # 🔲 Uniswap V3 SwapRouter02
VRF_SERVICE=0x19856b7E4Ab191fC265525E400b9E686f75AE327
PIT_TOKEN=0x...                   # 🔲 $PITBOSS (Pons)
OWNER=0x...                       # multisig (adapter/oracle owner)
TREASURY=0x...                    # multisig
PROTOCOL_RESERVE=0x...            # multisig
ROYALTY_RECEIVER=0x...
USE_MOCKS=false
```

### b) Deploy the adapters, then the system
```bash
forge script script/DeployIntegrations.s.sol --rpc-url $RPC --broadcast   # → ORACLE, SWAP_ROUTER
# set ORACLE / SWAP_ROUTER from the output, then:
forge script script/Deploy.s.sol --rpc-url $RPC --broadcast
```

### c) Owner wiring (once) — per reward stock, do BOTH:
```
oracle.setTokenFeed(<stock>, <chainlink feed>)
router.setRouteVia(<stock>, 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168, 3000, 3000)   # USDG mid-hop
rollFactory.createMachine(<stock>, <creator>)     # Degen Roll table
rouletteFactory.createWheel(<stock>, <creator>)   # Roulette table
# then register each machine/wheel as cert issuer + floor bumper (see Deploy.s.sol)
```
Do this for **NVDA, TSLA, AAPL**.

### d) Global wiring
```
houseBook.setRouter(<UniV3RouterAdapter>)
loanVault.setConfig(houseBook, <ChainlinkOracleAdapter>, protocolReserve, minFee)
amm.setPrice(<PRICE in $PITBOSS>)                 # tune to $PITBOSS supply/decimals
activation.setActivationFee(<fee in $PITBOSS>)    # tune to $PITBOSS decimals
```

### e) Randomness pairing + fee float (required)
```
BlockhashRandomnessServiceV3.setSpinEngine(<VRFServiceConductor>)   # one-shot, service owner
send ETH → <VRFServiceConductor>                                    # pre-pays per-request VRF fees
```

### f) NFT art
```
Pin the 888 images + metadata to IPFS → base URI
PitBoss.setBaseURI(<ipfs base URI>)
```

### g) Seed capital
```
$PITBOSS → AMM (so Bosses are buyable) + your distribution plan
NVDA / TSLA / AAPL → each game's bankroll (stakeBankroll, needs an activated Boss)
ETH → deployer + keeper wallets (gas) + VRFServiceConductor (fees)
```

---

## 4. Keepers (Docker, funded hot wallet)
`fulfill` (settle both games), `restock` (both games), `crank-watch`, `season-agg`.
Also ensure the **VRF service's `deliver()` keeper** is running so `wordOf` becomes
available.

## 5. Before real money
- Testnet dry-run: full `commit → requestRandomWord → deliver → wordOf → settle` cycle.
- Confirm NVDA/TSLA/AAPL swaps execute through the USDG route with acceptable slippage.
- External audit (scope: the taxed `$PITBOSS` paths, both adapters, VRFServiceConductor).

## 6. The two blanks to fill
1. **`UNIV3_ROUTER`** — Uniswap V3 SwapRouter02 on Robinhood Chain.
2. **`PIT_TOKEN`** — `$PITBOSS`, after launching on Pons.
