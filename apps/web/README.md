# PitBosses — web

Front end for **PitBosses** (`$PIT`). _Run the floor. Get paid in stock._

Next.js 14 (App Router) · TypeScript · wagmi v2 + viem · Tailwind CSS. Built to
static-export (`output: 'export'`), so it serves from any static host.

Operator brand: **MarketMaker Labs**. This is a front end only — the underlying
contracts are permissionless.

## Run it

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

Build the static site:

```bash
pnpm build        # emits ./out
pnpm typecheck    # tsc --noEmit
```

> Fonts load via `next/font/google` (Instrument Serif, Instrument Sans, IBM Plex
> Mono), which fetches at build time — the first build needs network access.

## Environment

Copy `.env.example` to `.env.local` and fill in:

| Var | Purpose |
| --- | --- |
| `NEXT_PUBLIC_RPC_ROBINHOOD` | Robinhood Chain RPC (primary, chainId 4663) |
| `NEXT_PUBLIC_RPC_BASE` | Base RPC (fallback, chainId 8453) |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect id (optional; injected works without it) |
| `NEXT_PUBLIC_GEO_LOOKUP_URL` | Optional IP-geo endpoint for the Pit geo-gate |

## Layout

```
app/            App Router routes (landing + 9 module pages + docs)
components/     UI: Nav, Footer, Ticker, Providers, ChainGuard, GeoGate, TxToast, OddsTable, …
config/chains.ts   Single source of truth for chain values (mirrors contracts/src/config/Chains.sol)
lib/            prizeTable, wagmi, deployments loader, geo, docs loader, formatters, markdown
```

## Chains

- **Robinhood Chain** (4663) — primary, ETH gas, `miner` entropy.
- **Base** (8453) — fallback, `vrf` entropy.

`config/chains.ts` is the single source of truth and mirrors the Solidity
`Chains` library. Deployed addresses are read from
`contracts/deployments/deployments.<chain>.json` when present (via
`lib/deployments.ts`) and fall back to placeholders otherwise.

## The prize table

The Degen Roll table lives in `lib/prizeTable.ts` (21 rows, RTP 90%, 10% house
edge) and mirrors `contracts/src/pit/PrizeTable.sol`. It is the only source for
any odds display.

## Contract wiring — TODO

Every place that needs a real contract read/write is marked with a `TODO` tag in
the UI (see `components/ui.tsx` → `TodoTag`) and a code comment. The scaffold
renders with placeholder data and instructive empty states so the flows are
visible before the ABIs are wired. Search for `TODO` to find them:

- Floor: `FlatAMMVault.buy`, `ActivationManager.activate/setDca`, floor position, TBA balances, elections.
- Pit: `DegenRoll.buyTicket/roll`, verify-roll, bankroll `stake/unstake`, open-round feed, entropy health.
- Certificates: `CertificateCounter.buy/buyFor`, `BearerCertificate.tokenURI/redeem`.
- Launcher: `Launcher.createLaunch`, round reads, Buyback Bar fill.
- Locker: `Locker.lock/collectFees`, locks list.
- Loans: `Loans.borrow/repay`, position + rate reads.
- Book: `HouseBook.crank`, per-source accrual, payout log (0.5% crank tip).
- Seasons: season end, scoring, archive.

## Notes

- **Geo-gate:** `/pit` routes hard-block US and UK and require a one-time
  self-attestation (localStorage). This is a UX gate only; the contracts are
  permissionless.
- **Design system:** tokens live in `tailwind.config.ts` + `app/globals.css`.
  Serif headlines with lime italic emphasis; **mono is for DATA only** (odds,
  tickers, addresses, House Book figures); one full-bleed lime slab per page;
  pill buttons; cropped lime wordmark in the footer; bottom ticker; scroll
  reveals that respect `prefers-reduced-motion`.
