// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {ChainlinkOracleAdapter} from "../src/integrations/ChainlinkOracleAdapter.sol";
import {UniV3RouterAdapter} from "../src/integrations/UniV3RouterAdapter.sol";

/// @title DeployIntegrations
/// @notice Deploys the two mainnet adapters that replace MockOracle / MockSwapRouter
///         on Robinhood Chain:
///           • ChainlinkOracleAdapter — Robinhood's production oracle (Chainlink
///             Data Feeds; ETH/USD via the UnstaleWrapper, per-stock feeds set after).
///           • UniV3RouterAdapter — Uniswap-V3-backed ETH→stock swaps.
///         Run this first, then pass the printed oracle/router as ORACLE / SWAP_ROUTER
///         to the main Deploy script (or call HouseBook.setRouter / LoanVault.setConfig
///         / the machine wiring to point at them).
///
/// @dev    Env config:
///           ETH_USD_FEED     — Chainlink ETH/USD feed (Robinhood UnstaleWrapper
///                              0x9F738359CF9A3630d08a79d80dE1aB803Cb2f7dD)
///           CHAINLINK_MAX_AGE — max feed staleness in seconds (e.g. 3600)
///           UNIV3_ROUTER     — Uniswap V3 SwapRouter02 address
///           WETH             — WETH9 address
///           OWNER            — adapter owner (intended: the 3-day timelock)
///         Per-stock Chainlink feed addresses and pool fee tiers are set AFTER
///         deploy by the owner via setTokenFeed / setFee (one call per tokenized
///         stock — the 16 stock feeds from the Robinhood pack).
contract DeployIntegrations is Script {
    function run() external returns (address oracle, address router) {
        address ethFeed = vm.envAddress("ETH_USD_FEED");
        uint256 maxAge = vm.envUint("CHAINLINK_MAX_AGE");
        address univ3 = vm.envAddress("UNIV3_ROUTER");
        address weth = vm.envAddress("WETH");
        address owner = vm.envAddress("OWNER");

        vm.startBroadcast();
        ChainlinkOracleAdapter o = new ChainlinkOracleAdapter(ethFeed, maxAge, owner);
        UniV3RouterAdapter r = new UniV3RouterAdapter(univ3, weth, address(o), owner);
        vm.stopBroadcast();

        oracle = address(o);
        router = address(r);
        console2.log("ChainlinkOracleAdapter", oracle);
        console2.log("UniV3RouterAdapter", router);
        console2.log("NEXT: owner.setTokenFeed(stock, chainlinkFeed) + owner.setFee(stock, tier) per stock");
    }
}
