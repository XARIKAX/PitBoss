// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EntropyConductorBase} from "./EntropyConductorBase.sol";

/// @title MinerEntropyConductor
/// @notice Robinhood-Chain / DERP-style conductor. The word for a commitment is
///         derived from the hash of a future block — material that does not exist
///         when the consumer commits, and that the committer cannot control. Anyone
///         can fulfill once the target block is mined and its hash is still within
///         the 256-block observable window.
/// @dev    targetBlock = committedBlock + CONFIRMATIONS. The word additionally
///         requires the commitment's `readyAt` timestamp to have passed (enforced
///         in the base). If the target block's hash has aged out (>256 blocks),
///         material is unavailable; the consuming machine treats the pull as
///         refundable after its 48h window.
contract MinerEntropyConductor is EntropyConductorBase {
    /// @notice Block confirmations after commit before the target block. [CONFIG]
    uint256 public constant CONFIRMATIONS = 2;

    function _material(bytes32, EntropyConductorBase.Commit storage c)
        internal
        view
        override
        returns (bool ready, bytes32 material)
    {
        uint256 target = c.committedBlock + CONFIRMATIONS;
        if (block.number <= target) return (false, bytes32(0));
        bytes32 bh = blockhash(target);
        if (bh == bytes32(0)) return (false, bytes32(0)); // aged out of window
        return (true, bh);
    }
}
