// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IHouseBook
/// @notice The single fee sink. Every money module pays ETH into the House Book,
///         tagged by source. When the bar fills, anyone cranks: the pot swaps
///         into elected tokens and credits every activated Boss pro rata by
///         floor-position weight.
interface IHouseBook {
    /// @dev Fee sources tracked for public accounting (Σ per-source == balance).
    enum Source {
        PitEdge,
        CertFees,
        LauncherFees,
        LockerFees,
        LoanInterest,
        AmmFees
    }

    event FeeReceived(Source indexed source, address indexed from, uint256 amount);
    event Cranked(address indexed cranker, uint256 pot, uint256 tip);

    /// @notice Pay ETH into the book, tagged by source. `msg.value` is the amount.
    function payFee(Source source) external payable;

    /// @notice Total ETH accrued and awaiting the next crank.
    function barBalance() external view returns (uint256);

    /// @notice Cumulative ETH received for a given source (never decreases).
    function accruedBySource(Source source) external view returns (uint256);
}
