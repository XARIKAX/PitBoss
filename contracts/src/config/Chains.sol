// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Chains
/// @notice Single source of truth for chain-specific deployment constants.
///         Every chain-dependent value the protocol needs lives here so that
///         deploy scripts and off-chain tooling read one place. Values marked
///         [CONFIG] in the project brief are surfaced as constants and flagged
///         in docs/CONFIG.md.
/// @dev    Solidity mirror of apps/web/config/chains.ts. Keep the two in sync.
library Chains {
    // -------- Chain IDs --------
    uint256 internal constant ROBINHOOD_CHAIN_ID = 4663; // primary target, ETH gas
    uint256 internal constant BASE_CHAIN_ID = 8453; // fallback

    // -------- Dev chains --------
    uint256 internal constant ANVIL_CHAIN_ID = 31337;

    /// @notice Entropy backend selection per chain.
    /// @dev    Blockhash/miner entropy is producer-manipulable and has a 256-block
    ///         aging window (audit H1/H2), so it is confined to local dev (anvil).
    ///         All real-value chains use push-model Chainlink VRF v2.5, which closes
    ///         the "decline-a-loss" refund exploit (C1) because fulfillment is
    ///         coordinator-driven and cannot be withheld by a player.
    enum EntropyKind {
        Miner, // local dev only (anvil): future-block-hash conductor
        ChainlinkVRF // all real-value chains: VRF v2.5 (requires a coordinator)
    }

    function entropyKind(uint256 chainId) internal pure returns (EntropyKind) {
        if (chainId == ANVIL_CHAIN_ID) return EntropyKind.Miner;
        return EntropyKind.ChainlinkVRF;
    }

    function isPrimary(uint256 chainId) internal pure returns (bool) {
        return chainId == ROBINHOOD_CHAIN_ID;
    }
}
