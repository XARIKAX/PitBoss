// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title External integration interfaces
/// @notice Minimal surfaces of the third-party contracts the mainnet adapters
///         talk to: Chainlink price feeds, Uniswap V3 (SwapRouter02, factory,
///         position manager) and WETH9. Kept local so the repo has no heavy
///         external dependency; the ABIs match the canonical deployments.

interface IWETH9 {
    function deposit() external payable;
    function approve(address spender, uint256 value) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
}

/// @dev Chainlink Data Feed — the oracle Robinhood Chain uses for ETH and every
///      tokenized stock (share price × multiplier). Same interface for all feeds.
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @dev Uniswap V3 Factory — used by V3PoolDeployerAdapter to get tick spacing.
interface IUniV3Factory {
    function feeAmountTickSpacing(uint24 fee) external view returns (int24);
}

/// @dev Uniswap V3 NonfungiblePositionManager — pool creation + LP minting surface.
interface IUniV3PositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    function createAndInitializePoolIfNecessary(
        address token0,
        address token1,
        uint24 fee,
        uint160 sqrtPriceX96
    ) external payable returns (address pool);

    function mint(MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);

    function approve(address to, uint256 tokenId) external;
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
}

/// @dev Uniswap V3 SwapRouter02 multi-hop exact-input (no deadline arg). `path` is
///      the V3-encoded route `abi.encodePacked(tokenIn, fee, [mid, fee, ...] tokenOut)`
///      — needed because Robinhood stock tokens have no direct WETH pool and route
///      WETH → USDG → stock.
interface IUniV3Router {
    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);
}
