// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEntropyConductor} from "../../interfaces/IEntropyConductor.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Errors} from "../../lib/Errors.sol";

/// @title VRFEntropyConductor
/// @notice Base-chain conductor backed by Chainlink VRF v2.5. Same commit-first
///         interface as the miner conductor, but the word is supplied by the VRF
///         coordinator callback rather than a future block hash.
/// @dev    This is the integration skeleton: `commit` records the request and, in
///         a full deployment, calls `VRFCoordinatorV2_5.requestRandomWords`; the
///         coordinator later invokes `rawFulfillRandomWords`, which we normalize
///         into `fulfill`. To keep the repo dependency-light and audit-scopable,
///         the coordinator address is injected and the request/callback plumbing
///         is isolated to the two marked functions — wire the real VRF client
///         there before mainnet on Base. `previewWord` is unavailable pre-callback
///         (VRF words cannot be previewed), which is expected for a VRF source.
contract VRFEntropyConductor is IEntropyConductor, Ownable {
    struct Req {
        bool exists;
        bool fulfilled;
        uint64 readyAt;
        uint256 word;
    }

    mapping(bytes32 => Req) private _req;
    /// @notice maps VRF requestId -> our commitment id (set when request is made).
    mapping(uint256 => bytes32) public requestToId;
    address public vrfCoordinator;
    uint64 public lastFulfillAt;
    uint64 public constant STALL_WINDOW = 30 minutes;

    event VRFRequested(bytes32 indexed id, uint256 indexed requestId);

    constructor(address coordinator) Ownable(msg.sender) {
        vrfCoordinator = coordinator;
        lastFulfillAt = uint64(block.timestamp);
    }

    function setCoordinator(address coordinator) external onlyOwner {
        vrfCoordinator = coordinator;
    }

    function commit(bytes32 id, uint64 readyAt) external {
        Req storage r = _req[id];
        if (r.exists) revert Errors.InvalidConfig();
        r.exists = true;
        r.readyAt = readyAt;
        emit Committed(id, msg.sender, readyAt);
        // FULL DEPLOYMENT: requestId = IVRFCoordinatorV2Plus(vrfCoordinator)
        //     .requestRandomWords(...); requestToId[requestId] = id;
        //     emit VRFRequested(id, requestId);
    }

    /// @notice VRF coordinator callback entry point. In production this is the
    ///         `rawFulfillRandomWords(requestId, randomWords)` override.
    function fulfillFromVRF(uint256 requestId, uint256 randomWord) external {
        if (msg.sender != vrfCoordinator) revert Errors.NotAuthorized();
        bytes32 id = requestToId[requestId];
        _land(id, randomWord);
    }

    /// @notice No-op in VRF mode: the word arrives via the coordinator callback.
    ///         Returns the word if already landed. Kept for interface parity.
    function fulfill(bytes32 id) external view returns (uint256) {
        Req storage r = _req[id];
        if (!r.fulfilled) revert Errors.RoundNotReady();
        return r.word;
    }

    function _land(bytes32 id, uint256 word) internal {
        Req storage r = _req[id];
        if (!r.exists || r.fulfilled) revert Errors.RoundNotReady();
        r.fulfilled = true;
        r.word = word;
        lastFulfillAt = uint64(block.timestamp);
        emit Fulfilled(id, word);
    }

    function wordOf(bytes32 id) external view returns (uint256) {
        Req storage r = _req[id];
        if (!r.fulfilled) revert Errors.RoundNotReady();
        return r.word;
    }

    function isFulfilled(bytes32 id) external view returns (bool) {
        return _req[id].fulfilled;
    }

    function isReady(bytes32 id) external view returns (bool) {
        return _req[id].fulfilled; // ready == word already delivered by VRF
    }

    function previewWord(bytes32 id) external view returns (uint256) {
        Req storage r = _req[id];
        if (!r.fulfilled) revert Errors.RoundNotReady();
        return r.word;
    }

    function healthy() external view returns (bool) {
        return block.timestamp - lastFulfillAt <= STALL_WINDOW;
    }
}
