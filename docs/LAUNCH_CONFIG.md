# PitBosses — Launch Config (Robinhood Chain, 4663)

Real, verified addresses from the Robinhood pack. Your dev fills the **🔲 blanks**
and runs the sequence below. Nothing here is guessed — placeholders are marked.

> **PIT token is deferred.** The platform deploys with `pit = address(0)` in
> FlatAMMVault, ActivationManager, and LoanVault. After `$PITBOSS` graduates on
> Pons, call `setPIT(<pons_address>)` on each of those three contracts to wire it.
> No redeployment needed.

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
| **Uniswap V3 SwapRouter02** | `UNIV3_ROUTER` | `0xcaf681a66d02060134229793863e78c959e5cb2` |
| **Uniswap V3 NonfungiblePositionManager** | `V3_POSITION_MGR` | `0x73991a25c818bf1f1128deaab1492d45638de0d3` |
| **Uniswap V3 Factory** | `V3_FACTORY` | `0x1f7d7550b1b028f7571e69a784071f0205fd2efa` |
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
UNIV3_ROUTER=0xcaf681a66d02060134229793863e78c959e5cb2
V3_POSITION_MGR=0x73991a25c818bf1f1128deaab1492d45638de0d3
V3_FACTORY=0x1f7d7550b1b028f7571e69a784071f0205fd2efa
VRF_SERVICE=0x19856b7E4Ab191fC265525E400b9E686f75AE327
PIT_TOKEN=0x...                   # 🔲 $PITBOSS (Pons)
OWNER=0x2fA1E9372c128e2A756f5BdD096d398eAEa0B659
TREASURY=0x2fA1E9372c128e2A756f5BdD096d398eAEa0B659
PROTOCOL_RESERVE=0x5Ce7FFce7c0cFb5210ADC4D23080f02B4379C61E
ROYALTY_RECEIVER=0x5Ce7FFce7c0cFb5210ADC4D23080f02B4379C61E
USE_MOCKS=false
```

### b) Deploy the adapters, then the system

> Run from the `contracts/` directory with `--private-key $PRIVATE_KEY` or a
> hardware wallet flag (`--ledger`, `--trezor`).

```bash
cd contracts

# Step 1 — adapters (Chainlink oracle, Uni V3 router, V3 pool deployer)
forge script script/DeployIntegrations.s.sol \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast \
  --verifier blockscout \
  --verifier-url https://robinhoodchain.blockscout.com/api/

# The script prints three addresses.  Add them to .env:
#   ORACLE=<ChainlinkOracleAdapter>
#   SWAP_ROUTER=<UniV3RouterAdapter>
#   POOL_DEPLOYER=<V3PoolDeployerAdapter>

# Step 2 — full platform (PIT omitted; deploys with pit=address(0))
forge script script/Deploy.s.sol \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast \
  --verifier blockscout \
  --verifier-url https://robinhoodchain.blockscout.com/api/
# Writes deployments/deployments.4663.json consumed by the web app.
```

### c) Per-stock wiring (NVDA, TSLA, AAPL — do all three)

```bash
# For each stock address <STOCK> and its Chainlink feed <FEED>:
cast send $ORACLE "setTokenFeed(address,address)" <STOCK> <FEED> \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY

# Route: WETH → USDG → stock, both 0.3 %
USDG=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168
cast send $SWAP_ROUTER "setRouteVia(address,address,uint24,uint24)" \
  <STOCK> $USDG 3000 3000 \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY

# Create game tables (replace <CREATOR> with your creator wallet)
cast send $ROLL_FACTORY "createMachine(address,address)" <STOCK> <CREATOR> \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY
#   → note the returned machine address

cast send $ROULETTE_FACTORY "createWheel(address,address)" <STOCK> <CREATOR> \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY
#   → note the returned wheel address

# Register each machine + wheel as a certificate issuer and floor bumper
cast send $CERTIFICATE "setIssuer(address,bool)" <MACHINE> true \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY
cast send $FLOOR "setBumper(address,bool)" <MACHINE> true \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY
cast send $CERTIFICATE "setIssuer(address,bool)" <WHEEL> true \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY
cast send $FLOOR "setBumper(address,bool)" <WHEEL> true \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY
```

### d) Global wiring

```bash
# Point HouseBook at the production swap router
cast send $HOUSE_BOOK "setRouter(address)" $SWAP_ROUTER \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY

# Point LoanVault at the production oracle + final fee floor (0.006 ETH default)
cast send $LOAN_VAULT "setConfig(address,address,address,uint256)" \
  $HOUSE_BOOK $ORACLE $PROTOCOL_RESERVE 6000000000000000 \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY

# ── Tune after Pons graduation (once $PITBOSS supply/decimals are known) ──
# amm.setPrice(<PRICE_PIT in wei>)            — e.g. 500000000000000000000000 = 500k tokens
# activation.setActivationFee(<fee in wei>)   — e.g.     500000000000000000000 = 500 tokens
```

### e) Randomness pairing + fee float (required)

```bash
VRF_SVC=0x19856b7E4Ab191fC265525E400b9E686f75AE327
# Pair the conductor to the VRF service (called by the VRF service owner, not the deployer)
cast send $VRF_SVC "setSpinEngine(address)" $VRF_CONDUCTOR \
  --rpc-url $RPC_URL --private-key <VRF_SERVICE_OWNER_KEY>

# Pre-fund the conductor with ETH for per-request VRF fees
cast send $VRF_CONDUCTOR --value 0.1ether \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY
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

## 6. After Pons graduation — wire the $PIT token

Once `$PITBOSS` has graduated on Pons and its contract address is known, call
`setPIT` on the three contracts that need it.  This is a one-time, irreversible
setter on each — call it once, in order:

```bash
PIT=<pons graduated $PITBOSS address>

cast send $AMM          "setPIT(address)" $PIT --rpc-url $RPC_URL --private-key $PRIVATE_KEY
cast send $ACTIVATION   "setPIT(address)" $PIT --rpc-url $RPC_URL --private-key $PRIVATE_KEY
cast send $LOAN_VAULT   "setPIT(address)" $PIT --rpc-url $RPC_URL --private-key $PRIVATE_KEY

# Then fund the AMM with PIT so Bosses are buyable:
cast send $PIT "transfer(address,uint256)" $AMM <amount_in_wei> \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY
```

## 7. The one remaining blank before deploy
1. **`PIT_TOKEN`** — `$PITBOSS`, after launching on Pons. Leave blank for the initial deploy; wire via `setPIT()` after graduation.

All Uniswap V3 infrastructure addresses are now confirmed (source: Uniswap V3 deployment docs, chainId 4663).
