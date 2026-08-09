// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {PythOracleAdapter} from "../src/integrations/PythOracleAdapter.sol";
import {UniV3RouterAdapter} from "../src/integrations/UniV3RouterAdapter.sol";

/// @title DeployIntegrations
/// @notice Deploys the two mainnet adapters that replace MockOracle / MockSwapRouter:
///         a Pyth-backed `IOracle` and a Uniswap-V3-backed `ISwapRouter`. Run this
///         first, then pass the printed addresses as ORACLE / SWAP_ROUTER to the
///         main Deploy script (or call HouseBook.setRouter / LoanVault.setConfig /
///         the machines' wiring to point at them).
///
/// @dev    Env config:
///           PYTH            — Pyth contract address on the chain
///           PYTH_ETH_FEED   — bytes32 ETH/USD price-feed id
///           PYTH_MAX_AGE    — max price staleness in seconds (e.g. 60)
///           UNIV3_ROUTER    — Uniswap V3 SwapRouter02 address
///           WETH            — WETH9 address
///           OWNER           — adapter owner (intended: the 3-day timelock)
///         Per-token Pyth feed ids and pool fee tiers are set AFTER deploy by the
///         owner via setTokenFeed / setFee (one call per tokenized stock).
contract DeployIntegrations is Script {
    function run() external returns (address oracle, address router) {
        address pyth = vm.envAddress("PYTH");
        bytes32 ethFeed = vm.envBytes32("PYTH_ETH_FEED");
        uint256 maxAge = vm.envUint("PYTH_MAX_AGE");
        address univ3 = vm.envAddress("UNIV3_ROUTER");
        address weth = vm.envAddress("WETH");
        address owner = vm.envAddress("OWNER");

        vm.startBroadcast();
        PythOracleAdapter o = new PythOracleAdapter(pyth, ethFeed, maxAge, owner);
        UniV3RouterAdapter r = new UniV3RouterAdapter(univ3, weth, address(o), owner);
        vm.stopBroadcast();

        oracle = address(o);
        router = address(r);
        console2.log("PythOracleAdapter", oracle);
        console2.log("UniV3RouterAdapter", router);
        console2.log("NEXT: owner.setTokenFeed(stock, feedId) + owner.setFee(stock, tier) per stock");
    }
}
