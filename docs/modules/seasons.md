# Seasons

Seasons are **quarterly** leaderboards. Every UTC quarter (`YYYY-Q1`…`Q4`) is a
fresh epoch: activity is scored from on-chain events and ranked, then the board
resets at the next quarter boundary.

## What's scored

| Signal | Source |
| --- | --- |
| Activations | `ActivationManager.Activated` |
| Rolls (count + ETH volume) | Degen Roll `Bought` |
| Bankroll stakes | Degen Roll `Staked` |
| Launcher participation | Opening Bell `Participated` |

The keeper's `season-agg` bot aggregates these into a per-address score:

```
score = activations            × 100
      + rolls                  × 5
      + rollVolumeEth          × 1000
      + bankrollStakes         × 2
      + launcherParticipations × 50
```

(Weights are the keeper defaults and are configurable; see the keeper README.)

## How it works

- The leaderboard is **derived entirely from chain** — no off-chain state to
  drift. It is rebuilt each run for the current quarter and published as
  `leaderboard.json` for the site to render.
- Only events whose block timestamp falls **within the current UTC quarter** count
  toward the current season.
- The same signals that build your season score also feed your **floor position**,
  so playing the season and earning payroll pull in the same direction.

## Safety

- Scoring reads public events only; there is nothing to claim or approve to
  appear on the board.
- Because the board is recomputed from chain, it can be independently reproduced
  by anyone running the aggregator.

> See the keeper bots' `season-agg` for the exact aggregation.
