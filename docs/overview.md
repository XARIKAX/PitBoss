# PitBosses

**The floor where every fee pays the Bosses — in real stock.**

PitBosses is a permissionless protocol. Own a Boss, put it on the payroll, and
every fee the floor collects is swapped into the stock tokens you elected and
delivered straight to your Boss's on-chain account. No claiming ritual, no
staking lockup — fees pool, anyone cranks, and the split lands pro rata by your
floor position.

Collection: **PitBosses**. Token: **$PIT**.

---

## Modules

### The Floor

The membership layer.

- **PitBoss NFT collection** — the Bosses. Each Boss owns an **ERC-6551 token
  bound account (TBA)**: a smart-contract wallet the NFT controls, where payroll
  is delivered.
- **$PITBOSS token** — the protocol's currency, launched on Pons. Its job is
  activation: a Boss earns nothing until 888,888 is paid, half burned forever,
  half sold by the treasury into Boss rewards.
- **Flat AMM Vault** — the vault market for Bosses that return to inventory.
  The genesis mint itself was free (FreeMintPass, 888/888 minted); vault buys
  cost only a small ETH fee that goes to the House Book.
- **Activation** — put a Boss on the payroll with 888,888 $PITBOSS. Activation
  clears automatically when a Boss is sold, so payroll always follows the current
  owner — and the next owner pays again.
- **Floor Position tiers** — your dynamic weight in the payroll split. It grows
  with continuous activation, bankroll participation and launcher activity, and
  resets on transfer.

### The Pit

Where fees are made.

- **Certificate Counter** — wrap any routed stock token 1:1 into a numbered
  bearer deed for a flat fee.
- **Bearer Certificates** — numbered, on-chain-drawn deeds each backed by an exact
  amount of one stock token; `redeem` burns the deed and releases the stock
  atomically.
- **Degen Roll machines** — one roll machine per stock token. Tickets are paid in
  ETH; prizes settle as stock. The bankroll is **player-owned**: activated Bosses
  stake stock as inventory and earn the sell-back spread. See
  [modules/pit.md](./modules/pit.md).

### House Book

The **single fee sink**. Every money module — the Pit edge, certificate fees,
launcher fees, locker fees, loan interest, AMM fees — pays ETH into one contract,
tagged by source. When the bar fills past the threshold, **anyone cranks**: the
cranker takes a 0.5% tip and the rest is distributed pro rata by floor weight
through an O(1) accumulator (no loop over Bosses). Each Boss's share is then
pulled with `deliver`, which converts the ETH into that Boss's elected token(s)
and pushes them to its TBA.

### Opening Bell

Launcher buybacks — the venue where new-listing activity feeds value back to the
floor. See [modules/launcher.md](./modules/launcher.md).

### Locker

Time-locked liquidity. Lock LP or tokens for a fixed term; fees route to the
House Book. See [modules/locker.md](./modules/locker.md).

### Loans

Borrow against the flat-AMM $PIT principal using a Boss as collateral; defaults
are liquidated into the AMM. Interest routes to the House Book. See
[modules/loans.md](./modules/loans.md).

### Seasons

Quarterly leaderboards scoring activation, rolls, bankroll staking and launcher
participation. See [modules/seasons.md](./modules/seasons.md).

---

## The payroll flow

```
fees (every module, in ETH)
        │
        ▼
   House Book  ── single sink, tagged by source
        │
     crank()  ── anyone; cranker takes 0.5% tip
        │
   pro rata by floor position  ── O(1) accumulator, no loop
        │
    deliver() ── swap ETH → each Boss's elected stock token(s)
        │
        ▼
   Boss TBA   ── paid in real stock
```

Fees are collected in ETH and pooled in the House Book. A crank distributes the
pot by floor-position weight. Delivery converts each Boss's ETH share into the
stock tokens it **elected** (default: paid in ETH) and sends them to the Boss's
ERC-6551 account. Every Boss on the payroll gets paid in the stock it chose.

> Rewards are promotional, not dividends. See [legal.md](./legal.md).
