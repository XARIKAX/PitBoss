# Loans

Borrow against the floor. The **LoanVault** lends $PIT against a Boss used as
collateral, drawing on the flat-AMM $PIT principal.

## Use it

- **Borrow** — deposit a Boss as collateral and draw $PIT against it, up to the
  vault's loan-to-value limit. The Boss is escrowed for the life of the loan.
- **Repay** — repay principal plus accrued interest to release your Boss.
- **Liquidate** — if a loan falls below its maintenance threshold (or the term
  lapses), the collateral Boss is **liquidated into the Flat AMM Vault**, where it
  becomes fresh primary-market inventory (`depositLiquidated`). Anyone can trigger
  an eligible liquidation.

## Where the $PIT comes from

The Flat AMM Vault's $PIT balance is the shared "AMM principal." The Loan Vault
lends against it, and liquidated Bosses flow back into that same vault — so the
primary market and the loan book share one pool.

## Fees

- Loan **interest** routes to the **House Book** (tagged `LoanInterest`), feeding
  the same payroll as every other module.

## Safety

- A borrowed Boss is **escrowed** — it can't be sold out from under a loan.
- Liquidation is deterministic and permissionless: the collateral goes to the AMM
  at the protocol's terms, never to a privileged liquidator.
- A Boss in escrow is **off the payroll** until the loan is repaid and it returns
  to your wallet.

> The `LoanVault` address auto-populates from the deployments file. See
> [addresses.md](../addresses.md).
