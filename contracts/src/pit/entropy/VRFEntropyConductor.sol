// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEntropyConductor} from "../../interfaces/IEntropyConductor.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Errors} from "../../lib/Errors.sol";

/// @notice Minimal Chainlink VRF v2.5 coordinator surface (native/LINK agnostic).
///         The exact request parameters are injected at deploy so this contract
///         carries no Chainlink dependency. `extraArgs` encodes the v2.5
///         payment mode and is supplied by the deployer.
interface IVRFCoordinatorV2Plus {
    struct RandomWordsRequest {
        bytes32 keyHash;
        uint256 subId;
        uint16 requestConfirmations;
        uint32 callbackGasLimit;
        uint32 numWords;
        bytes extraArgs;
    }

    function requestRandomWords(RandomWordsRequest calldata req) external returns (uint256 requestId);
}

/// @title VRFEntropyConductor
/// @notice Push-model entropy backed by Chainlink VRF v2.5. `commit` requests a
///         random word from the coordinator; the coordinator later calls
///         `rawFulfillRandomWords`, which lands the word. The consumer cannot
///         influence or withhold fulfillment, so — unlike a pull/blockhash source —
///         a player can never "decline a losing roll" by preventing fulfillment
///         (audit C1), and there is no block-producer manipulation (H1) and no
///         256-block aging window (H2). Commitments are namespaced by the
///         committing consumer so a third party cannot occupy a machine's id (C2).
/// @dev    Preview is unavailable pre-callback (VRF words don't exist until the
///         coordinator responds), which is expected for a VRF source. Request
///         parameters (keyHash/subId/confirmations/gas/extraArgs) are owner-set.
contract VRFEntropyConductor is IEntropyConductor, Ownable {
    struct Req {
        bool exists;
        bool fulfilled;
        uint64 readyAt;
        uint256 word;
    }

    // key = keccak256(consumer, id) -> request
    mapping(bytes32 => Req) private _req;
    // Chainlink requestId -> our namespaced key
    mapping(uint256 => bytes32) public requestToKey;

    address public vrfCoordinator;
    uint64 public lastFulfillAt;
    uint64 public constant STALL_WINDOW = 30 minutes;

    // -------- VRF request config [CONFIG, owner-set at deploy] --------
    bytes32 public keyHash;
    uint256 public subId;
    uint16 public requestConfirmations = 3;
    uint32 public callbackGasLimit = 200_000;
    bytes public extraArgs; // v2.5 payment mode (native vs LINK), deployer-encoded

    event VRFRequested(bytes32 indexed id, uint256 indexed requestId);
    event VRFConfigSet();

    constructor(address coordinator) Ownable(msg.sender) {
        vrfCoordinator = coordinator;
        lastFulfillAt = uint64(block.timestamp);
    }

    function setCoordinator(address coordinator) external onlyOwner {
        if (coordinator == address(0)) revert Errors.ZeroAddress();
        vrfCoordinator = coordinator;
    }

    function setRequestConfig(
        bytes32 keyHash_,
        uint256 subId_,
        uint16 requestConfirmations_,
        uint32 callbackGasLimit_,
        bytes calldata extraArgs_
    ) external onlyOwner {
        keyHash = keyHash_;
        subId = subId_;
        requestConfirmations = requestConfirmations_;
        callbackGasLimit = callbackGasLimit_;
        extraArgs = extraArgs_;
        emit VRFConfigSet();
    }

    function _key(address consumer, bytes32 id) internal pure returns (bytes32) {
        return keccak256(abi.encode(consumer, id));
    }

    /// @inheritdoc IEntropyConductor
    function commit(bytes32 id, uint64 readyAt) external {
        bytes32 k = _key(msg.sender, id);
        Req storage r = _req[k];
        if (r.exists) revert Errors.InvalidConfig();
        r.exists = true;
        r.readyAt = readyAt;
        emit Committed(id, msg.sender, readyAt);

        uint256 requestId = IVRFCoordinatorV2Plus(vrfCoordinator).requestRandomWords(
            IVRFCoordinatorV2Plus.RandomWordsRequest({
                keyHash: keyHash,
                subId: subId,
                requestConfirmations: requestConfirmations,
                callbackGasLimit: callbackGasLimit,
                numWords: 1,
                extraArgs: extraArgs
            })
        );
        requestToKey[requestId] = k;
        emit VRFRequested(id, requestId);
    }

    /// @notice Chainlink VRF v2.5 callback. Only the coordinator may call.
    function rawFulfillRandomWords(uint256 requestId, uint256[] memory randomWords) external {
        if (msg.sender != vrfCoordinator) revert Errors.NotAuthorized();
        if (randomWords.length == 0) revert Errors.InvalidConfig();
        bytes32 k = requestToKey[requestId];
        Req storage r = _req[k];
        if (!r.exists || r.fulfilled) return; // idempotent / unknown request: ignore
        r.fulfilled = true;
        r.word = randomWords[0];
        lastFulfillAt = uint64(block.timestamp);
        emit Fulfilled(k, randomWords[0]);
    }

    /// @notice Returns the landed word (push model: fulfillment is coordinator-driven,
    ///         so this never lands the word itself — it only reads it once present).
    function fulfill(bytes32 id) external view returns (uint256) {
        Req storage r = _req[_key(msg.sender, id)];
        if (!r.fulfilled) revert Errors.RoundNotReady();
        return r.word;
    }

    function wordOf(bytes32 id) external view returns (uint256) {
        return wordOfFor(msg.sender, id);
    }

    function wordOfFor(address consumer, bytes32 id) public view returns (uint256) {
        Req storage r = _req[_key(consumer, id)];
        if (!r.fulfilled) revert Errors.RoundNotReady();
        return r.word;
    }

    function isFulfilled(bytes32 id) external view returns (bool) {
        return _req[_key(msg.sender, id)].fulfilled;
    }

    function isReady(bytes32 id) external view returns (bool) {
        return _req[_key(msg.sender, id)].fulfilled; // ready == word delivered by VRF
    }

    function previewWord(bytes32 id) external view returns (uint256) {
        return previewWordFor(msg.sender, id);
    }

    function previewWordFor(address consumer, bytes32 id) public view returns (uint256) {
        Req storage r = _req[_key(consumer, id)];
        if (!r.fulfilled) revert Errors.RoundNotReady();
        return r.word;
    }

    function healthy() external view returns (bool) {
        return block.timestamp - lastFulfillAt <= STALL_WINDOW;
    }
}
