// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ILauncher
/// @notice Surface the Opening Bell calls back into when a bell is rung.
interface ILauncher {
    /// @notice Market-buy the launch's token into its curve using `msg.value` ETH.
    function buybackInto(uint256 launchId) external payable;
    /// @notice Proxy market cap (ETH-denominated) used for per-unit-cap weighting.
    function marketCapOf(uint256 launchId) external view returns (uint256);
    /// @notice Whether a launch is live (tradeable, not yet graduated).
    function isLive(uint256 launchId) external view returns (bool);
}

/// @title IPoolDeployer
/// @notice Adapter that, on graduation, creates the V3 pool + initial LP and returns
///         the position id to be auto-locked. Production wires a Uniswap V3 adapter;
///         a mock stands in for local/testnet.
interface IPoolDeployer {
    /// @notice Create the pool + LP from `tokenAmount` of the launch token and the
    ///         accompanying pair asset value, returning the position manager and id.
    function deployPoolAndMint(address launchToken, address pairAsset, uint256 tokenAmount)
        external
        payable
        returns (address positionManager, uint256 positionId);
}
