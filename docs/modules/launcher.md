# Launcher — Opening Bell

The launcher is how new stock listings come to the floor, and the **Opening Bell**
is where their early activity feeds value back to the Bosses through buybacks.

## Launch a listing

- A new stock token is created/registered through the **LauncherFactory**, which
  wires it into the protocol: a Certificate Counter route, and its own Degen Roll
  machine deployed by the `DegenRollFactory`.

## Opening Bell buybacks

- Around a launch, the **Opening Bell** runs buybacks that convert launch activity
  into pressure that benefits the floor. Draws that need randomness commit to the
  entropy conductor exactly like rolls do, so the `fulfill` keeper finalizes them
  and outcomes stay verifiable.
- **Participating** in an Opening Bell event with an activated Boss bumps your
  **floor position** and counts toward the season leaderboard (launcher
  participation).

## Fees

- Launcher fees route to the **House Book** (tagged `LauncherFees`), so they flow
  into the same payroll every other module feeds.

## Safety

- Entropy-dependent steps **fail closed** on a conductor stall and are covered by
  the same 3-day conductor timelock as the rest of the Pit (see
  [network.md](../network.md)).
- The launcher is permissionless plumbing; it custodies no Boss payroll — value
  reaches Bosses only through the House Book crank.

> Addresses for `LauncherFactory` and `OpeningBell` auto-populate from the
> deployments file. See [addresses.md](../addresses.md).
