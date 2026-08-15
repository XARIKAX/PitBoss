# The Floor

The membership layer. Own a Boss, put it on the payroll, elect how you get paid.

## Get a Boss

The genesis mint was **free** — all 888 minted through the FreeMintPass for gas
only, and the collection trades on OpenSea. The **Flat AMM Vault** remains the
protocol's primary market for any Boss that returns to inventory (loan
liquidations): its `PRICE_PIT` is set to `0`, so buying costs only the ETH fee,
which goes to the House Book.

- **`buyNext()`** — buy the next Boss out of vault inventory for `buyFee` ETH
  (mints fresh only while supply remains).
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

- Buying a Boss from the vault: ETH `buyFee`/`snipeFee` → House Book (AMM fees).
  No $PIT charge while `PRICE_PIT` is 0.
- Activation: `888,888 $PITBOSS` — 50% burned at the dead address, 50% to the
  PitTreasury, which sells it for ETH into the House Book as Boss rewards.

## Safety

- The AMM vault's admin can set fees and the recipient only — it never touches
  owed funds.
- Activation state is derived from the NFT's transfer epoch, so payroll can't be
  gamed across a sale.
- Payroll math is an O(1) accumulator: your accrued share is exact and can't be
  diluted by the number of Bosses.
