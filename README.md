# PitBosses

**The floor where every fee pays the Bosses — in real stock. Play the pit or be the house.**

PitBosses is a permissionless on-chain protocol where a fixed collection of Boss
NFTs sit on a payroll: every fee from every module flows into one public **House
Book**, and when it fills, anyone cranks it and each activated Boss is paid — pro
rata by dynamic floor position — in the tokenized stocks they elected, delivered
straight to the Boss's on-chain wallet (ERC-6551 TBA).

Operator: **MarketMaker Labs**. Token: **$PIT**.

> Rewards are promotional, not dividends — they confer no equity, ownership, or
> shareholder rights. Roll features are unavailable in restricted regions,
> including the United States. This repo is a front end + permissionless contracts;
> nothing here is financial, investment, legal, or tax advice.

---

## Monorepo layout

```
/contracts     Foundry project — Solidity ^0.8.24, OpenZeppelin v5, ERC-721/6551/20
/apps/web      Next.js 14 (App Router) + wagmi v2 + viem + Tailwind
/apps/keeper   fulfill / crank-watch / restock / season-agg bots (TypeScript + viem)
/docs          Markdown rendered by the site's /docs page
FLAG.md        End-of-build config report + auditor scoping (read this)
```

## Modules

| Module | What it does |
|---|---|
| **The Floor** | PitBoss NFT collection (ERC-6551 TBAs), `$PIT`, Flat AMM Vault, Activation, dynamic Floor Position tiers |
| **The Pit** | Certificate Counter + Bearer Certificates (on-chain SVG), Degen Roll machines with **player-owned bankroll** |
| **House Book** | Single fee sink; anyone cranks; pays every Boss pro rata by floor position |
| **The Launcher / Opening Bell** | Token launches whose curve fees charge a public buyback bar |
| **Locker / Loans** | Liquidity locking (hard/vest/permanent) and borrowing the flat AMM price against a Boss |
| **Seasons** | Quarterly leaderboard + floor soft-reset + bonus round |

Build order and full spec: `docs/overview.md` and `FLAG.md`.

---

## Quickstart

### Contracts
```bash
cd contracts
npm install                       # OpenZeppelin v5 + erc6551 + solc (via npm remappings)
# forge-std is vendored under lib/forge-std (pinned 1.16.2) — no extra install needed.

forge build
forge test -vvv                   # unit + invariant + fuzz
forge test --gas-report

# Local deploy against anvil (deploys mocks, writes deployments/deployments.31337.json)
anvil &
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

No Foundry binary? A dependency-light compile check runs on solc directly:
```bash
node scripts/compile-check.js src,test,script
```

### Frontend
```bash
cd apps/web
pnpm install
pnpm dev            # http://localhost:3000
```

### Keeper bots
```bash
cd apps/keeper
cp .env.example .env   # fill RPC_URL, PRIVATE_KEY, addresses
docker compose up      # runs fulfill + crank-watch + restock + season-agg
```

---

## Networks

| Chain | ID | Gas | Entropy | Role |
|---|---|---|---|---|
| Robinhood Chain | 4663 | ETH | miner / DERP-style | primary |
| Base | 8453 | ETH | Chainlink VRF v2.5 | fallback |

All chain-specific values live in `contracts/src/config/Chains.sol` and
`apps/web/config/chains.ts` (kept in sync). Contract addresses are written to
`contracts/deployments/deployments.<chainId>.json` by the deploy script and read by
the web app and docs automatically.

## Safety guarantees (enforced in code)

- No admin key can touch locked liquidity, player-owed funds, reserved prizes,
  bankroll stakes, or certificate vaults.
- Roll machines fail **closed**: entropy stall stops new ticket sales, but settles,
  seals, cash-outs, and refunds always work; unfulfilled pulls refund after 48h.
- Every roll is verifiable: `wordOf(id) == previewWord(id)` and the multiplier is a
  pure, recomputable function of the entropy word.
- Certificate supply always equals vaulted deeds — a spent note cannot exist.

See `FLAG.md` for every `[CONFIG]` value, mocked dependencies, and the auditor
scoping list.
