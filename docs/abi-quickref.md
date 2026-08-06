# ABI Quick Reference

Key external functions per contract — signatures plus a one-line description.
Views and admin-only setters are omitted; see the source for the full ABI.

## DegenRoll (roll machine)

| Function | Description |
| --- | --- |
| `buy(Lane lane) payable → uint256 roundId` | Buy a ticket (ETH) and commit to entropy. `lane` = `Instant`/`Vault`. Reserves worst-case 50×. |
| `settle(uint256 roundId) → uint256 prize` | Settle a fulfilled round; prize paid as stock to your wallet. |
| `sellBack(uint256 amount)` | Sell won stock back to the bankroll at 95% of the oracle mark. |
| `sealIntoCertificate(uint256 roundId) → uint256 prize` | Settle by sealing 100% of the prize into a Bearer Certificate (no spread). |
| `stakeBankroll(uint256 bossId, uint256 amount) → uint256 sharesOut` | Stake stock into the bankroll with an activated Boss; mints shares. |
| `unstake(uint256 sharesIn) → uint256 amount` | Withdraw bankroll stake, up to free inventory. |
| `restock() → uint256 stockOut` | Convert the ETH float into bankroll stock at the oracle mark (permissionless). |
| `refund(uint256 roundId)` | Refund an unfulfilled ticket after 48h. |

## HouseBook (single fee sink)

| Function | Description |
| --- | --- |
| `payFee(Source source) payable` | Pay ETH into the book, tagged by source (`msg.value` = amount). |
| `crank() → (uint256 pot, uint256 tip)` | Distribute the bar pro rata by floor weight; caller takes the 0.5% tip. |
| `deliver(uint256 tokenId) → uint256 amount` | Realize a Boss's ETH, convert to its elected token(s), push to its TBA. |
| `setElection(uint256 tokenId, address[] tokens, uint16[] weightsBps)` | Elect up to 3 payout tokens (weights sum 10_000; empty = ETH). |

## FlatAMMVault (primary market)

| Function | Description |
| --- | --- |
| `buyNext() payable → uint256 tokenId` | Buy the next Boss (dispense inventory or mint). Costs `PRICE_PIT` $PIT + `buyFee` ETH. |
| `snipe(uint256 tokenId) payable` | Buy a specific in-vault Boss. Costs `PRICE_PIT` $PIT + `snipeFee` ETH. |

## ActivationManager

| Function | Description |
| --- | --- |
| `activate(uint256 tokenId)` | Put a Boss on the payroll. `activationFee` $PIT: 50% burned, 50% parked at the House Book. |
| `deactivate(uint256 tokenId)` | Voluntarily leave the payroll. |

## BearerCertificate

| Function | Description |
| --- | --- |
| `issue(address to, address token, uint256 amount) → uint256 certId` | Mint a deed backed by `amount` of `token`, pulled from an authorized issuer. |
| `redeem(uint256 certId)` | Burn the deed and release its stock to the holder, atomically. Never pausable. |

## CertificateCounter

| Function | Description |
| --- | --- |
| `buy(address to, address token, uint256 amount) payable → uint256 certId` | Wrap `amount` of a routed `token` 1:1 into a certificate to `to`. Flat $2 fee in ETH, excess refunded. |

## Entropy Conductor

| Function | Description |
| --- | --- |
| `fulfill(bytes32 id) → uint256 word` | Land the entropy word for a committed `id` (permissionless; the `fulfill` keeper runs it). |
| `isReady(bytes32 id) → bool` | True once `fulfill(id)` would succeed. |
