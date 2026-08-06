// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IFloorPosition} from "../interfaces/IFloorPosition.sol";
import {IRewardSink} from "../interfaces/IRewardSink.sol";
import {Errors} from "../lib/Errors.sol";

/// @title FloorPosition
/// @notice Dynamic-tier payout weighting. Replaces static tiers: each activated
///         Boss earns a `position` score that rises with activity and decays when
///         idle, and a bounded payout weight derived from it. The front-row cap
///         means a maxed-out Boss earns at most FRONT_ROW_CAP× the base weight, so
///         whales cannot run away with the pot.
/// @dev    Gas-bounded: no loops over all Bosses. `totalWeight` is maintained
///         incrementally as an accumulator; each Boss's weight is recomputed lazily
///         with epoch decay applied at read/write time. Authorized "bumpers" are
///         the money modules that observe activity (ActivationManager, DegenRoll
///         bankroll, LauncherFactory, Season engine).
contract FloorPosition is IFloorPosition, Ownable {
    // -------- tunables [CONFIG] --------
    /// @notice Seconds per scoring epoch.
    uint64 public constant EPOCH = 1 days;
    /// @notice Base weight every activated Boss starts with (score 0).
    uint256 public constant BASE_WEIGHT = 1e18;
    /// @notice Front-row cap: max weight is FRONT_ROW_CAP × BASE_WEIGHT. [CONFIG: 3.33×]
    uint256 public constant FRONT_ROW_CAP_BPS = 33_300; // 3.33x in bps
    /// @notice Score at which weight saturates the cap.
    uint256 public constant SCORE_FOR_CAP = 10_000;
    /// @notice Score lost per fully-idle epoch.
    uint256 public constant DECAY_PER_EPOCH = 100;

    struct Boss {
        bool active;
        uint64 lastTouch; // timestamp of last score update
        uint256 score; // decayed, capped-input score
        uint256 weight; // cached bounded weight, included in totalWeight
    }

    mapping(uint256 => Boss) private _boss;
    uint256 private _totalWeight;

    mapping(address => bool) public isBumper;

    /// @notice The House Book, notified whenever a Boss's weight changes so its
    ///         reward accumulator can settle at the old weight first.
    IRewardSink public rewardSink;

    event BumperSet(address indexed bumper, bool allowed);
    event RewardSinkSet(address indexed sink);

    modifier onlyBumper() {
        if (!isBumper[msg.sender]) revert Errors.NotAuthorized();
        _;
    }

    constructor() Ownable(msg.sender) {}

    function setBumper(address bumper, bool allowed) external onlyOwner {
        isBumper[bumper] = allowed;
        emit BumperSet(bumper, allowed);
    }

    function setRewardSink(address sink) external onlyOwner {
        rewardSink = IRewardSink(sink);
        emit RewardSinkSet(sink);
    }

    // -------- activation lifecycle --------

    /// @notice Put a Boss on the payroll. Idempotent.
    function activate(uint256 tokenId) external onlyBumper {
        Boss storage b = _boss[tokenId];
        if (b.active) return;
        b.active = true;
        b.lastTouch = uint64(block.timestamp);
        _reweight(tokenId, b);
        emit Activated(tokenId);
    }

    /// @notice Remove a Boss from the payroll (on true ownership transfer). Its
    ///         weight leaves `totalWeight`; score is preserved but frozen.
    function deactivate(uint256 tokenId) external onlyBumper {
        Boss storage b = _boss[tokenId];
        if (!b.active) return;
        _applyDecay(b);
        b.active = false;
        _totalWeight -= b.weight;
        b.weight = 0;
        _notify(tokenId, 0);
        emit Deactivated(tokenId);
    }

    /// @notice Add positive score for observed activity (streak, bankroll, launcher).
    function bump(uint256 tokenId, uint256 points) external onlyBumper {
        Boss storage b = _boss[tokenId];
        _applyDecay(b);
        b.score += points;
        if (b.score > SCORE_FOR_CAP) b.score = SCORE_FOR_CAP;
        _reweight(tokenId, b);
        emit PositionBumped(tokenId, b.score, int256(points));
    }

    /// @notice Season soft-reset: compress a Boss's score toward the mean.
    ///         `keepBps` of the score carries; the rest is shed. Callable by the
    ///         season bumper only.
    function seasonCompress(uint256 tokenId, uint256 keepBps) external onlyBumper {
        Boss storage b = _boss[tokenId];
        _applyDecay(b);
        b.score = (b.score * keepBps) / 10_000;
        _reweight(tokenId, b);
        emit PositionBumped(tokenId, b.score, -1);
    }

    // -------- views --------

    /// @notice Checkpointed weight included in `totalWeight`. The crank credits
    ///         pro rata over this so that Σ weightOf(active) == totalWeight exactly
    ///         (invariant #6). Decay is realized on the Boss's next interaction.
    function weightOf(uint256 tokenId) external view returns (uint256) {
        Boss memory b = _boss[tokenId];
        return b.active ? b.weight : 0;
    }

    /// @notice Live weight a Boss would have if touched now (decay applied). For
    ///         UI display; not used in payout math.
    function projectedWeightOf(uint256 tokenId) external view returns (uint256) {
        Boss memory b = _boss[tokenId];
        if (!b.active) return 0;
        return _weightFromScore(_decayedScore(b));
    }

    function totalWeight() external view returns (uint256) {
        return _totalWeight;
    }

    function scoreOf(uint256 tokenId) external view returns (uint256) {
        return _decayedScore(_boss[tokenId]);
    }

    function isActive(uint256 tokenId) external view returns (bool) {
        return _boss[tokenId].active;
    }

    // -------- internal --------

    function _applyDecay(Boss storage b) internal {
        uint256 s = _decayedScore(b);
        b.score = s;
        b.lastTouch = uint64(block.timestamp);
    }

    function _decayedScore(Boss memory b) internal view returns (uint256) {
        if (b.lastTouch == 0) return b.score;
        uint256 epochs = (block.timestamp - b.lastTouch) / EPOCH;
        uint256 loss = epochs * DECAY_PER_EPOCH;
        return loss >= b.score ? 0 : b.score - loss;
    }

    function _reweight(uint256 tokenId, Boss storage b) internal {
        if (!b.active) return;
        uint256 nw = _weightFromScore(b.score);
        _totalWeight = _totalWeight - b.weight + nw;
        b.weight = nw;
        _notify(tokenId, nw);
    }

    /// @dev Notify the House Book of a Boss's new weight so it can settle rewards.
    function _notify(uint256 tokenId, uint256 newWeight) internal {
        IRewardSink sink = rewardSink;
        if (address(sink) != address(0)) sink.syncWeight(tokenId, newWeight);
    }

    /// @dev Linear interpolation from BASE_WEIGHT up to the front-row cap.
    function _weightFromScore(uint256 score) internal pure returns (uint256) {
        if (score >= SCORE_FOR_CAP) {
            return (BASE_WEIGHT * FRONT_ROW_CAP_BPS) / 10_000;
        }
        uint256 span = (BASE_WEIGHT * (FRONT_ROW_CAP_BPS - 10_000)) / 10_000;
        return BASE_WEIGHT + (span * score) / SCORE_FOR_CAP;
    }
}
