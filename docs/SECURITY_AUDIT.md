# PitBosses — Pre-Deployment Security Audit

**Scope:** all 25 Solidity contracts in `contracts/src` (~3,300 lines).
**Method:** five parallel adversarial auditors, one per domain, every finding
then re-verified against source by the lead before inclusion here.
**Date:** 2026-08-08.

> **ORIGINAL VERDICT: NO-GO for real-money deployment as-is.**
> Five Critical issues, several of them deterministic (they fire on normal use,
> not just under attack), plus a set of High-severity entropy and reward-gaming
> problems. None of the Criticals are cosmetic; three lock or drain user funds.
> A staging deploy with **mock/worthless assets** is fine for demoing the UI.
> Do not put real value in until at least every Critical and High below is fixed
> **and** re-audited independently. I wrote this code, so my own pass is a floor,
> not a substitute for an external firm.

---

## Remediation status (post-fix)

All five Criticals and the High-severity entropy issues have been fixed in code
with regression tests. **The verdict is still NO-GO until an independent firm
re-audits the changes** — an author fixing their own findings is a floor, not a
sign-off. Staging with mock assets remains fine.

| # | Status | Fix |
|---|--------|-----|
| C1 | ✅ Fixed | Production entropy is now push-model VRF (Chains: real chains → `ChainlinkVRF`); the coordinator lands the word automatically, so a player can't withhold fulfillment to refund a known loss. `previewWord` gated on `readyAt`. |
| C2 | ✅ Fixed | Conductor commitments namespaced by `keccak256(consumer, id)` — a third party can't occupy a machine's id. Regression test `test_C2_CommitIsNamespacedByCaller`. |
| C3 | ✅ Fixed | `compressBatch` is owner/keeper-gated, requires a rolled season, and records `lastCompressedSeason` so each Boss compresses at most once per season. Test `test_C3_CompressBatch_Gated`. |
| C4 | ✅ Fixed | `LauncherFactory` now inherits `ERC721Holder`; graduation completes and raised ETH lands in the pool. Lock NFT held by the factory, sweepable via `sweepGraduationLock`. Test `test_C4_GraduationCompletes`. |
| C5 | ✅ Fixed | `commitDraw` bounds `readyAt` to `[now+MIN, now+MAX]`; `resetDraw` clears a stalled draw after a timeout so the bar can't be frozen. Test `test_C5_BellBoundsAndReset`. |
| H1 | ✅ Fixed | Blockhash/miner entropy confined to local dev (anvil only); real chains use VRF. |
| H2 | ✅ Fixed | Same — VRF words don't age out of a 256-block window. |
| H3 | ✅ Fixed | Bankroll mints permanent dead-shares on first stake and reverts zero-share mints, making first-depositor inflation unprofitable. Test `test_H3_DeadSharesAndZeroShareRevert`. |
| H4 | ✅ Fixed | `VRFEntropyConductor` completed to a real Chainlink VRF v2.5 push consumer (request in `commit`, `rawFulfillRandomWords` callback). Test `test_H4_VRFPushModel` via `MockVRFCoordinator`. |
| H5 | ✅ Fixed | Opening Bell selection distribution is frozen at `commitDraw`, so the winner can't be steered after the word is known. |
| M7 | ✅ Fixed | Graduation lock NFT is held by the factory (no longer stranded) and sweepable to a treasury. |

**Deferred (documented, not yet fixed):** the remaining Mediums (M1/M2 same-pool
slippage guards, M3/M4 reward-weight gaming, M5 oracle staleness, M6 AMM PIT
sink, M8 vested-fee bypass, M9 launch-config validation, M10/M11 ownership &
minter) and the Low/Info list. Several overlap the open $PIT supply-vs-price
economics decision and should be settled together before the external audit.

