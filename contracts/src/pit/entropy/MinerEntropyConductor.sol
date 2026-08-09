// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EntropyConductorBase} from "./EntropyConductorBase.sol";
import {Errors} from "../../lib/Errors.sol";

/// @title MinerEntropyConductor
/// @notice Blockhash commit-reveal conductor. The word for a commitment is derived
///         from the hash of a FUTURE block — material that does not exist when the
///         consumer commits and that the committer cannot control. Anyone can
///         fulfill once that block is mined and its hash is still inside the
///         256-block observable window.
///
/// @dev    TRUST MODEL: the seed is the target block's hash, so the party that
///         produces that block (the chain's sequencer) is the trust root. On a
///         single-sequencer L2 like Robinhood Chain this is an operator-trust
///         model — strictly weaker than a two-party VRF (Chainlink / Pyth
///         Entropy), which are not deployed on Robinhood Chain. It is swappable:
///         the conductor sits behind `IEntropyConductor` and is migrated in the
///         consumers behind a timelock, so a real VRF can replace it later with no
///         change to the games. Accepted for launch; see docs/PIT.md.
///
///         FAST-L2 CORRECTNESS: `blockhash` only sees the last 256 blocks (~64s at
///         0.25s blocks), but the consumer's Vault lane delays settlement up to 10
///         minutes. A naive `target = commit + k` would age out long before
///         `readyAt`, making the pull permanently unfulfillable. Instead the target
///         block is chosen to land AT/AFTER `readyAt`:
///             targetBlock = committedBlock + (delay / blockTime) + MIN_CONFIRMATIONS
///         so its hash is still fresh when the keeper fulfills right after
///         `readyAt`. `blockTimeMs` is set to the FASTEST plausible block time so
///         the target lands at or slightly after `readyAt` (never before), keeping
///         a full 256-block margin for the keeper. If the keeper still misses the
///         window the hash reads zero and the consumer refunds the stake after its
///         48h window — fail-closed, never a wrong payout.
contract MinerEntropyConductor is EntropyConductorBase {
    /// @notice Assumed lower bound on block time, in milliseconds. Set per chain to
    ///         the fastest plausible block time. [CONFIG]
    uint256 public immutable blockTimeMs;

    /// @notice Minimum confirmations so the target is always a strictly-future
    ///         block whose hash cannot be known at commit time.
    uint256 public constant MIN_CONFIRMATIONS = 2;

    constructor(uint256 blockTimeMs_) {
        if (blockTimeMs_ == 0) revert Errors.InvalidConfig();
        blockTimeMs = blockTimeMs_;
    }

    /// @notice The future block whose hash seeds this commitment. Chosen to land
    ///         at/after `readyAt` so the hash is fresh when fulfilled.
    function _targetBlock(EntropyConductorBase.Commit storage c) internal view returns (uint256) {
        uint256 delaySecs = c.readyAt > c.committedAt ? c.readyAt - c.committedAt : 0;
        uint256 delayBlocks = (delaySecs * 1000) / blockTimeMs;
        return c.committedBlock + delayBlocks + MIN_CONFIRMATIONS;
    }

    /// @notice Keeper helper: the target block for a consumer's commitment, so an
    ///         off-chain keeper knows exactly when to fulfill (and by when, before
    ///         the 256-block window closes).
    function targetBlockFor(address consumer, bytes32 id) external view returns (uint256) {
        EntropyConductorBase.Commit storage c = _commits[_key(consumer, id)];
        if (!c.exists) revert Errors.RoundNotReady();
        return _targetBlock(c);
    }

    function _material(bytes32, EntropyConductorBase.Commit storage c)
        internal
        view
        override
        returns (bool ready, bytes32 material)
    {
        uint256 target = _targetBlock(c);
        if (block.number <= target) return (false, bytes32(0));
        bytes32 bh = blockhash(target);
        if (bh == bytes32(0)) return (false, bytes32(0)); // aged out of the 256-block window
        return (true, bh);
    }
}
