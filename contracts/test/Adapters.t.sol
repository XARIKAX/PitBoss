// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ChainlinkOracleAdapter} from "../src/integrations/ChainlinkOracleAdapter.sol";
import {UniV3RouterAdapter} from "../src/integrations/UniV3RouterAdapter.sol";
import {AggregatorV3Interface, IUniV3Router} from "../src/integrations/external.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";

// ── Inline external mocks ────────────────────────────────────────────────────

contract MockFeed is AggregatorV3Interface {
    int256 public answer;
    uint256 public updatedAt;
    uint8 public decimals_ = 8;

    function set(int256 ans, uint256 ts) external { answer = ans; updatedAt = ts; }
    function setDecimals(uint8 d) external { decimals_ = d; }

    function decimals() external view returns (uint8) { return decimals_; }
    function latestRoundData() external view returns (
        uint80, int256, uint256, uint256, uint80
    ) {
        return (0, answer, 0, updatedAt, 0);
    }
}

contract MockWETH {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function deposit() external payable { balanceOf[msg.sender] += msg.value; }

    function approve(address s, uint256 v) external returns (bool) {
        allowance[msg.sender][s] = v;
        return true;
    }

    function transferFrom(address f, address t, uint256 v) external returns (bool) {
        allowance[f][msg.sender] -= v;
        balanceOf[f] -= v;
        balanceOf[t] += v;
        return true;
    }
}

contract MockV3Router is IUniV3Router {
    MockWETH public immutable weth;
    address public tokenOut;

    constructor(address weth_) { weth = MockWETH(weth_); }
    function setTokenOut(address t) external { tokenOut = t; }

    function exactInput(ExactInputParams calldata p) external payable returns (uint256 amountOut) {
        weth.transferFrom(msg.sender, address(this), p.amountIn);
        amountOut = p.amountIn;
        require(amountOut >= p.amountOutMinimum, "min");
        MockStockToken(tokenOut).mint(p.recipient, amountOut);
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

contract AdaptersTest is Test {
    MockFeed internal ethFeed;
    MockFeed internal aaplFeed;
    ChainlinkOracleAdapter internal oracle;
    MockWETH internal weth;
    MockV3Router internal v3;
    UniV3RouterAdapter internal router;
    MockStockToken internal stock;

    address internal owner = address(this);

    function setUp() public {
        vm.warp(1_000_000);

        ethFeed  = new MockFeed();
        aaplFeed = new MockFeed();
        ethFeed.set(3000e8,  block.timestamp);
        aaplFeed.set(224e8,  block.timestamp);

        oracle = new ChainlinkOracleAdapter(address(ethFeed), 60, owner);
        stock  = new MockStockToken("Tokenized AAPL", "tAAPL", 18);
        oracle.setTokenFeed(address(stock), address(aaplFeed));

        weth = new MockWETH();
        v3   = new MockV3Router(address(weth));
        v3.setTokenOut(address(stock));
        router = new UniV3RouterAdapter(address(v3), address(weth), address(oracle), owner);
        router.setRouteVia(address(stock), makeAddr("USDG"), 3000, 3000);
    }

    function test_Oracle_Usd() public view {
        assertEq(oracle.usdPerEth(), 3000e8, "eth usd 1e8");
        assertEq(oracle.usdPerToken(address(stock)), 224e8, "aapl usd 1e8");
    }

    function test_Oracle_EthPerToken() public view {
        uint256 usdToken = 224e8;
        uint256 expected = (usdToken * 1e18) / 3000e8; // integer division, like the adapter
        assertEq(oracle.ethPerToken(address(stock)), expected, "wei per token");
    }

    function test_Oracle_NormalizesDecimals() public {
        // Same $224 in a 6-decimal feed must yield 224e8 after normalization.
        aaplFeed.setDecimals(6);
        aaplFeed.set(224e6, block.timestamp);
        assertEq(oracle.usdPerToken(address(stock)), 224e8, "6-decimal feed normalized");
    }

    function test_Oracle_StaleReverts() public {
        vm.warp(block.timestamp + 120); // older than maxAge (60s)
        vm.expectRevert();
        oracle.usdPerEth();
    }

    function test_Oracle_NegativeReverts() public {
        ethFeed.set(-1, block.timestamp);
        vm.expectRevert();
        oracle.usdPerEth();
    }

    function test_Router_Quote() public view {
        uint256 px = oracle.ethPerToken(address(stock));
        assertEq(router.quoteETHForTokens(address(stock), 1 ether), (1 ether * 1e18) / px, "quote via oracle");
    }

    function test_Router_Swap() public {
        address to = makeAddr("to");
        uint256 out = router.swapExactETHForTokens{value: 1 ether}(address(stock), 1 ether, to);
        assertEq(out, 1 ether, "1:1 mock out");
        assertEq(stock.balanceOf(to), 1 ether, "stock delivered to recipient");
    }

    function test_Router_MinOutEnforced() public {
        vm.expectRevert();
        router.swapExactETHForTokens{value: 1 ether}(address(stock), 1 ether + 1, makeAddr("to"));
    }

    function test_Router_NoRoute_Reverts() public {
        MockStockToken other = new MockStockToken("Other", "OTH", 18);
        vm.expectRevert();
        router.swapExactETHForTokens{value: 1 ether}(address(other), 0, makeAddr("to"));
    }
}
