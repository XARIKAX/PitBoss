# Contract Addresses

Addresses are **auto-populated** from the committed deployments file for the
active chain:

```
contracts/deployments/deployments.<chainId>.json
```

The `/docs` page and the keeper bots both read that file, so this table fills in
automatically after a deploy — the `{{PLACEHOLDER}}` tokens below are replaced
with the live address for the selected network (Robinhood Chain `4663` or Base
`8453`). Nothing here is hand-edited.

| Contract | Module | Address |
| --- | --- | --- |
| PIT | Floor — $PIT token | `{{PIT}}` |
| PitBoss | Floor — NFT collection | `{{PitBoss}}` |
| InitializingRegistry | Floor — ERC-6551 registry | `{{InitializingRegistry}}` |
| PitBossAccount | Floor — ERC-6551 TBA implementation | `{{PitBossAccount}}` |
| FlatAMMVault | Floor — primary market | `{{FlatAMMVault}}` |
| ActivationManager | Floor — activation / payroll opt-in | `{{ActivationManager}}` |
| FloorPosition | Floor — dynamic weight tiers | `{{FloorPosition}}` |
| HouseBook | House Book — single fee sink + crank | `{{HouseBook}}` |
| CertificateCounter | Pit — wrap stock into deeds | `{{CertificateCounter}}` |
| BearerCertificate | Pit — numbered bearer deeds | `{{BearerCertificate}}` |
| DegenRollFactory | Pit — roll machine factory | `{{DegenRollFactory}}` |
| LiquidityLocker | Locker — time-locked liquidity | `{{LiquidityLocker}}` |
| LoanVault | Loans — borrow against $PIT principal | `{{LoanVault}}` |
| LauncherFactory | Launcher — new-listing factory | `{{LauncherFactory}}` |
| OpeningBell | Launcher — buyback venue | `{{OpeningBell}}` |
| Entropy Conductor | Swappable entropy adapter | `{{EntropyConductor}}` |

**Degen Roll machines** are deployed one-per-stock-token by the
`DegenRollFactory`. Enumerate them on-chain via `machineCount()` / `allMachines(i)`
or look up a specific token with `machineOf(token)` — they are not listed
individually here.

> The entropy conductor address can change through a 3-day timelock in the roll
> and Opening Bell consumers. See [network.md](./network.md).
