// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ISwapRouter, IOracle} from "../interfaces/Support.sol";
import {IUniV3Router, IWETH9} from "./external.sol";
import {Errors} from "../lib/Errors.sol";

/// @title UniV3RouterAdapter
/// @notice Real `ISwapRouter` for mainnet, backed by Uniswap V3 (SwapRouter02).
///         Consumers (House Book delivery, Degen Roll / Roulette restock) swap ETH
///         into a stock token with a caller-supplied `minOut`.
///
/// @dev    `quoteETHForTokens` must be a `view` (the House Book calls it to size
///         `minOut`), but Uniswap's Quoter is non-view. So the quote is taken from
///         the trusted **oracle** price, and the caller applies its own slippage
///         cap to derive `minOut`; the real V3 swap then enforces that `minOut`
///         on-chain. This bounds execution to within the caller's slippage of the
///         oracle mark — a stalled oracle reverts (fail-closed) rather than
///         quoting a dead price. Fee tier is set per token by the owner (the
///         timelock), defaulting to 0.3%.
contract UniV3RouterAdapter is ISwapRouter, Ownable, ReentrancyGuard {
    IUniV3Router public immutable router;
    IWETH9 public immutable weth;
    IOracle public oracle;
    uint24 public constant DEFAULT_FEE = 3000; // 0.3%
    mapping(address => uint24) public feeOf; // token => pool fee tier (0 => default)

    event OracleSet(address oracle);
    event FeeSet(address indexed token, uint24 fee);

    constructor(address router_, address weth_, address oracle_, address owner_) Ownable(owner_) {
        if (router_ == address(0) || weth_ == address(0) || oracle_ == address(0)) revert Errors.ZeroAddress();
        router = IUniV3Router(router_);
        weth = IWETH9(weth_);
        oracle = IOracle(oracle_);
    }

    // -------- admin --------
    function setOracle(address oracle_) external onlyOwner {
        if (oracle_ == address(0)) revert Errors.ZeroAddress();
        oracle = IOracle(oracle_);
        emit OracleSet(oracle_);
    }

    function setFee(address token, uint24 fee) external onlyOwner {
        feeOf[token] = fee;
        emit FeeSet(token, fee);
    }

    function _fee(address token) internal view returns (uint24) {
        uint24 f = feeOf[token];
        return f == 0 ? DEFAULT_FEE : f;
    }

    // -------- ISwapRouter --------
    /// @inheritdoc ISwapRouter
    /// @dev Oracle-priced quote (view-safe). Actual execution enforces the caller's
    ///      `minOut` on Uniswap.
    function quoteETHForTokens(address tokenOut, uint256 ethIn) external view returns (uint256) {
        uint256 px = oracle.ethPerToken(tokenOut); // eth-wei per 1e18 token
        if (px == 0) return 0;
        return (ethIn * 1e18) / px;
    }

    /// @inheritdoc ISwapRouter
    function swapExactETHForTokens(address tokenOut, uint256 minOut, address to)
        external
        payable
        nonReentrant
        returns (uint256 amountOut)
    {
        uint256 amountIn = msg.value;
        if (amountIn == 0) revert Errors.ZeroAmount();

        weth.deposit{value: amountIn}();
        weth.approve(address(router), amountIn);

        amountOut = router.exactInputSingle(
            IUniV3Router.ExactInputSingleParams({
                tokenIn: address(weth),
                tokenOut: tokenOut,
                fee: _fee(tokenOut),
                recipient: to,
                amountIn: amountIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            })
        );
        // Uniswap enforces amountOutMinimum, but re-check defensively.
        if (amountOut < minOut) revert Errors.InsufficientPayment();
    }
}
