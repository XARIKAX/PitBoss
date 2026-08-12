// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ISwapRouter, IOracle} from "../interfaces/Support.sol";
import {IUniV3Router, IWETH9} from "./external.sol";
import {Errors} from "../lib/Errors.sol";

/// @title UniV3RouterAdapter
/// @notice Real `ISwapRouter` for mainnet, backed by Uniswap V3 (SwapRouter02).
///         Consumers (House Book delivery, Degen Roll / Roulette restock) swap ETH
///         into a stock token with a caller-supplied `minOut`.
///
/// @dev    MULTI-HOP ROUTES: Robinhood stock tokens have **no direct WETH pool** —
///         they route `WETH → USDG → stock` (both 0.3%). So each token has an
///         owner-configured V3 `path` and the swap uses `exactInput` (multi-hop),
///         not `exactInputSingle`. A token with no configured route reverts (it
///         cannot be a reward/payout token until it has a proven pool + route).
///
///         `quoteETHForTokens` must be a `view` (the House Book calls it to size
///         `minOut`), but Uniswap's Quoter is non-view — so the quote comes from the
///         trusted **oracle** price and the caller applies its own slippage cap; the
///         real V3 swap then enforces that `minOut` on-chain. A stalled oracle
///         reverts (fail-closed) rather than quoting a dead price.
contract UniV3RouterAdapter is ISwapRouter, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IUniV3Router public immutable router;
    IWETH9 public immutable weth;
    IOracle public oracle;
    /// @notice token => V3-encoded route `WETH,fee,[mid,fee,]token`.
    mapping(address => bytes) public routeOf;
    /// @notice token => V3-encoded route `token,fee,[mid,fee,]WETH`. A V3 path is
    ///         directional, so selling a token needs its own route rather than the
    ///         reverse of `routeOf`.
    mapping(address => bytes) public sellRouteOf;

    event OracleSet(address oracle);
    event RouteSet(address indexed token, bytes path);
    event SellRouteSet(address indexed token, bytes path);

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

    /// @notice Set a raw V3 path for `token` (advanced). Must start at WETH and end
    ///         at `token`.
    function setRoute(address token, bytes calldata path) external onlyOwner {
        routeOf[token] = path;
        emit RouteSet(token, path);
    }

    /// @notice Convenience: a two-hop route `WETH -feeIn-> mid -feeOut-> token`
    ///         (e.g. mid = USDG). This is the shape every Robinhood stock uses.
    function setRouteVia(address token, address mid, uint24 feeIn, uint24 feeOut) external onlyOwner {
        bytes memory path = abi.encodePacked(address(weth), feeIn, mid, feeOut, token);
        routeOf[token] = path;
        emit RouteSet(token, path);
    }

    /// @notice Convenience: a direct route `WETH -fee-> token` (only for a token that
    ///         actually has a WETH pool).
    function setRouteDirect(address token, uint24 fee) external onlyOwner {
        bytes memory path = abi.encodePacked(address(weth), fee, token);
        routeOf[token] = path;
        emit RouteSet(token, path);
    }

    /// @notice Set a raw V3 sell path for `token`. Must start at `token` and end at
    ///         WETH — the mirror of `setRoute`, used by `swapExactTokensForETH`.
    function setSellRoute(address token, bytes calldata path) external onlyOwner {
        sellRouteOf[token] = path;
        emit SellRouteSet(token, path);
    }

    /// @notice Convenience: a two-hop sell route `token -feeIn-> mid -feeOut-> WETH`.
    function setSellRouteVia(address token, address mid, uint24 feeIn, uint24 feeOut) external onlyOwner {
        bytes memory path = abi.encodePacked(token, feeIn, mid, feeOut, address(weth));
        sellRouteOf[token] = path;
        emit SellRouteSet(token, path);
    }

    /// @notice Convenience: a direct sell route `token -fee-> WETH`. $PITBOSS has a
    ///         live WETH pool, so this is the shape it uses.
    function setSellRouteDirect(address token, uint24 fee) external onlyOwner {
        bytes memory path = abi.encodePacked(token, fee, address(weth));
        sellRouteOf[token] = path;
        emit SellRouteSet(token, path);
    }

    // -------- ISwapRouter --------
    /// @inheritdoc ISwapRouter
    /// @dev Oracle-priced quote (view-safe). Execution enforces the caller's `minOut`.
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
        bytes memory path = routeOf[tokenOut];
        if (path.length == 0) revert Errors.InvalidConfig(); // no route configured

        weth.deposit{value: amountIn}();
        weth.approve(address(router), amountIn);

        amountOut = router.exactInput(
            IUniV3Router.ExactInputParams({
                path: path,
                recipient: to,
                amountIn: amountIn,
                amountOutMinimum: minOut
            })
        );
        if (amountOut < minOut) revert Errors.InsufficientPayment(); // defensive
    }

    /// @inheritdoc ISwapRouter
    /// @dev Oracle-priced quote (view-safe). Execution enforces the caller's `minOut`.
    function quoteTokensForETH(address tokenIn, uint256 amountIn) external view returns (uint256) {
        uint256 px = oracle.ethPerToken(tokenIn); // eth-wei per 1e18 token
        return (amountIn * px) / 1e18;
    }

    /// @inheritdoc ISwapRouter
    /// @dev $PITBOSS taxes transfers, so the amount that lands here is smaller than
    ///      `amountIn`. Swap the delivered balance rather than the requested one, or
    ///      the router would try to sell tokens it never received.
    function swapExactTokensForETH(address tokenIn, uint256 amountIn, uint256 minOut, address to)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        if (amountIn == 0) revert Errors.ZeroAmount();
        bytes memory path = sellRouteOf[tokenIn];
        if (path.length == 0) revert Errors.InvalidConfig(); // no sell route configured

        uint256 before = IERC20(tokenIn).balanceOf(address(this));
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        uint256 received = IERC20(tokenIn).balanceOf(address(this)) - before;
        if (received == 0) revert Errors.ZeroAmount();

        IERC20(tokenIn).forceApprove(address(router), received);
        uint256 wethOut = router.exactInput(
            IUniV3Router.ExactInputParams({
                path: path,
                recipient: address(this),
                amountIn: received,
                amountOutMinimum: minOut
            })
        );
        if (wethOut < minOut) revert Errors.InsufficientPayment(); // defensive

        weth.withdraw(wethOut);
        (bool ok,) = to.call{value: wethOut}("");
        if (!ok) revert Errors.InsufficientPayment();
        amountOut = wethOut;
    }

    /// @dev Only to receive ETH from unwrapping WETH mid-swap.
    receive() external payable {
        if (msg.sender != address(weth)) revert Errors.NotAuthorized();
    }
}
