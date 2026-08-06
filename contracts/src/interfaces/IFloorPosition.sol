// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IFloorPosition
/// @notice Dynamic-tier payout weighting for activated Bosses. Each Boss has a
///         `position` score that rises with activity (streaks, bankroll staked,
///         launcher participation) and decays when idle. Payout weight is a
///         bounded function of position so whales cannot run away with the pot.
/// @dev    Implemented as a checkpointed accumulator; gas-bounded, no unbounded
///         loops. Read by the House Book at crank time.
interface IFloorPosition {
    event PositionBumped(uint256 indexed tokenId, uint256 newScore, int256 delta);
    event Activated(uint256 indexed tokenId);
    event Deactivated(uint256 indexed tokenId);

    /// @notice Current bounded payout weight for a Boss (0 if not activated).
    function weightOf(uint256 tokenId) external view returns (uint256);

    /// @notice Sum of all activated Bosses' weights. Denominator for pro-rata.
    function totalWeight() external view returns (uint256);

    /// @notice Raw (unbounded-input) position score, before the weight cap.
    function scoreOf(uint256 tokenId) external view returns (uint256);

    /// @notice True if the Boss is currently on the payroll.
    function isActive(uint256 tokenId) external view returns (bool);
}
