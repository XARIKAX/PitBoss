# PitBosses — Contract Deployment Handover

Everything a developer needs to deploy the PitBosses protocol to Robinhood
Chain (staging first, then production). Written against the repo as of this
commit; every path, env var and command below is real — nothing is
hand-waved.

---

## 0. TL;DR — fastest safe path

1. Create a **fresh deployer wallet**, fund it with a little ETH on Robinhood
   Chain (chainId **4663**, RPC `https://rpc.mainnet.chain.robinhood.com`).
2. Add its private key as the GitHub Actions secret **`DEPLOY_PRIVATE_KEY`**
   (repo → Settings → Secrets and variables → Actions).
3. Run the **Deploy** workflow (Actions tab → Deploy → Run workflow →
   network: `robinhood-staging`).
4. The workflow deploys the full system **with mocked externals**
   (`USE_MOCKS=true`), writes `contracts/deployments/deployments.4663.json`,
   and commits it. The Vercel site picks the addresses up on its next build —
   every page flips from "not deployed" to live automatically.
5. Read **§6 (post-deploy)** and **§7 (before real money)** before calling it
   launched. §7 contains a genuine blocker (PIT supply vs AMM price).

---

## 1. Repo layout

```
contracts/            Foundry project (Solidity ^0.8.24, OZ v5.6.1)
  src/                35 contracts (see §3)
  script/Deploy.s.sol Idempotent full-system deploy + JSON writer
  test/               28 tests: invariants, EV=0.90 prize table, chi-square
  deployments/        deployments.<chainId>.json (consumed by the web app)
  lib/                vendored forge-std 1.16.2 + openzeppelin
apps/web/             Next.js 14 static export (wagmi v2/viem), Vercel
apps/keeper/          4 keeper bots (TypeScript/viem, Docker-ready)
art/                  888-piece collection + generator (pitbosses/)
docs/                 module docs, network notes, this file
.github/workflows/    ci.yml (tests + anvil deploy smoke), deploy.yml (manual)
```

- **Tests**: `forge test` — all 28 green in CI. Run them before any deploy.
- **CI proves the deploy**: every push runs `Deploy.s.sol` against anvil and
  uploads the resulting JSON (ci.yml `deploy-smoke` job). If that job is
  green, the script works end-to-end.

## 2. Prerequisites

- Foundry (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)
- Node 22 (`npm install` inside `contracts/` pulls solc + helpers)
- A funded deployer key on the target chain. Gas is cheap on Robinhood
  Chain; 0.05 ETH is plenty for the full system.
- Explorer for verification: `https://robinhoodchain.blockscout.com`

## 3. What gets deployed (in order, auto-wired)

`script/Deploy.s.sol` deploys and wires in one broadcast:

| # | Contract | Role | Wiring done by the script |
|---|----------|------|---------------------------|
| 1 | Mocks or real externals | oracle, swap router, sample stock, entropy | see §5 |
| 2 | `PIT` | ERC-20, 42M fixed supply → `TREASURY` | — |
| 3 | `PitBossAccount` + `InitializingRegistry` | ERC-6551 implementation + atomic clone/init registry | registry bound to implementation |
| 4 | `PitBoss` | 888-supply ERC-721, TBA per token | minter = AMM (step 6) |
| 5 | `FloorPosition` | weight/streak engine | `setRewardSink(HouseBook)` |
| 6 | `HouseBook` | fee sink + crank | constructor(boss, floor, router) |
| 7 | `FlatAMMVault` | flat-price NFT AMM (buyNext/snipe) | `PitBoss.setMinter(amm)` |
| 8 | `ActivationManager` | 500 PIT activation, 50% burn / 50% book | `floor.setBumper(activation)` |
| 9 | `BearerCertificate` + `CertificateCounter` | stock→deed NFTs, $2 flat fee | `cert.setIssuer(counter)` |
| 10 | `DegenRollFactory` | creates casino machines | full Wiring struct (conductor, book, oracle, router, cert, boss, activation, floor, reserve) |
| 11 | `LiquidityLocker` | locks/vests, no admin key | fee share → book |
| 12 | `LoanVault` | NFT-collateral loans, 15% APR | `amm.setLiquidator(loans)` |
| 13 | `OpeningBell` + `LauncherFactory` | launchpad + provably-fair bell | `bell.setLauncher(launcher)` |
| 14 | `SeasonEngine` | quarterly seasons | `floor.setBumper(season)` |

