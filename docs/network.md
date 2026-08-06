# Networks

PitBosses targets two chains. Both use **ETH for gas**.

| Network | Chain ID | Role | Entropy source |
| --- | --- | --- | --- |
| **Robinhood Chain** | `4663` | Primary | Miner / print-based (DERP-style) conductor |
| **Base** | `8453` | Fallback | Chainlink VRF v2.5 |

The protocol is identical on both chains; only the entropy backend differs. The
same contracts, the same $PIT, the same flow — deployed per chain, with addresses
in `deployments.<chainId>.json` (see [addresses.md](./addresses.md)).

## Entropy is swappable

Every roll and every Opening Bell draw commits to a future entropy word through
an **entropy conductor**. The conductor is an adapter: the miner/DERP-style
source on Robinhood Chain, Chainlink VRF v2.5 on Base. Outcomes are verifiable —
anyone can recompute the landed word and confirm it matches the preview.

The conductor is **swappable via a 3-day timelock** enforced by the consumers
(Degen Roll machines, Opening Bell) — never instantly. A migration is announced
on-chain and can only take effect after the delay, so players always have time to
settle, seal, or refund under the conductor they committed against. If a
conductor stalls, consumers **fail closed on new ticket sales only**: settles,
seals, sell-backs and refunds always keep working.

## Add the network to your wallet

**Robinhood Chain (primary)**

- Network name: `Robinhood Chain`
- Chain ID: `4663`
- Currency symbol: `ETH`
- RPC URL: your Robinhood Chain RPC endpoint
- Block explorer: the Robinhood Chain explorer

**Base (fallback)**

- Network name: `Base`
- Chain ID: `8453`
- Currency symbol: `ETH`
- RPC URL: `https://mainnet.base.org`
- Block explorer: `https://basescan.org`

In MetaMask: **Settings → Networks → Add a network → Add manually**, then enter
the fields above. Confirm the chain ID matches before sending funds.
