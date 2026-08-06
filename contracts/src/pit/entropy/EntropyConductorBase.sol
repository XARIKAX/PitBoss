// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEntropyConductor} from "../../interfaces/IEntropyConductor.sol";
import {Errors} from "../../lib/Errors.sol";

/// @title EntropyConductorBase
/// @notice Shared commit-first machinery for all conductors. A consumer commits to
///         an id and a `readyAt`; the word is later finalized from source material
///         the subclass provides. Every word is verifiable: `previewWord(id)`
///         returns the same value `fulfill(id)` will store, and `wordOf(id)`
///         reproduces it after the fact.
/// @dev    Subclasses implement `_material(id)` — the entropy that does not exist
///         at commit time. Health is derived from fulfillment liveness so consumers
///         can fail closed on new ticket sales when entropy stalls.
abstract contract EntropyConductorBase is IEntropyConductor {
    struct Commit {
        bool exists;
        bool fulfilled;
        uint64 readyAt;
        uint64 committedAt;
        uint256 committedBlock;
        uint256 word;
    }

    mapping(bytes32 => Commit) internal _commits;

    /// @notice Max seconds without a fulfillment before the conductor reports
    ///         unhealthy. [CONFIG]
    uint64 public constant STALL_WINDOW = 30 minutes;
    uint64 public lastFulfillAt;

    constructor() {
        lastFulfillAt = uint64(block.timestamp);
    }

    /// @inheritdoc IEntropyConductor
    function commit(bytes32 id, uint64 readyAt) external {
        Commit storage c = _commits[id];
        if (c.exists) revert Errors.InvalidConfig();
        c.exists = true;
        c.readyAt = readyAt;
        c.committedAt = uint64(block.timestamp);
        c.committedBlock = block.number;
        emit Committed(id, msg.sender, readyAt);
    }

    /// @inheritdoc IEntropyConductor
    function fulfill(bytes32 id) external returns (uint256 word) {
        Commit storage c = _commits[id];
        if (!c.exists) revert Errors.RoundNotReady();
        if (c.fulfilled) return c.word;
        if (block.timestamp < c.readyAt) revert Errors.RoundNotReady();
        (bool ready, bytes32 material) = _material(id, c);
        if (!ready) revert Errors.RoundNotReady();
        word = _deriveWord(id, material);
        c.fulfilled = true;
        c.word = word;
        lastFulfillAt = uint64(block.timestamp);
        emit Fulfilled(id, word);
    }

    /// @inheritdoc IEntropyConductor
    function previewWord(bytes32 id) external view returns (uint256) {
        Commit storage c = _commits[id];
        if (!c.exists) revert Errors.RoundNotReady();
        if (c.fulfilled) return c.word;
        (bool ready, bytes32 material) = _material(id, c);
        if (!ready) revert Errors.RoundNotReady();
        return _deriveWord(id, material);
    }

    /// @inheritdoc IEntropyConductor
    function wordOf(bytes32 id) external view returns (uint256) {
        Commit storage c = _commits[id];
        if (!c.fulfilled) revert Errors.RoundNotReady();
        return c.word;
    }

    /// @inheritdoc IEntropyConductor
    function isFulfilled(bytes32 id) external view returns (bool) {
        return _commits[id].fulfilled;
    }

    /// @inheritdoc IEntropyConductor
    function isReady(bytes32 id) external view returns (bool) {
        Commit storage c = _commits[id];
        if (!c.exists || block.timestamp < c.readyAt) return false;
        (bool ready,) = _material(id, c);
        return ready;
    }

    /// @inheritdoc IEntropyConductor
    function healthy() public view virtual returns (bool) {
        return block.timestamp - lastFulfillAt <= STALL_WINDOW;
    }

    function _deriveWord(bytes32 id, bytes32 material) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(id, material)));
    }

    /// @dev Return (ready, material) — the not-yet-existent entropy for `id`.
    function _material(bytes32 id, Commit storage c) internal view virtual returns (bool ready, bytes32 material);
}