> **Production entropy note:** real-value deployments now require a Chainlink VRF
> v2.5 coordinator + funded subscription on the target chain, with the conductor
> added as a consumer and `setRequestConfig` called. If the target chain has no
> VRF, that is a launch blocker to resolve (deploy an alternative bonded
> randomness source) — not a reason to fall back to manipulable block hashes.

---

## Severity summary

| # | Severity | Title | Contract |
|---|----------|-------|----------|
| C1 | Critical | Losing players reclaim tickets → bankroll drains | DegenRoll + entropy |
| C2 | Critical | Unauthenticated `commit` bricks a machine's ticket sales for one tx | EntropyConductorBase |
| C3 | Critical | Ungated `compressBatch` lets anyone zero any Boss's reward weight | SeasonEngine / FloorPosition |
| C4 | Critical | Graduation always reverts → all raised launch ETH locked forever | LauncherFactory |
| C5 | Critical | Opening Bell can be permanently bricked, freezing the bar | OpeningBell |
| H1 | High | Blockhash entropy is producer/sequencer-manipulable | MinerEntropyConductor |
| H2 | High | Vault lane unfulfillable when block time × delay exceeds 256 blocks | DegenRoll + Miner conductor |
| H3 | High | Bankroll share-inflation (no min/dead shares) | DegenRoll |
| H4 | High | VRF conductor never fulfills (request plumbing commented out) | VRFEntropyConductor |
| H5 | High | Opening Bell winner is steerable / bar capturable | OpeningBell |
| M1 | Medium | `deliver`/`restock` slippage bound read from the same pool = no protection | HouseBook, DegenRoll |
| M2 | Medium | `sellBack` oracle manipulation drains `ethFloat` | DegenRoll |
| M3 | Medium | JIT weight capture: crank pays on instantaneous weight | HouseBook |
| M4 | Medium | Weight inflation via 1-wei `stakeBankroll` spam in one block | FloorPosition / DegenRoll |
| M5 | Medium | Oracle reads lack staleness/zero guards; zero price waives late fees | LoanVault, CertificateCounter |
| M6 | Medium | AMM-collected PIT is permanently sequestered (no outflow) | FlatAMMVault |
| M7 | Medium | Activation PIT parked in HouseBook is permanently locked (no ERC20 out) | ActivationManager / HouseBook |
| M8 | Medium | `withdrawVested` harvests LP fees bypassing the protocol share | LiquidityLocker |
| M9 | Medium | Launch can be un-graduatable on plausible config → ETH stranded | LauncherFactory |
| M10 | Medium | Owner is a single EOA holding every role + full PIT supply | Deploy.s.sol / all Ownable |
| M11 | Medium | Owner can appoint itself minter and free-mint all 888 | PitBoss |
| L1–L10 | Low | fee-on-transfer mis-accounting, div-by-zero edge, decorative liquidator gate, dust, streak decay bug, stranded lock ETH, etc. | various |

Clean-verified categories (checked, no issue) are listed at the end.

---

## Critical findings

### C1 — Losing players can reclaim their tickets; the bankroll is drained
**Where:** `pit/DegenRoll.sol` `refund()` (218–230) + `previewRoll`/conductor
`previewWord` (EntropyConductorBase 64–71) + `MinerEntropyConductor` blockhash aging.
**What:** A roll's outcome is fixed by `blockhash(committedBlock+2)` and is publicly
computable the instant that block exists. `settle()` is required to land the word
(`fulfill`), but `refund()` is allowed whenever `!isFulfilled` after the 48h window.
So a player reads their outcome, **settles wins and refuses to settle losses**;
if no one calls `fulfill` on that round within the 256-block blockhash window it
becomes permanently unfulfillable and `refund` returns 100% of the ticket. Since
~82% of rolls are floor losses, rational players refund every loss and settle every
win — the 90% RTP inverts into a guaranteed bankroll drain. The only thing holding
it back is an unincentivized keeper fulfilling **every** round within minutes, which
a flood of cheap rounds can overwhelm.
**Fix:** Make the outcome binding at `readyAt`, not at `fulfill`. Concretely: (a) gate
`previewWord` on `readyAt`; (b) derive the target block from `readyAt` and keep it
inside the blockhash window; (c) only allow `refund` when the entropy is genuinely
unavailable (chain stall), not merely unfulfilled — e.g. force-fulfill on refund
attempt, or require proof the target block aged out with no fulfiller possible. This
is an architectural change and the single most important fix in this document.

