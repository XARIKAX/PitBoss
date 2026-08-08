// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {FloorPosition} from "../floor/FloorPosition.sol";
import {Errors} from "../lib/Errors.sol";

/// @title SeasonEngine
/// @notice Quarterly seasons. Most season logic (leaderboard aggregation) is
///         offchain in the `season-agg` keeper; onchain, the engine tracks epoch
///         boundaries and, at season end, soft-resets floor positions (compress
///         toward the mean, streaks partially carry) in keeper-supplied batches.
///         The season-end bonus round is paid from the House Book — a config slice
///         of the season's accrual — via the normal crank/deliver path once the
///         book bar is topped up by the treasury.
/// @dev    The engine is a FloorPosition bumper (set via FloorPosition.setBumper).
///         It never custodies user funds. Batched compression keeps gas bounded.
contract SeasonEngine is Ownable {
    FloorPosition public immutable floor;

    /// @notice Season length. [CONFIG: quarterly]
    uint64 public constant SEASON_LENGTH = 90 days;
    /// @notice Fraction of position score carried across a season. [CONFIG]
    uint256 public keepBps = 5000; // compress toward mean: keep 50%
    /// @notice Season bonus, as bps of season accrual, paid from the House Book.
    uint256 public constant SEASON_BONUS_BPS = 500; // [CONFIG: 5% of season accrual]

    uint64 public seasonStart;
    uint256 public seasonIndex;

    /// @notice Keepers permitted to drive compression batches after a season roll.
    mapping(address => bool) public isKeeper;
    /// @notice Last season index a Boss was compressed for (prevents repeat halving).
    mapping(uint256 => uint256) public lastCompressedSeason;

    event SeasonRolled(uint256 indexed seasonIndex, uint64 startedAt);
    event Compressed(uint256 indexed seasonIndex, uint256 count);
    event KeepBpsSet(uint256 keepBps);
    event KeeperSet(address indexed keeper, bool allowed);

    constructor(address floor_) Ownable(msg.sender) {
        if (floor_ == address(0)) revert Errors.ZeroAddress();
        floor = FloorPosition(floor_);
        seasonStart = uint64(block.timestamp);
    }

    function setKeepBps(uint256 keepBps_) external onlyOwner {
        if (keepBps_ > 10_000) revert Errors.InvalidConfig();
        keepBps = keepBps_;
        emit KeepBpsSet(keepBps_);
    }

    function setKeeper(address keeper, bool allowed) external onlyOwner {
        isKeeper[keeper] = allowed;
        emit KeeperSet(keeper, allowed);
    }

    /// @notice Whether the current season has elapsed.
    function seasonEnded() public view returns (bool) {
        return block.timestamp >= seasonStart + SEASON_LENGTH;
    }

    /// @notice Roll into the next season. Permissionless once the season has ended.
    function rollSeason() external {
        if (!seasonEnded()) revert Errors.WindowNotElapsed();
        seasonStart = uint64(block.timestamp);
        seasonIndex++;
        emit SeasonRolled(seasonIndex, seasonStart);
    }

    /// @notice Soft-reset a batch of Bosses' floor positions (compress toward mean).
    ///         Owner/keeper only, and each Boss compresses at most once per season —
    ///         so it can never be used to repeatedly halve a rival's weight (audit
    ///         C3). Requires at least one season to have rolled.
    function compressBatch(uint256[] calldata tokenIds) external {
        if (msg.sender != owner() && !isKeeper[msg.sender]) revert Errors.NotAuthorized();
        uint256 season = seasonIndex;
        if (season == 0) revert Errors.WindowNotElapsed();
        uint256 kb = keepBps;
        uint256 done;
        for (uint256 i; i < tokenIds.length; ++i) {
            uint256 id = tokenIds[i];
            // Skip any Boss already compressed for this season (idempotent).
            if (lastCompressedSeason[id] >= season) continue;
            lastCompressedSeason[id] = season;
            floor.seasonCompress(id, kb);
            ++done;
        }
        emit Compressed(season, done);
    }
}
