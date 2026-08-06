# The Floor

The membership layer. Own a Boss, put it on the payroll, elect how you get paid.

## Get a Boss

Bosses are sold from the **Flat AMM Vault** at a fixed price: `500,000 $PIT` plus
a small ETH fee. The ETH fee goes to the House Book.

- **`buyNext()`** — buy the next Boss: dispenses the oldest one in the vault's
  inventory, or mints a fresh one if inventory is empty and supply remains. Costs
  the flat $PIT price + `buyFee` ETH. Approve $PIT first.
- **`snipe(tokenId)`** — buy a specific in-vault Boss for a higher ETH fee
  (`snipeFee`).

Every Boss gets its own **ERC-6551 token bound account (TBA)** — a wallet the NFT
owns. Payroll is delivered there.

## Activate (join the payroll)

A Boss earns nothing until it is **activated**.

- **`activate(tokenId)`** — costs `activationFee` in $PIT (approve first). **50%
  is burned, 50% is parked at the House Book.** The Boss goes on the payroll and
  starts accruing floor-position score.
- **`deactivate(tokenId)`** — voluntarily leave the payroll.

**Activation follows ownership.** It is snapshotted against the NFT's transfer
epoch, so selling a Boss clears its activation automatically — a new owner starts
fresh, and the old owner can't keep earning on a Boss they sold. Anyone can call
`syncDeactivate(tokenId)` to sweep a sold-but-still-listed Boss off the payroll.

## Floor Position (your weight)

Your share of every crank is proportional to your **floor-position weight**. It is
dynamic:

- Continuous activation accrues score (`pokeStreak` converts elapsed epochs into
  points — permissionless; anyone can poke).
- Staking into a Degen Roll bankroll bumps your score.
- Launcher participation bumps your score.
- A true ownership transfer resets it.

Higher weight → a larger slice of the pooled fees at the next crank.

## Elect how you get paid

By default a Boss is paid in **ETH**. Elect stock tokens instead:

- **`setElection(tokenId, tokens[], weightsBps[])`** — up to 3 payout tokens with
  basis-point weights summing to `10_000`. At delivery your ETH share is swapped
  into those tokens (per-swap slippage capped) and pushed to your TBA.
- **`setAutoDCA(tokenId, token)`** — shortcut: 100% into a single token.

## Fees

- Buying a Boss: flat `500,000 $PIT` + ETH `buyFee`/`snipeFee` → House Book (AMM
  fees).
- Activation: `activationFee` in $PIT, 50% burned / 50% parked at the House Book.

## Safety

- The AMM vault's admin can set fees and the recipient only — it never touches
  owed funds.
- Activation state is derived from the NFT's transfer epoch, so payroll can't be
  gamed across a sale.
- Payroll math is an O(1) accumulator: your accrued share is exact and can't be
  diluted by the number of Bosses.
