// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IEntropyConductor} from "../interfaces/IEntropyConductor.sol";
import {ILauncher} from "./interfaces.sol";
import {Errors} from "../lib/Errors.sol";

/// @title OpeningBell
/// @notice Public buyback bar. A 30% slice of every launcher curve fee charges the
///         bar. When it fills, an entropy draw picks a target token; anyone rings
///         the bell to market-buy the drawn token into its curve with the whole bar
///         in one sweep. Selection weight = feeContribution / marketCap (per-unit-
///         cap weighting so small caps get real odds), with each live token floored
///         at a minimum weight. The ringer earns a 0.5% tip.
/// @dev    Only the launcher may charge the bar. The live-token set is bounded by a
///         cap so the weighted draw and reset loops are gas-bounded. Audit-scoped.
contract OpeningBell is ReentrancyGuard, Ownable {
    IEntropyConductor public conductor;
    ILauncher public launcher;

    // -------- config [CONFIG] --------
    uint256 public barThreshold = 0.25 ether; // fill level that makes the bell live
    uint16 public constant RINGER_TIP_BPS = 50; // 0.5%
    uint16 public constant MIN_WEIGHT_BPS = 100; // 1% floor per live token
    uint256 public constant MAX_LIVE = 128; // bound on tracked live launches
    uint64 public constant MIN_REVEAL_DELAY = 1 minutes; // commit->reveal floor
    uint64 public constant MAX_REVEAL_DELAY = 1 hours; // commit->reveal ceiling
    uint64 public constant DRAW_RESET_TIMEOUT = 6 hours; // stalled draw -> resettable

    uint256 public bar;
    uint256 public roundNonce;
    bytes32 public activeDrawId;
    bool public drawCommitted;
    uint64 public drawReadyAt;

    uint256[] public liveLaunches;
    mapping(uint256 => bool) public isTracked;
    mapping(uint256 => uint256) public feeContribution;

    // Selection distribution frozen at commit time (audit H5: not re-read at ring,
    // so the outcome can't be steered after the word is known).
    uint256[] private _drawLaunches;
    uint256[] private _drawWeights;
    uint256 private _drawTotal;

    event BarCharged(uint256 indexed launchId, uint256 amount, uint256 bar);
    event DrawCommitted(bytes32 indexed drawId, uint64 readyAt);
    event DrawReset(bytes32 indexed drawId);
    event BellRung(address indexed ringer, uint256 indexed launchId, uint256 spent, uint256 tip);

    constructor(address conductor_) Ownable(msg.sender) {
        conductor = IEntropyConductor(conductor_);
    }

    function setLauncher(address launcher_) external onlyOwner {
        launcher = ILauncher(launcher_);
    }

    function setConductor(address conductor_) external onlyOwner {
        conductor = IEntropyConductor(conductor_);
    }

    function setBarThreshold(uint256 v) external onlyOwner {
        barThreshold = v;
    }

    // -------- charging --------

    /// @notice Charge the bar with a curve-fee slice for `launchId`. Launcher only.
    function chargeBar(uint256 launchId) external payable {
        if (msg.sender != address(launcher)) revert Errors.NotAuthorized();
        if (msg.value == 0) revert Errors.ZeroAmount();
        if (!isTracked[launchId]) {
            if (liveLaunches.length >= MAX_LIVE) revert Errors.InvalidConfig();
            isTracked[launchId] = true;
            liveLaunches.push(launchId);
        }
        feeContribution[launchId] += msg.value;
        bar += msg.value;
        emit BarCharged(launchId, msg.value, bar);
    }

    // -------- draw + ring --------

    /// @notice Commit the entropy draw once the bar is live. Permissionless. The
    ///         reveal delay is bounded, and the selection distribution is frozen
    ///         here so the winner cannot be steered after the word is known.
    function commitDraw(uint64 readyAt) external {
        if (bar < barThreshold) revert Errors.BarNotFull();
        if (drawCommitted) revert Errors.InvalidConfig();
        if (
            readyAt < uint64(block.timestamp) + MIN_REVEAL_DELAY
                || readyAt > uint64(block.timestamp) + MAX_REVEAL_DELAY
        ) revert Errors.InvalidConfig();

        _freezeDistribution();
        if (_drawTotal == 0) revert Errors.NoLiveTokens();

        activeDrawId = keccak256(abi.encode(address(this), roundNonce));
        drawCommitted = true;
        drawReadyAt = readyAt;
        conductor.commit(activeDrawId, readyAt);
        emit DrawCommitted(activeDrawId, readyAt);
    }

    /// @notice Reset a stalled draw (entropy never landed within the timeout) so a
    ///         fresh draw can be committed. Cannot reset a fulfilled draw — that one
    ///         must be rung. Prevents a permanent bar freeze (audit C5).
    function resetDraw() external {
        if (!drawCommitted) revert Errors.InvalidConfig();
        if (conductor.isFulfilled(activeDrawId)) revert Errors.InvalidConfig();
        if (block.timestamp <= uint256(drawReadyAt) + DRAW_RESET_TIMEOUT) revert Errors.WindowNotElapsed();
        emit DrawReset(activeDrawId);
        drawCommitted = false;
        drawReadyAt = 0;
        roundNonce++;
        delete _drawLaunches;
        delete _drawWeights;
        _drawTotal = 0;
    }

    /// @notice Ring the bell: draw the target token and sweep the whole bar into its
    ///         curve. Ringer earns the tip. Requires a committed, fulfilled draw.
    function ring() external nonReentrant returns (uint256 launchId) {
        if (bar < barThreshold) revert Errors.BarNotFull();
        if (!drawCommitted) revert Errors.RoundNotReady();
        uint256 word = conductor.fulfill(activeDrawId);

        launchId = _selectFrozen(word);
        // If the drawn launch graduated between commit and ring it's no longer a
        // valid buyback target; let the draw be reset and re-drawn.
        if (launchId == type(uint256).max || !launcher.isLive(launchId)) revert Errors.NoLiveTokens();

        uint256 pot = bar;
        uint256 tip = (pot * RINGER_TIP_BPS) / 10_000;
        uint256 spend = pot - tip;

        // Reset round state before external calls.
        bar = 0;
        drawCommitted = false;
        drawReadyAt = 0;
        roundNonce++;
        delete _drawLaunches;
        delete _drawWeights;
        _drawTotal = 0;
        _clearContributions();

        launcher.buybackInto{value: spend}(launchId);
        if (tip > 0) {
            (bool ok,) = msg.sender.call{value: tip}("");
            if (!ok) revert Errors.InsufficientPayment();
        }
        emit BellRung(msg.sender, launchId, spend, tip);
    }

    // -------- selection --------

    /// @notice Freeze the weighted distribution at commit: weight = feeContribution /
    ///         marketCap, each live token floored at MIN_WEIGHT_BPS of the total.
    function _freezeDistribution() internal {
        delete _drawLaunches;
        delete _drawWeights;
        _drawTotal = 0;

        uint256 n = liveLaunches.length;
        uint256[] memory w = new uint256[](n);
        uint256 total;
        for (uint256 i; i < n; ++i) {
            uint256 id = liveLaunches[i];
            if (!launcher.isLive(id)) continue;
            uint256 cap = launcher.marketCapOf(id);
            uint256 weight = cap == 0 ? feeContribution[id] : (feeContribution[id] * 1e18) / cap;
            w[i] = weight;
            total += weight;
        }
        if (total == 0) return;

        uint256 floorUnit = (total * MIN_WEIGHT_BPS) / 10_000;
        uint256 adjTotal;
        for (uint256 i; i < n; ++i) {
            if (launcher.isLive(liveLaunches[i]) && w[i] < floorUnit) w[i] = floorUnit;
            _drawLaunches.push(liveLaunches[i]);
            _drawWeights.push(w[i]);
            adjTotal += w[i];
        }
        _drawTotal = adjTotal;
    }

    /// @notice Select the winner from the distribution frozen at commit.
    function _selectFrozen(uint256 word) internal view returns (uint256) {
        uint256 total = _drawTotal;
        if (total == 0) return type(uint256).max;
        uint256 r = word % total;
        uint256 cum;
        for (uint256 i; i < _drawLaunches.length; ++i) {
            cum += _drawWeights[i];
            if (r < cum && _drawWeights[i] > 0) return _drawLaunches[i];
        }
        return _drawLaunches[_drawLaunches.length - 1];
    }

    function _clearContributions() internal {
        uint256 n = liveLaunches.length;
        for (uint256 i; i < n; ++i) {
            feeContribution[liveLaunches[i]] = 0;
            isTracked[liveLaunches[i]] = false;
        }
        delete liveLaunches;
    }

    function liveCount() external view returns (uint256) {
        return liveLaunches.length;
    }
}
