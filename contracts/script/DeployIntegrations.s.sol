// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {ChainlinkOracleAdapter} from "../src/integrations/ChainlinkOracleAdapter.sol";
import {UniV3RouterAdapter} from "../src/integrations/UniV3RouterAdapter.sol";
import {V3PoolDeployerAdapter} from "../src/integrations/V3PoolDeployerAdapter.sol";

/// @title DeployIntegrations
/// @notice Deploys the three mainnet adapters that replace mocks on Robinhood Chain:
///           • ChainlinkOracleAdapter  — production oracle (Chainlink Data Feeds)
///           • UniV3RouterAdapter      — Uniswap V3-backed ETH→stock swaps
///           • V3PoolDeployerAdapter   — creates Uniswap V3 pool on launcher graduation
///         Run this BEFORE the main Deploy script. Pass the printed addresses as
///         ORACLE / SWAP_ROUTER / POOL_DEPLOYER env vars.
///
/// @dev    Env config:
///           ETH_USD_FEED      — Chainlink ETH/USD feed (Robinhood UnstaleWrapper
///                               0x9F738359CF9A3630d08a79d80dE1aB803Cb2f7dD)
///           CHAINLINK_MAX_AGE — max feed staleness in seconds (e.g. 3600)
///           UNIV3_ROUTER      — Uniswap V3 SwapRouter02 address
///           V3_POSITION_MGR   — Uniswap V3 NonfungiblePositionManager address
///           V3_FACTORY        — Uniswap V3 Factory address
///           WETH              — WETH9 address
///           POOL_FEE          — V3 fee tier for graduation pools (default: 3000)
///           OWNER             — adapter owner (intended: the 3-day timelock)
///
///         Per-stock config set by OWNER after deploy:
///           oracle.setTokenFeed(stock, chainlinkFeed)   — one call per stock
///           router.setRouteVia(stock, USDG, 3000, 3000) — WETH→USDG→stock route
///           (V3PoolDeployerAdapter pool fee applies to all launched pools;
///            update via setPoolFee if a different tier is needed per launch.)
contract DeployIntegrations is Script {
    function run() external returns (address oracle, address router, address poolDeployer) {
        address ethFeed   = vm.envAddress("ETH_USD_FEED");
        uint256 maxAge    = vm.envUint("CHAINLINK_MAX_AGE");
        address univ3     = vm.envAddress("UNIV3_ROUTER");
        address posMgr    = vm.envAddress("V3_POSITION_MGR");
        address v3Factory = vm.envAddress("V3_FACTORY");
        address weth      = vm.envAddress("WETH");
        address owner     = vm.envAddress("OWNER");

        uint24 poolFee;
        try vm.envUint("POOL_FEE") returns (uint256 v) { poolFee = uint24(v); }
        catch { poolFee = 3000; }

        vm.startBroadcast();
        ChainlinkOracleAdapter o = new ChainlinkOracleAdapter(ethFeed, maxAge, owner);
        UniV3RouterAdapter r     = new UniV3RouterAdapter(univ3, weth, address(o), owner);
        V3PoolDeployerAdapter p  = new V3PoolDeployerAdapter(posMgr, v3Factory, weth, poolFee, owner);
        vm.stopBroadcast();

        oracle       = address(o);
        router       = address(r);
        poolDeployer = address(p);

        console2.log("ChainlinkOracleAdapter ", oracle);
        console2.log("UniV3RouterAdapter     ", router);
        console2.log("V3PoolDeployerAdapter  ", poolDeployer);
        console2.log("NEXT: set ORACLE, SWAP_ROUTER, POOL_DEPLOYER, then run Deploy.s.sol");
        console2.log("  per stock: oracle.setTokenFeed(stock, chainlinkFeed)");
        console2.log("             router.setRouteVia(stock, USDG, 3000, 3000)");
        console2.log("  Only add stocks with PROVEN liquidity on that route.");
    }
}
