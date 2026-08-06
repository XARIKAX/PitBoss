// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEntropyConductor} from "../interfaces/IEntropyConductor.sol";
import {Errors} from "../lib/Errors.sol";

/// @title MockEntropyConductor
/// @notice Deterministic, test-controllable entropy for unit/invariant tests and
///         local anvil. Tests can preset the word an id will fulfill to, and can
///         toggle health to exercise the fail-closed path (FloorUnhealthy).
contract MockEntropyConductor is IEntropyConductor {
    struct C {
        bool exists;
        bool fulfilled;
        uint64 readyAt;
        uint256 word;
        bool wordPreset;
    }

    mapping(bytes32 => C) private _c;
    bool public healthyFlag = true;

    function setHealthy(bool v) external {
        healthyFlag = v;
    }

    /// @notice Preset the word a given id will resolve to (before or after commit).
    function presetWord(bytes32 id, uint256 word) external {
        _c[id].word = word;
        _c[id].wordPreset = true;
    }

    function commit(bytes32 id, uint64 readyAt) external {
        C storage c = _c[id];
        if (c.exists) revert Errors.InvalidConfig();
        c.exists = true;
        c.readyAt = readyAt;
        emit Committed(id, msg.sender, readyAt);
    }

    function fulfill(bytes32 id) external returns (uint256) {
        C storage c = _c[id];
        if (!c.exists || block.timestamp < c.readyAt) revert Errors.RoundNotReady();
        if (!c.fulfilled) {
            if (!c.wordPreset) c.word = uint256(keccak256(abi.encode(id, blockhash(block.number - 1))));
            c.fulfilled = true;
            emit Fulfilled(id, c.word);
        }
        return c.word;
    }

    function _computed(bytes32 id, C storage c) internal view returns (uint256) {
        return c.wordPreset ? c.word : uint256(keccak256(abi.encode(id, blockhash(block.number - 1))));
    }

    function wordOf(bytes32 id) external view returns (uint256) {
        C storage c = _c[id];
        if (!c.fulfilled) revert Errors.RoundNotReady();
        return c.word;
    }

    function isFulfilled(bytes32 id) external view returns (bool) {
        return _c[id].fulfilled;
    }

    function isReady(bytes32 id) external view returns (bool) {
        C storage c = _c[id];
        return c.exists && block.timestamp >= c.readyAt;
    }

    function previewWord(bytes32 id) external view returns (uint256) {
        C storage c = _c[id];
        if (!c.exists || block.timestamp < c.readyAt) revert Errors.RoundNotReady();
        return _computed(id, c);
    }

    function healthy() external view returns (bool) {
        return healthyFlag;
    }
}
