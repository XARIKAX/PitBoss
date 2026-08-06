# Locker

Time-locked liquidity. The **LiquidityLocker** holds LP positions or tokens for a
fixed term and proves they can't be pulled early — a credibility tool for stock
listings on the floor.

## Use it

- **Lock** — deposit an LP position or tokens and choose an unlock time. The
  locker custodies them until the term ends.
- **Extend** — push the unlock time further out (never earlier).
- **Withdraw** — after the unlock time, reclaim exactly what was locked.

## Fees

- Locker fees route to the **House Book** (tagged `LockerFees`), feeding the same
  payroll as every other module.

## Safety

- A lock **cannot be shortened or withdrawn before its unlock time** — the term is
  enforced on-chain.
- The locker is a custody primitive only; it never mints, rebases, or rehypothecates
  what it holds.

> The `LiquidityLocker` address auto-populates from the deployments file. See
> [addresses.md](../addresses.md).
