// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ChainlinkOracleAdapter} from "../src/integrations/ChainlinkOracleAdapter.sol";
import {AggregatorV3Interface} from "../src/integrations/external.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";

/// @dev Minimal Chainlink aggregator: settable answer/decimals/updatedAt.
contract MockAggregator is AggregatorV3Interface {
    uint8 public decimals;
    int256 public answer;
    uint256 public updatedAt;

    constructor(uint8 d, int256 a, uint256 u) {
        decimals = d;
        answer = a;
        updatedAt = u;
    }

    function set(int256 a, uint256 u) external {
        answer = a;
        updatedAt = u;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, 0, updatedAt, 1);
    }
}

contract ChainlinkOracleTest is Test {
    MockAggregator internal ethFeed;
    MockAggregator internal aaplFeed;
    ChainlinkOracleAdapter internal oracle;
    MockStockToken internal stock;

    function setUp() public {
        vm.warp(1_000_000);
        ethFeed = new MockAggregator(8, 3000e8, block.timestamp); // $3000, 8-dec
        aaplFeed = new MockAggregator(8, 224e8, block.timestamp); // $224, 8-dec
        oracle = new ChainlinkOracleAdapter(address(ethFeed), 3600, address(this));
        stock = new MockStockToken("Tokenized AAPL", "tAAPL", 18);
        oracle.setTokenFeed(address(stock), address(aaplFeed));
    }

    function test_Usd() public view {
        assertEq(oracle.usdPerEth(), 3000e8, "eth usd 1e8");
        assertEq(oracle.usdPerToken(address(stock)), 224e8, "aapl usd 1e8");
    }

    function test_EthPerToken() public view {
        uint256 tokUsd = 224e8;
        uint256 ethUsd = 3000e8;
        assertEq(oracle.ethPerToken(address(stock)), (tokUsd * 1e18) / ethUsd, "wei per token");
    }

    /// @dev A non-8-decimal feed is normalized to 1e8.
    function test_NormalizesDecimals() public {
        MockAggregator feed18 = new MockAggregator(18, 224e18, block.timestamp);
        oracle.setTokenFeed(address(stock), address(feed18));
        assertEq(oracle.usdPerToken(address(stock)), 224e8, "18-dec normalized to 1e8");
    }

    function test_StaleReverts() public {
        vm.warp(block.timestamp + 4000); // older than maxAge (3600)
        vm.expectRevert();
        oracle.usdPerEth();
    }

    function test_NegativeReverts() public {
        ethFeed.set(-1, block.timestamp);
        vm.expectRevert();
        oracle.usdPerEth();
    }
}
