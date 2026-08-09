// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title External integration interfaces
/// @notice Minimal surfaces of the third-party contracts the mainnet adapters
///         talk to: Pyth price feeds and Uniswap V3 (SwapRouter02 + WETH9). Kept
///         local so the repo has no heavy external dependency; the ABIs match the
///         canonical deployments.

/// @dev Pyth price object (mirror of PythStructs.Price).
library PythStructs {
    struct Price {
        int64 price; // scaled by 10^expo
        uint64 conf;
        int32 expo;
        uint256 publishTime;
    }
}

interface IPyth {
    /// @notice Latest price for `id`, reverting if older than `age` seconds.
    function getPriceNoOlderThan(bytes32 id, uint256 age) external view returns (PythStructs.Price memory);
}

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

/// @dev Uniswap V3 SwapRouter02 single-hop exact-input (no deadline arg).
interface IUniV3Router {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}
