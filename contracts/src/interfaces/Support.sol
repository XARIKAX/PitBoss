// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPitBoss
/// @notice Minimal view surface of the PitBoss ERC-721 that other modules need.
interface IPitBoss {
    function ownerOf(uint256 tokenId) external view returns (address);
    function accountOf(uint256 tokenId) external view returns (address tba);
    function totalMinted() external view returns (uint256);
    function MAX_SUPPLY() external view returns (uint256);
    /// @notice Monotonically increasing transfer nonce; bumps on every true
    ///         ownership transfer (used by ActivationManager to clear activation).
    function transferEpoch(uint256 tokenId) external view returns (uint256);
}

/// @title IActivationManager
interface IActivationManager {
    function isActivated(uint256 tokenId) external view returns (bool);
    function requireActivated(uint256 tokenId) external view;
}

/// @title ISwapRouter
/// @notice Minimal router surface used by the House Book to swap the ETH pot into
///         elected tokens with a per-token slippage cap.
interface ISwapRouter {
    /// @notice Swap exactly `msg.value` ETH into `tokenOut`, requiring at least
    ///         `minOut`. Sends output to `to`. Returns amount out.
    function swapExactETHForTokens(address tokenOut, uint256 minOut, address to)
        external
        payable
        returns (uint256 amountOut);

    /// @notice Quote for `ethIn` -> `tokenOut` at current reserves (for minOut calc).
    function quoteETHForTokens(address tokenOut, uint256 ethIn) external view returns (uint256);
}

/// @title IOracle
/// @notice Price feed for stock tokens, quoted in ETH-wei per whole token, and in
///         USD (1e8) for fee-in-USD conversions. Mockable on testnet.
interface IOracle {
    /// @notice ETH-wei value of 1e18 units of `token`.
    function ethPerToken(address token) external view returns (uint256);
    /// @notice USD price of 1e18 units of `token`, scaled 1e8 (Chainlink-style).
    function usdPerToken(address token) external view returns (uint256);
    /// @notice USD price of 1 ETH, scaled 1e8.
    function usdPerEth() external view returns (uint256);
}