### C2 — Unauthenticated `commit` bricks ticket sales for one cheap tx
**Where:** `pit/entropy/EntropyConductorBase.sol:38` (`commit` has no access control);
consumed at `DegenRoll.buy` (162–174).
**What:** `commit(id, readyAt)` is callable by anyone, and `buy` uses a fully public
id `keccak256(this, nextRoundId)`. An attacker pre-commits that id; every subsequent
`buy` computes the same id, hits `if (c.exists) revert`, and reverts — rolling back
`nextRoundId`, so the next buy retries the same doomed id forever. **~50k gas
permanently disables a machine's ticket sales**, and the conductor is shared, so it
scales to the whole product line.
**Fix:** Namespace commitments by caller (`keccak256(msg.sender, id)`) or restrict
`commit` to factory-registered machines. Never let a third party occupy a consumer's id.

### C3 — Anyone can zero any Boss's reward weight (ungated `compressBatch`)
**Where:** `season/SeasonEngine.sol:63` (no modifier, no `seasonEnded` check, no
per-season guard) → `FloorPosition.seasonCompress` (bumper-gated, so it accepts the call).
**What:** `compressBatch(tokenIds)` is permissionless and halves each listed Boss's
score (`keepBps=5000`) with no limit on how often. An attacker calls it repeatedly on
a rival — or passes the same id many times in one array — driving score→0 and collapsing
that Boss's House Book payout share. Works before any season ends, any number of times.
Confirmed independently by two auditors and by source read.
**Fix:** Restrict to owner/keeper, require `seasonEnded()` and a rolled season, and
track `lastCompressedSeason[tokenId]` so each Boss compresses at most once per season.
Make `seasonCompress` idempotent per season index.