With mocks on, the script also creates one **sample machine** (tNVDA) and
grants it `cert.setIssuer` + `floor.setBumper`.

Output: `contracts/deployments/deployments.<chainId>.json` with every
address (PascalCase keys — the web app maps them; don't rename keys).

## 4. Environment variables

All optional on anvil (sender defaults + mocks). For real chains:

| Var | Required when | Meaning / default |
|-----|---------------|-------------------|
| `DEPLOY_PRIVATE_KEY` | GH Actions route | deployer key (repo secret) |
| `USE_MOCKS` | staging on a real chain | `true` = deploy mock oracle/router/stock/entropy. Defaults true only on 31337 |
| `TREASURY` | recommended always | receives the full 42M PIT mint. **Defaults to the deployer** |
| `PROTOCOL_RESERVE` | recommended always | protocol fee share receiver. Defaults to deployer |
| `ROYALTY_RECEIVER` | recommended always | NFT royalty receiver. Defaults to deployer |
| `ORACLE` | `USE_MOCKS` unset/false | real price oracle (usdPerEth + ethPerToken per stock) |
| `SWAP_ROUTER` | `USE_MOCKS` false | real ETH↔stock swap router |
| `STOCK_SAMPLE` | `USE_MOCKS` false | one real tokenized-stock address (bootstrap machine/routing) |
| `VRF_COORDINATOR` | non-Robinhood chains only | Chainlink VRF v2.5. Robinhood (4663) uses the Miner conductor instead — no VRF needed |

Entropy is picked per chain in `src/config/Chains.sol`: chainId 4663 →
`MinerEntropyConductor` (deployed by the script), anything else →
`VRFEntropyConductor(VRF_COORDINATOR)`.

## 5. Deploy routes

### Route A — GitHub Actions (recommended for staging)

Workflow: `.github/workflows/deploy.yml`, manual-only.

1. Add secret `DEPLOY_PRIVATE_KEY` (funded on Robinhood Chain).
2. Actions → **Deploy** → Run workflow → `robinhood-staging`.
3. It runs `forge script script/Deploy.s.sol --rpc-url
   https://rpc.mainnet.chain.robinhood.com --broadcast` with
   `USE_MOCKS=true`, then **commits `deployments.4663.json` to the branch**.
4. Vercel rebuilds on that commit → the dApp goes live against the addresses.

Staging = real chain, real contracts, **mocked oracle/router/stock**, so the
whole app is playable end-to-end before real integrations land.

### Route B — local forge

```bash
cd contracts && npm install

# staging (mocks) to Robinhood Chain:
USE_MOCKS=true \
TREASURY=0x... PROTOCOL_RESERVE=0x... ROYALTY_RECEIVER=0x... \
forge script script/Deploy.s.sol \
  --rpc-url https://rpc.mainnet.chain.robinhood.com \
  --broadcast --private-key $DEPLOY_PRIVATE_KEY

# production (real externals):
ORACLE=0x... SWAP_ROUTER=0x... STOCK_SAMPLE=0x... \
TREASURY=0x... PROTOCOL_RESERVE=0x... ROYALTY_RECEIVER=0x... \
forge script script/Deploy.s.sol \
  --rpc-url https://rpc.mainnet.chain.robinhood.com \
  --broadcast --private-key $DEPLOY_PRIVATE_KEY
```

Then commit `contracts/deployments/deployments.4663.json` and push — the
frontend reads addresses from that file at build time
(`apps/web/lib/deployments.ts`; missing file = placeholder "not deployed"
states everywhere, which is what the site shows today).

## 6. Post-deploy checklist (staging)

1. **Verify contracts** on Blockscout (`forge verify-contract`, verifier
   `blockscout`, URL `https://robinhoodchain.blockscout.com/api`). Optional
   but do it — users will read the casino code.
2. **Frontend live-check**: after the deployments JSON commit builds on
   Vercel, `/floor` shows AMM buy/snipe, `/pit` swaps the DEMO floor for the
   real machine grid automatically.
3. **NFT metadata**: pin `art/pitbosses/images` + `art/pitbosses/metadata`
   to IPFS, run the CID swap across the metadata (replace `REPLACE_CID`),
   re-pin metadata, then call `PitBoss.setBaseURI("ipfs://<metadataCID>/")`.
4. **More machines**: `DegenRollFactory.createMachine(stockToken, creator)`,
   then for each machine: `BearerCertificate.setIssuer(machine, true)` and
   `FloorPosition.setBumper(machine, true)` (owner calls; the script did
   this for the sample machine).
5. **Certificate routing**: `CertificateCounter.setRouted(stock, true)` per
   stock that may be sealed into deeds.
6. **Keeper bots** (`apps/keeper/`, README inside): run at least `fulfill`
   (entropy) and `crank-watch` (House Book). Docker compose provided; needs
   an RPC url + a funded keeper key. Everything they do is permissionless —
   they're convenience, not authority.
7. **Smoke the money paths with dust**: buy a Boss (needs PIT in the buyer
   wallet: staging mock stock is faucet-style, PIT comes from `TREASURY`),
   activate it, buy a pit ticket, settle, sell back, crank the book, take a
   loan, repay. All eight flows have UI.

## 7. BEFORE real money — decisions & known gaps

**(a) BLOCKER — PIT supply vs AMM price.** `PIT.INITIAL_SUPPLY` = 42,000,000
and `FlatAMMVault.PRICE_PIT` = 500,000 PIT. 888 × 500k = **444M PIT — more
than 10× the total supply**. At current constants the collection
mathematically cannot sell out. Pick one before production deploy:
- lower `PRICE_PIT` (e.g. 40,000 PIT ⇒ 35.5M to sell all 888, tight but
  possible), or
- raise supply, or
- price bosses in ETH instead.
This is a constant — fix in source, retest (`forge test`), redeploy.

**(b) AMM ETH fees are placeholder-small** (`buyFee` 0.002 ETH / `snipeFee`
0.006 ETH, owner-settable at runtime). Reference: StonkBrokers charges
10–15% of NFT value. Decide the fee schedule; `setFees` can adjust
post-deploy, no redeploy needed.

**(c) `MockPoolDeployer` is used even in real mode** (Deploy.s.sol line 93
— launcher graduation pools). Fine for staging; production launcher
graduations need a real DEX adapter. Scope: implement `IPoolDeployer`
against the chain's V3 DEX and pass it to `LauncherFactory`.

**(d) Real externals**: production needs real `ORACLE`, `SWAP_ROUTER` and
tokenized-stock addresses on Robinhood Chain. Staging mocks hide these.

**(e) Ownership**: every `Ownable` contract is owned by the deployer.
Before real money: move ownership to a multisig, and decide which setters
should be renounced vs kept (fees, baseURI, machine creation grants).

**(f) No audit yet.** The suite is strong (invariants incl. reserve
solvency, EV, chi-square) but this is unaudited money-handling code.
Treat staging as soft-launch; audit before promoting.

**(g) Legal**: the web app geo-gates (attestation modal) and
`docs/legal.md` exists — have counsel review for your jurisdictions;
this is a gambling product paying out in tokenized equities.

## 8. Ops runbook (once live)

- **Entropy health**: each machine shows an entropy badge in the UI;
  `conductor.healthy()` on-chain. If degraded, rolls pause at commit —
  keeper `fulfill` usually clears it.
- **House Book**: fills from six fee streams; anyone can `crank()` when the
  bar is full (cranker gets 0.5%). `crank-watch` automates it profitably.
- **Machine solvency**: invariant `totalBankrollStock >= totalReserved` is
  enforced on-chain (50× worst-case reserve per open round). `restock`
  keeper converts ETH float back into stock inventory.
- **Redeploys**: the script is re-runnable; each run is a fresh system.
  Never point the frontend at a mix of two deployments — always take the
  whole JSON from one run.

## 9. Quick reference

| Thing | Value |
|---|---|
| Chain | Robinhood Chain, chainId 4663, ETH gas |
| RPC | `https://rpc.mainnet.chain.robinhood.com` |
| Explorer | `https://robinhoodchain.blockscout.com` |
| Fallback chain | Base 8453 (needs `VRF_COORDINATOR`), anvil 31337 for dev |
| Prize table | 21 rungs, 0.70×–50×, RTP 90% (`src/pit/PrizeTable.sol`, EV test-locked) |
| Pit edge split | 2.5% creator / 2.5% House Book / 5% protocol |
| Activation | 500 PIT: 50% burned, 50% House Book |
| Cert fee | $2 in ETH: 50% book / 50% reserve |
| Loans | 15% APR (30% late), 70% of interest → book |
| Launcher | 1% curve fee, 30% of it → Opening Bell, ringer tip 0.5% |
| Crank tip | 0.5% of the pot |

Questions the code answers faster than any doc: `contracts/test/` shows
every flow working end-to-end, and `docs/modules/` has per-module notes.
