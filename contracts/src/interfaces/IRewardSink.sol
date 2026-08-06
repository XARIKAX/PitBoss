// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IRewardSink
/// @notice Hook the FloorPosition engine calls whenever a Boss's payout weight
///         changes. The House Book implements this to settle the Boss's pending
///         ETH at its OLD weight before mirroring the NEW weight, keeping the
///         reward accumulator exact (invariant #6: crank pays exactly 100%).
interface IRewardSink {
    function syncWeight(uint256 tokenId, uint256 newWeight) external;
}
