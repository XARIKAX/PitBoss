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

    /// @notice Entropy backend selection per chain.
    enum EntropyKind {
        Miner, // Robinhood Chain: miner/print-based DERP-style conductor
        ChainlinkVRF // Base: VRF v2.5
    }

    function entropyKind(uint256 chainId) internal pure returns (EntropyKind) {
        if (chainId == ROBINHOOD_CHAIN_ID) return EntropyKind.Miner;
        return EntropyKind.ChainlinkVRF;
    }

    function isPrimary(uint256 chainId) internal pure returns (bool) {
        return chainId == ROBINHOOD_CHAIN_ID;
    }
}
