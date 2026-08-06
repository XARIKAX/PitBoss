// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISwapRouter, IOracle} from "../interfaces/Support.sol";
import {MockStockToken} from "./MockStockToken.sol";

/// @title MockSwapRouter
/// @notice Oracle-priced ETH->token router for local/testnet. Mints the output
///         token (mock stock) at the oracle mark. On mainnet this is replaced by a
///         real DEX router adapter.
contract MockSwapRouter is ISwapRouter {
    IOracle public immutable oracle;

    error SlippageExceeded();

    constructor(address oracle_) {
        oracle = IOracle(oracle_);
    }

    function quoteETHForTokens(address tokenOut, uint256 ethIn) public view returns (uint256) {
        uint256 px = oracle.ethPerToken(tokenOut); // eth-wei per 1e18 token
        if (px == 0) return 0;
        return (ethIn * 1e18) / px;
    }

    function swapExactETHForTokens(address tokenOut, uint256 minOut, address to)
        external
        payable
        returns (uint256 amountOut)
    {
        amountOut = quoteETHForTokens(tokenOut, msg.value);
        if (amountOut < minOut) revert SlippageExceeded();
        MockStockToken(tokenOut).mint(to, amountOut);
    }
}
