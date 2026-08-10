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
    /// @dev    Blockhash/miner entropy derives the word from a future block's hash,
    ///         so the chain's block producer is the trust root (operator-trust on a
    ///         single-sequencer L2). It is used on Robinhood Chain because no
    ///         two-party VRF (Chainlink / Pyth Entropy) is deployed there; the
    ///         "decline-a-loss" exploit is closed at the consumer (permissionless
    ///         settle + refund-only-if-unfulfilled after 48h), and the conductor is
    ///         swappable behind IEntropyConductor for a real VRF later. Chains that
    ///         DO have a coordinator (e.g. Base) use push-model Chainlink VRF v2.5.
    enum EntropyKind {
        Miner, // self-hosted blockhash conductor (local/anvil)
        ChainlinkVRF, // chains with a VRF coordinator (e.g. Base): VRF v2.5
        VRFService // external managed IVRFService (Robinhood: BlockhashRandomnessServiceV3, later Pyth)
    }

    function entropyKind(uint256 chainId) internal pure returns (EntropyKind) {
        if (chainId == ANVIL_CHAIN_ID) return EntropyKind.Miner;
        if (chainId == ROBINHOOD_CHAIN_ID) return EntropyKind.VRFService;
        return EntropyKind.ChainlinkVRF;
    }

    /// @notice `block.number` advance rate per chain, in milliseconds. Consumed by
    ///         MinerEntropyConductor to place the target block at/after `readyAt`.
    ///         [CONFIG — VERIFY on the live chain before mainnet]
    /// @dev    On Arbitrum/Orbit chains, `block.number` returns the *L1* block
    ///         number (it syncs to L1 roughly every minute and averages ~12s per
    ///         block), NOT the ~0.25s L2 block cadence. So the rate here must be the
    ///         L1 cadence (~12s), and `blockhash(target)` indexes that L1-synced
    ///         number — giving a generous 256-block (~51 min) observable window.
    ///         Confirm Robinhood Chain's exact `block.number`/`blockhash` behavior
    ///         (docs.robinhood.com/chain/differences-from-ethereum) before relying
    ///         on it; if it exposes an L2 cadence instead, retune this value.
    function blockTimeMs(uint256 chainId) internal pure returns (uint256) {
        if (chainId == ROBINHOOD_CHAIN_ID) return 12_000; // L1-synced block.number (~12s)
        if (chainId == ANVIL_CHAIN_ID) return 1_000; // anvil default
        return 12_000; // Ethereum-L1 cadence default
    }

    function isPrimary(uint256 chainId) internal pure returns (bool) {
        return chainId == ROBINHOOD_CHAIN_ID;
    }
}
