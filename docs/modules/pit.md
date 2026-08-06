# The Pit

Where fees are made. The Pit has two counters: the **Certificate Counter** (wrap
stock into bearer deeds) and the **Degen Roll machines** (roll ETH tickets for
stock prizes on a player-owned bankroll).

---

## Certificate Counter & Bearer Certificates

Wrap any routed stock token **1:1** into a numbered **Bearer Certificate** — an
on-chain-drawn deed backed by an exact amount of that token.

- **`buy(to, token, amount)`** — pull `amount` of `token`, mint a certificate to
  `to`. Flat fee is a fixed **$2 USD paid in ETH** (excess refunded), split
  **50% House Book / 50% protocol reserve**.
- **`redeem(certId)`** — burn the deed and release its stock to the holder, in the
  same transaction. A spent certificate can never exist.

Redeem and transfer are **never pausable** — only new issuance can be gated
upstream. Each deed also gets its own ERC-6551 TBA.

---

## Degen Roll

One roll machine per stock token. **Tickets are paid in ETH; prizes settle as
stock.** The bankroll is **player-owned**: activated Bosses stake stock as
inventory and earn the sell-back spread pro rata.

### How to play

- **`buy(lane)`** — buy a ticket (send ETH) and commit to future entropy. `lane`
  is `Instant` (short delay, capped ticket size) or `Vault` (longer commit delay,
  anti-grind). Reserves worst-case 50× from free inventory.
- **`settle(roundId)`** — settle a fulfilled round; the prize is paid as stock to
  your wallet.
- **`sealIntoCertificate(roundId)`** — settle by sealing 100% of the prize into a
  Bearer Certificate; **no sell-back spread taken**.
- **`sellBack(amount)`** — sell won stock back to the bankroll at **95% of the
  oracle mark**; the 5% spread stays in the bankroll for stakers.
- **`refund(roundId)`** — reclaim an **unfulfilled** ticket after the **48-hour**
  window.

### The prize table

Multipliers are in "×" (1.00× returns the ticket). Odds are the probability of
each outcome. **RTP = 90% (EV = 0.90).**

| Multiplier | Odds % |
| --- | --- |
| 0.70 | 45.18 |
| 0.75 | 36.40 |
| 0.80 | 2.90 |
| 0.85 | 2.24 |
| 0.90 | 1.80 |
| 0.95 | 1.50 |
| 1.00 | 2.50 |
| 1.10 | 1.80 |
| 1.25 | 1.40 |
| 1.50 | 1.10 |
| 1.75 | 0.80 |
| 2.00 | 0.70 |
| 2.50 | 0.50 |
| 3.00 | 0.35 |
| 4.00 | 0.20 |
| 5.00 | 0.16 |
| 7.50 | 0.15 |
| 10.0 | 0.12 |
| 15.0 | 0.06 |
| 25.0 | 0.04 |
| 50.0 | 0.10 |

Floor **0.70×**, ceiling **50×**, RTP **90%**. Every outcome is verifiable: the
multiplier is a pure function of the landed entropy word, so anyone can recompute
a roll and confirm it.

### Economic model

- A ticket `T` is paid in ETH and **escrowed** until the round settles or refunds.
- At settle, a **10% edge** is taken, split **2.5% creator / 2.5% House Book / 5%
  protocol**.
- The remaining **90% net** feeds an **ETH float**. The `restock` keeper converts
  that float into bankroll **stock** at the oracle mark (see the keeper bots).
- Prizes settle **as stock**: prize notional is the full ticket value in stock ×
  the rolled multiplier.
- Because table **EV = 0.90**, the bankroll is flat in expectation and earns the
  **5% sell-back spread** (plus rounding dust) over time.
- The bankroll is **player-owned**. Activated Bosses `stakeBankroll` stock and
  receive pro-rata shares; the spread accrues to shares, so `sharePrice` rises as
  the machine earns.

### Guarantees

- **Always solvent.** Every open pull reserves **worst-case 50×** from free
  inventory (`totalBankrollStock >= totalReserved` at all times), so the machine
  can always pay the maximum prize.
- **Fails closed on entropy stall.** If the conductor is unhealthy, **new ticket
  sales stop** — but settles, seals, sell-backs and refunds always work.
- **Refundable.** An unfulfilled pull is refundable after **48 hours**.
- **Loss-streak rebate.** After **5 consecutive floor rolls** (0.70×), a rebate —
  10% of your average ticket — is minted to you as a certificate (paid from free
  inventory, preserving the reserve invariant).

### Stake the bankroll

- **`stakeBankroll(bossId, amount)`** — stake stock with an **activated** Boss you
  own; mints pro-rata shares and bumps that Boss's floor position.
- **`unstake(sharesIn)`** — withdraw up to free inventory (open reserves can't be
  withdrawn).
- **`restock()`** — permissionless: convert the machine's ETH float into bankroll
  stock at the oracle mark. Run by the keeper, callable by anyone.

> Roll features are geo-gated. See [legal.md](../legal.md).