### C4 — Every launch graduation reverts; raised ETH is locked forever
**Where:** `launcher/LauncherFactory.sol` (declared `is ILauncher, ReentrancyGuard,
Ownable` — no ERC-721 receiver) → `_finalize` calls `locker.lock`, which `_safeMint`s
the lock NFT to the factory (`LiquidityLocker.sol:116`).
**What:** OZ `_safeMint` calls `onERC721Received` on the recipient; the factory doesn't
implement it, so the mint reverts with `ERC721InvalidReceiver`. `_finalize` runs inside
`buy()` the moment `raised >= graduationThreshold`, so that buy reverts and rolls back —
the launch can never cross the threshold. There is **no sell or refund path**, so all
ETH accumulated in every launch is permanently stranded. Deterministic, not
attacker-dependent, and there is **no graduation test** so CI never caught it.
**Fix:** Make `LauncherFactory` inherit OZ `ERC721Holder` (or implement
`onERC721Received`). Add an end-to-end graduation test that reaches the threshold and
asserts the pool seeds and the lock NFT lands. Then address M-level launcher issues
(the factory still can't manage the lock it holds — see L/M list).

### C5 — Opening Bell can be permanently bricked, freezing the bar
**Where:** `launcher/OpeningBell.sol:77` (`commitDraw` accepts unbounded `readyAt`, no
reset path) + `ring` (88–112).
**What:** `commitDraw(readyAt)` is permissionless and forwards `readyAt` unvalidated to
the conductor. An attacker commits with `readyAt = type(uint64).max`; `ring` then reverts
forever (`block.timestamp < readyAt`), `commitDraw` can't be called again
(`drawCommitted` latch), and `activeDrawId` only advances inside a successful `ring`.
The bar — and all future contributions to it — is frozen permanently. The same dead-end
occurs benignly if every live launch graduates between commit and ring.
**Fix:** Bound `readyAt` to `[now+MIN, now+MAX]`; add a timeout/reset that bumps the
draw nonce and clears `drawCommitted` so a fresh draw can be committed when one stalls.

---

## High findings

### H1 — Blockhash entropy is producer-manipulable
`word = keccak256(id, blockhash(committedBlock+2))`. The producer of that block chooses
its hash via inclusion/ordering (and, for a single-sequencer L2 like the target chain,
outright). The sequencer can compute whether a candidate block yields a jackpot and
publish selectively — i.e. force wins or losses. **For a money casino, blockhash is not
an acceptable settlement source.** Use a real VRF or bonded commit-reveal; if blockhash
must be used, span multiple future blocks and push confirmations past any single
proposer's reach. (Ties to H4: the VRF path is currently non-functional.)

### H2 — Vault lane unfulfillable when delay exceeds the blockhash window
`fulfill` needs `block.timestamp >= readyAt` **and** `blockhash(committedBlock+2) != 0`
(available only through block+257). With `VAULT_DELAY = 600s`, on a ~2s chain 600s ≈ 300
blocks > 257, so by the time `readyAt` passes the target hash has aged out and the round
is refund-only — the entire Vault lane can never pay a winner. **Fix:** derive the target
block from `readyAt` and guarantee it lands inside the 256-block window for the chain's
actual block time, or forbid the miner conductor where the delay exceeds the window.

### H3 — Bankroll share-inflation (no minimum/dead shares)
`DegenRoll.sol:259` mints `sharesOut = amount * totalShares / totalBankrollStock` with no
floor. Because `restock()`/`sellBack()`/prize-losses raise `totalBankrollStock` without
minting shares, a first staker of 1 wei can inflate share price (send ETH → `receive` →
`restock`) so a later staker's shares round to 0 while their stock enters the pool — the
classic ERC4626 first-depositor theft. **Fix:** ERC4626-style virtual-shares offset, or a
permanent locked dead-share on first deposit; revert any zero-share mint.

### H4 — VRF conductor never fulfills
`VRFEntropyConductor.sol` has its `requestRandomWords` plumbing commented out, so
`requestToId` is never populated and no callback lands — every round on a VRF machine is
unfulfillable → refund-only. Only bites the Base fallback (Robinhood uses the miner
conductor), but must be completed and tested before the VRF path is ever deployed. Also
shares C2's unauthenticated `commit`.

### H5 — Opening Bell winner is steerable / the communal bar is capturable
`_select(word)` reads each launch's weight from live, attacker-mutable state
(`feeContribution`, `marketCapOf`) at `ring` time, and the word is public before `ring`.
An attacker buys their own launch heavily to dominate `feeContribution`, then rings so the
**entire communal bar** (funded by other launches' fees) buys back and burns into their
launch — pumping their own bag plus the ringer tip. They can also grind: if they aren't
the winner for the known word, submit a buy to shift the bucket boundaries onto their
launch, then ring in the same tx. **Fix:** snapshot the weighted distribution at
`commitDraw` and select against that frozen snapshot; cap any single launch's share per
round; exclude a launch's own fee contribution from its selection weight.

---

## Medium findings (condensed)

- **M1 — Same-pool slippage guard (no protection).** `HouseBook.deliver` (216–218) and
  `DegenRoll.restock` (289–292) set `minOut` from `router.quoteETHForTokens` on the *same
  pool* the swap hits, so the 3% guard is cosmetic and every elected-token delivery /
  restock is sandwichable. **Fix:** derive `minOut` from the independent `IOracle` already
  wired in, or take a keeper-supplied `minOut`.
- **M2 — `sellBack` oracle drain.** `DegenRoll.sellBack` pays `ethFloat` at
  `oracle.ethPerToken` × 95%; a manipulable feed lets an attacker drain the ETH float.
  **Fix:** manipulation-resistant TWAP/Chainlink with staleness checks; rate-limit.
- **M3 — JIT weight capture.** `HouseBook.crank` pays pro-rata on *instantaneous* weight;
  activate right before a crank, take a slice, deactivate. **Fix:** time-weight rewards
  (integrate weight over the interval) or an activation→eligibility cooldown.
- **M4 — Weight inflation by spam.** `FloorPosition` decay is epoch-based, so 1000×
  `stakeBankroll(bossId, 1)` in one block adds `10×1000` score with no decay, pinning the
  3.33× cap for gas + ~1000 wei. **Fix:** scale bump to economic size; cap score gain per
  epoch per Boss inside FloorPosition.
- **M5 — Oracle staleness/zero.** `LoanVault.quoteFee` has no zero/staleness check; a zero
  `ethPerToken` stores `ethNotional=0` and permanently waives the 30% late fee.
  `CertificateCounter.feeEth` guards zero but not staleness. **Fix:** require positive,
  fresh prices; revert `borrow` on zero notional.
- **M6 — AMM PIT sink.** `FlatAMMVault` never moves PIT out; the header claim that the
  LoanVault lends against it is false (LoanVault lends its own float). ~84 primary sales
  lock the entire 42M supply in a dead contract. **Fix:** decide deliberately — add a
  treasury sweep / route proceeds, or document PIT as burned-on-sale and delete the note.
  (Interacts with the open supply-vs-price economics decision.)
- **M7 — Parked activation PIT locked.** Activation sends 250 PIT (half the fee) to
  HouseBook, which has **no ERC20 outflow** — permanently stranded. **Fix:** if it's a
  soft-burn, call `pit.burn`; if it should circulate, add a guarded distribution path that
  can never touch ETH `owed`.
- **M8 — Vested fee bypass.** `LiquidityLocker.withdrawVested` collects principal *and*
  accrued LP fees 100% to the holder, skipping `FEE_SHARE_BPS`. **Fix:** split fees on the
  vested path exactly as `collectFees` does.
- **M9 — Un-graduatable launch.** No `createLaunch` validation that graduation is reachable
  before 80% of supply sells; the 20% pool mint can then exceed `maxSupply` and revert,
  stranding raised ETH. `buybackInto` also mints against the cap. **Fix:** validate
  `graduationThreshold` against `spotPrice`/`maxSupply`; reserve the pool tokens up front;
  give `LaunchToken` a burn path that doesn't trip the cap.
- **M10 — Single-EOA ownership.** Deploy leaves every `Ownable` (single-step) role and the
  full PIT mint on the deployer EOA; `TREASURY`/`PROTOCOL_RESERVE`/`ROYALTY` default to it
  when env vars are unset. **Fix:** require those env vars on a real chain; hand ownership
  to a multisig/timelock at the end of `run()`; migrate to `Ownable2Step`.
- **M11 — Owner free-mint.** `setMinter` is owner-only and `mint` checks only the minter
  flag, so the owner can appoint itself and mint all 888 free, bypassing the AMM. **Fix:**
  lock the minter to the AMM (constructor one-shot) or move ownership off the EOA (M10).

## Low / Informational (tracked)

- **L1** fee-on-transfer stock mis-accounted in `DegenRoll` (credits nominal, not received)
  — `stakeBankroll`/`sellBack`; `CertificateCounter.buy` has the same hop bug. Mitigated by
  owner token allowlist. Measure balance deltas.
- **L2** `DegenRoll.stakeBankroll` divides by zero if bankroll stock hits 0 with shares out.
- **L3** `FlatAMMVault.onERC721Received` records inventory from *any* sender — the
  `depositLiquidated` liquidator gate is decorative; griefing only (costs the attacker a Boss).
- **L4** Streak is self-defeating: activation grants +25/epoch but FloorPosition decays
  100/epoch, so the advertised loyalty weighting never accrues. Reconcile the two epoch clocks.
- **L5** `LiquidityLocker.lock` strands ETH sent in FeeShare mode (only Upfront consumes it).
- **L6** Graduation lock NFT ends up owned by the factory with no way to collect its fees or
  move it (materializes once C4 is fixed).
- **L7** HouseBook: crank pays the tip even when total weight is 0 (value for no work); rounding
  dust accretes unclaimable in `owed`; router refunds re-tagged as `PitEdge` fees.
- **L8** `BearerCertificate.totalSupply()` counts burned certs; approved operators can't redeem.
- **L9** Global entropy `healthy()` is shared across machines — a busy machine masks another's
  stall; an attacker can self-heal health with dummy commits.
- **L10** `_splitEdge` push-payments mean a reverting `creator`/`protocolReserve` bricks settle;
  `commitDraw`/bell lack a minimum reveal delay; `_inventory` array never compacts (storage bloat).

---

## Verified CLEAN (checked, no issue found)

- **6551 TBA + registry:** atomic clone+init, CREATE2 monopoly (no front-run/hijack),
  owner-follows-NFT `execute`, one-shot init, delegatecall/create refused.
- **NFT supply:** 888 cap exact, no off-by-one, cannot be exceeded.
- **Transfer-epoch reward protection:** cannot be spoofed; a sale cannot preserve or steal
  accrued activation.
- **PIT token:** 42M minted once, no mint/owner backdoor, burn monotonic, standard permit.
- **Reserve/solvency math (DegenRoll):** reserve (50×) exactly equals max prize; no player
  wins more than reserved; invariant `totalBankrollStock >= totalReserved` holds on every path.
- **ETH escrow accounting (DegenRoll):** balance == Σ escrows + `ethFloat`, no drain path.
- **HouseBook core invariant:** `balance == bar + owed`; O(1) accumulator's settle-before-
  reweight prevents "join late, claim old rewards"; no withdraw-more-than-owed / underflow.
- **Certificate backing:** redeem is atomic burn+release, no over-redeem / unbacked cert /
  double-redeem; fee-on-transfer safe via balance-delta accounting.
- **Loan safety:** no reclaim-without-repay, no double-collateralization, permissionless
  liquidation (no lock-forever), `closed` flag blocks double-settle; the borrow-dump-default
  arbitrage was analyzed and proven unprofitable (PIT-neutral).
- **AMM inventory integrity:** swap-remove queue verified correct across interleavings; no
  double-dispense; mint minter-gated and reentrancy-guarded.
- **Reentrancy/CEI across all contracts:** guards present and ordering correct; no reentrancy
  finding in any domain. The risks here are logic, entropy, access-control, and economics —
  not reentrancy.

---

## Remediation roadmap (recommended order)

1. **Re-architect entropy (C1, H1, H2, H4).** Move to a real VRF or bonded commit-reveal;
   make outcomes binding at `readyAt`; fix the refund gate. This is the biggest and most
   important change and touches the whole Pit.
2. **Authenticate `commit` (C2).** Namespace by caller or registry-gate. Small, mandatory.
3. **Gate `compressBatch` (C3).** Owner/keeper + once-per-season. Small, mandatory.
4. **Fix graduation (C4) + Bell brick/steer (C5, H5).** Add `ERC721Holder`, bound `readyAt`,
   add reset, snapshot bell weights; add the missing graduation + bell tests.
5. **Share-inflation guard (H3)** and the **oracle/slippage cluster (M1, M2, M5).**
6. **Reward-gaming (M3, M4)** and the **PIT-flow decisions (M6, M7)** — these overlap the open
   supply-vs-price economics call; settle them together.
7. **Ownership handoff + minter lock (M10, M11)** as part of the deploy runbook.
8. Sweep the Low/Info list.
9. **External audit** of the revised code before any real value. My pass narrows the surface;
   it does not replace an independent firm for a fund-custody casino.

Until steps 1–4 are done and tested, treat every deployment as **mock-asset staging only.**
