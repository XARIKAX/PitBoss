// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IEntropyConductor} from "../../interfaces/IEntropyConductor.sol";
import {IVRFService, IVRFConsumer} from "../../interfaces/IVRFService.sol";
import {Errors} from "../../lib/Errors.sol";

/// @title VRFServiceConductor
/// @notice Adapts Robinhood Chain's managed randomness service (`IVRFService` —
///         `BlockhashRandomnessServiceV3` today, `PythEntropyService` later) to the
///         protocol's `IEntropyConductor`, so the Degen Roll, Roulette, and Opening
///         Bell consume it unchanged. Swapping the underlying service (blockhash →
///         Pyth/VRF) requires NO change here or in the games.
///
/// @dev    PAIRING: the service registers a single consumer for life
///         (`setSpinEngine`), so this conductor must be that consumer — only it may
///         call `requestRandomWord`. One conductor fronts every machine/wheel/bell;
///         it namespaces commitments by (consumer, id) internally (audit C2).
///
///         FEE FLOAT: each `commit` pre-pays the flat native VRF fee from this
///         contract's balance. Keep it funded — `healthy()` returns false (so
///         consumers fail closed on NEW ticket sales, never on settles) when the
///         balance can't cover the next fee. Fund by sending ETH; owner can
///         withdraw the residual.
///
///         TRUTH vs HINT: `onRandomWord` is the service's best-effort callback —
///         guarded and non-reverting so it can never wedge delivery — and is only a
///         hint. `wordOf(requestId)` is the source of truth, pulled at `fulfill`.
///         The service re-arms stale requests itself, so a word always eventually
///         lands; if the consumer's settle never happens the round still refunds
///         after its own 48h window (fail-closed).
contract VRFServiceConductor is IEntropyConductor, IVRFConsumer, Ownable {
    IVRFService public immutable vrfService;

    struct Commitment {
        bool exists;
        bool fulfilled;
        uint64 readyAt;
        uint256 requestId;
        uint256 word;
    }

    /// @dev key(consumer, id) => commitment.
    mapping(bytes32 => Commitment) internal _commits;
    /// @dev requestId => key, for the callback hint.
    mapping(uint256 => bytes32) internal _keyOfRequest;

    uint64 public lastFulfillAt;

    event Funded(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    constructor(address vrfService_, address owner_) Ownable(owner_) {
        if (vrfService_ == address(0)) revert Errors.ZeroAddress();
        vrfService = IVRFService(vrfService_);
        lastFulfillAt = uint64(block.timestamp);
    }

    function _key(address consumer, bytes32 id) internal pure returns (bytes32) {
        return keccak256(abi.encode(consumer, id));
    }

    // ==================== IEntropyConductor ====================

    /// @inheritdoc IEntropyConductor
    function commit(bytes32 id, uint64 readyAt) external {
        bytes32 k = _key(msg.sender, id);
        Commitment storage c = _commits[k];
        if (c.exists) revert Errors.InvalidConfig();

        uint256 fee = vrfService.vrfFeeNative();
        if (address(this).balance < fee) revert Errors.FloorUnhealthy(); // fail closed on new sales
        uint256 requestId = vrfService.requestRandomWord{value: fee}();

        c.exists = true;
        c.readyAt = readyAt;
        c.requestId = requestId;
        _keyOfRequest[requestId] = k;
        emit Committed(id, msg.sender, readyAt);
    }

    /// @inheritdoc IEntropyConductor
    function fulfill(bytes32 id) external returns (uint256 word) {
        Commitment storage c = _commits[_key(msg.sender, id)];
        if (!c.exists) revert Errors.RoundNotReady();
        if (c.fulfilled) return c.word;
        if (block.timestamp < c.readyAt) revert Errors.RoundNotReady();

        (bool available, uint256 w) = vrfService.wordOf(c.requestId);
        if (!available) revert Errors.RoundNotReady();

        word = w;
        c.fulfilled = true;
        c.word = w;
        lastFulfillAt = uint64(block.timestamp);
        emit Fulfilled(id, w);
    }

    /// @inheritdoc IEntropyConductor
    function wordOf(bytes32 id) external view returns (uint256) {
        Commitment storage c = _commits[_key(msg.sender, id)];
        if (!c.fulfilled) revert Errors.RoundNotReady();
        return c.word;
    }

    /// @inheritdoc IEntropyConductor
    function isFulfilled(bytes32 id) external view returns (bool) {
        return _commits[_key(msg.sender, id)].fulfilled;
    }

    /// @inheritdoc IEntropyConductor
    function isReady(bytes32 id) external view returns (bool) {
        Commitment storage c = _commits[_key(msg.sender, id)];
        if (!c.exists || block.timestamp < c.readyAt) return false;
        (bool available,) = vrfService.wordOf(c.requestId);
        return available;
    }

    /// @inheritdoc IEntropyConductor
    function previewWord(bytes32 id) external view returns (uint256) {
        Commitment storage c = _commits[_key(msg.sender, id)];
        if (!c.exists) revert Errors.RoundNotReady();
        if (c.fulfilled) return c.word;
        if (block.timestamp < c.readyAt) revert Errors.RoundNotReady();
        (bool available, uint256 w) = vrfService.wordOf(c.requestId);
        if (!available) revert Errors.RoundNotReady();
        return w;
    }

    /// @inheritdoc IEntropyConductor
    function healthy() external view returns (bool) {
        return address(this).balance >= vrfService.vrfFeeNative();
    }

    // ==================== service callback (hint) ====================

    /// @inheritdoc IVRFConsumer
    /// @dev Best-effort hint only — the word is pulled from `wordOf` at fulfill, so
    ///      this is a no-op. Guarded and non-reverting so it can never wedge the
    ///      service's delivery tx.
    function onRandomWord(uint256) external view {
        if (msg.sender != address(vrfService)) return;
        // no-op: wordOf(requestId) is the source of truth.
    }

    // ==================== keeper helper ====================

    /// @notice The service requestId behind a consumer's commitment — lets a keeper
    ///         poke the service's `deliver(requestId)` if delivery is lagging.
    function requestIdOf(address consumer, bytes32 id) external view returns (uint256) {
        return _commits[_key(consumer, id)].requestId;
    }

    // ==================== fee float ====================

    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }

    function withdraw(address to, uint256 amount) external onlyOwner {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert Errors.InsufficientPayment();
        emit Withdrawn(to, amount);
    }
}
