// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IEntropyConductor
/// @notice Commit-first entropy source. Consumers (Degen Roll machines, Opening
///         Bell) commit to a future entropy word; the conductor lands the word
///         later. Every outcome is verifiable: `wordOf(id) == previewWord(id)`
///         once fulfilled, and the word is deterministic in the committed seed.
/// @dev    Adapter pattern: swappable implementations (miner/print-based for
///         Robinhood Chain, Chainlink VRF v2.5 for Base). Conductor migration is
///         gated by a 3-day timelock in the consumers, never here.
interface IEntropyConductor {
    /// @notice Emitted when a consumer commits to a future word.
    event Committed(bytes32 indexed id, address indexed consumer, uint64 readyAt);
    /// @notice Emitted when the entropy word for `id` is landed.
    event Fulfilled(bytes32 indexed id, uint256 word);

    /// @notice Register a commitment for `id`, redeemable no earlier than `readyAt`.
    /// @param id       Consumer-scoped unique commitment id.
    /// @param readyAt  Unix timestamp before which the word must not be revealed.
    function commit(bytes32 id, uint64 readyAt) external;

    /// @notice Land the entropy word for a previously committed `id`.
    ///         Anyone may call once the source material exists (a convenience
    ///         keeper runs this; it is permissionless).
    function fulfill(bytes32 id) external returns (uint256 word);

    /// @notice The finalized word for `id`. Reverts if not yet fulfilled.
    function wordOf(bytes32 id) external view returns (uint256);

    /// @notice True once `id` has a finalized word.
    function isFulfilled(bytes32 id) external view returns (bool);

    /// @notice True once the underlying entropy material for `id` exists and a
    ///         call to `fulfill(id)` would succeed.
    function isReady(bytes32 id) external view returns (bool);

    /// @notice Deterministic preview of the word that `fulfill(id)` will yield,
    ///         given the currently-available source material. Reverts if not ready.
    ///         Used by verify-a-roll tooling.
    function previewWord(bytes32 id) external view returns (uint256);

    /// @notice True when the conductor is healthy (words are landing). When false,
    ///         consumers fail closed on NEW ticket sales but never on settles.
    function healthy() external view returns (bool);
}
