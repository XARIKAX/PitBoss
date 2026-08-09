// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PythOracleAdapter} from "../src/integrations/PythOracleAdapter.sol";
import {UniV3RouterAdapter} from "../src/integrations/UniV3RouterAdapter.sol";
import {IPyth, PythStructs, IUniV3Router} from "../src/integrations/external.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";

// ── Inline external mocks ────────────────────────────────────────────────────
contract MockPyth is IPyth {
    mapping(bytes32 => PythStructs.Price) public px;

    function set(bytes32 id, int64 price, int32 expo, uint256 publishTime) external {
        px[id] = PythStructs.Price(price, 0, expo, publishTime);
    }

    function getPriceNoOlderThan(bytes32 id, uint256 age) external view returns (PythStructs.Price memory) {
        PythStructs.Price memory p = px[id];
        require(p.publishTime != 0, "no feed");
        require(block.timestamp - p.publishTime <= age, "stale");
        return p;
    }
}

contract MockWETH {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function deposit() external payable {
        balanceOf[msg.sender] += msg.value;
    }

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

    constructor(address weth_) {
        weth = MockWETH(weth_);
    }

    // 1:1 raw amountIn -> amountOut for the test; enforces amountOutMinimum.
    function exactInputSingle(ExactInputSingleParams calldata p) external payable returns (uint256 amountOut) {
        weth.transferFrom(msg.sender, address(this), p.amountIn);
        amountOut = p.amountIn;
        require(amountOut >= p.amountOutMinimum, "min");
        MockStockToken(p.tokenOut).mint(p.recipient, amountOut);
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────
contract AdaptersTest is Test {
    MockPyth internal pyth;
    PythOracleAdapter internal oracle;
    MockWETH internal weth;
    MockV3Router internal v3;
    UniV3RouterAdapter internal router;
    MockStockToken internal stock;

    address internal owner = address(this);
    bytes32 internal constant ETH_FEED = keccak256("ETH/USD");
    bytes32 internal constant AAPL_FEED = keccak256("AAPL/USD");

    function setUp() public {
        vm.warp(1_000_000);
        pyth = new MockPyth();
        oracle = new PythOracleAdapter(address(pyth), ETH_FEED, 60, owner);
        stock = new MockStockToken("Tokenized AAPL", "tAAPL", 18);
        oracle.setTokenFeed(address(stock), AAPL_FEED);

        weth = new MockWETH();
        v3 = new MockV3Router(address(weth));
        router = new UniV3RouterAdapter(address(v3), address(weth), address(oracle), owner);

        // ETH = $3000, AAPL = $224 (expo -8)
        pyth.set(ETH_FEED, 3000e8, -8, block.timestamp);
        pyth.set(AAPL_FEED, 224e8, -8, block.timestamp);
    }

    function test_Oracle_Usd() public view {
        assertEq(oracle.usdPerEth(), 3000e8, "eth usd 1e8");
        assertEq(oracle.usdPerToken(address(stock)), 224e8, "aapl usd 1e8");
    }

    function test_Oracle_EthPerToken() public view {
        uint256 tokUsd = 224e8;
        uint256 ethUsd = 3000e8;
        uint256 expected = (tokUsd * 1e18) / ethUsd; // wei per 1e18 token
        assertEq(oracle.ethPerToken(address(stock)), expected, "wei per token");
    }

    function test_Oracle_ScalesExpo() public {
        // Same $224 expressed with expo -5 must yield the same 1e8 value.
        pyth.set(AAPL_FEED, 224e5, -5, block.timestamp);
        assertEq(oracle.usdPerToken(address(stock)), 224e8, "expo-invariant");
    }

    function test_Oracle_StaleReverts() public {
        vm.warp(block.timestamp + 120); // older than maxAge (60s)
        vm.expectRevert();
        oracle.usdPerEth();
    }

    function test_Oracle_NegativeReverts() public {
        pyth.set(ETH_FEED, -1, -8, block.timestamp);
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
}
