// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {PythOracleAdapter} from "../src/integrations/PythOracleAdapter.sol";
import {UniV3RouterAdapter} from "../src/integrations/UniV3RouterAdapter.sol";
import {V3PoolDeployerAdapter} from "../src/integrations/V3PoolDeployerAdapter.sol";

/// @title DeployIntegrations
/// @notice Deploys the three mainnet adapters that replace mocks:
///           - PythOracleAdapter      (IOracle backed by Pyth)
///           - UniV3RouterAdapter     (ISwapRouter backed by Uniswap V3)
///           - V3PoolDeployerAdapter  (IPoolDeployer for launcher graduation)
///         Run this BEFORE the main Deploy script on mainnet. Pass the printed
///         addresses as ORACLE / SWAP_ROUTER / POOL_DEPLOYER env vars.
///
/// @dev    Env config:
///           PYTH              — Pyth contract address on the chain
///           PYTH_ETH_FEED     — bytes32 ETH/USD price-feed id
///           PYTH_MAX_AGE      — max price staleness in seconds (e.g. 60)
///           UNIV3_ROUTER      — Uniswap V3 SwapRouter02 address
///           V3_POSITION_MGR   — Uniswap V3 NonfungiblePositionManager address
///           V3_FACTORY        — Uniswap V3 Factory address
///           WETH              — WETH9 address
///           POOL_FEE          — V3 fee tier for graduation pools (default: 3000)
///           OWNER             — adapter owner (intended: the 3-day timelock)
///
///         Per-token config set by OWNER after deploy:
///           PythOracleAdapter.setTokenFeed(stock, feedId)   — one call per stock
///           UniV3RouterAdapter.setFee(stock, tier)           — one call per stock
///           (V3PoolDeployerAdapter pool fee applies to all graduated pools;
///            update via setPoolFee if a different tier is needed per launch.)
contract DeployIntegrations is Script {
    function run() external returns (address oracle, address router, address poolDeployer) {
        address pyth      = vm.envAddress("PYTH");
        bytes32 ethFeed   = vm.envBytes32("PYTH_ETH_FEED");
        uint256 maxAge    = vm.envUint("PYTH_MAX_AGE");
        address univ3     = vm.envAddress("UNIV3_ROUTER");
        address posMgr    = vm.envAddress("V3_POSITION_MGR");
        address v3Factory = vm.envAddress("V3_FACTORY");
        address weth      = vm.envAddress("WETH");
        address owner     = vm.envAddress("OWNER");

        uint24 poolFee;
        try vm.envUint("POOL_FEE") returns (uint256 v) { poolFee = uint24(v); }
        catch { poolFee = 3000; }

        vm.startBroadcast();

        PythOracleAdapter o   = new PythOracleAdapter(pyth, ethFeed, maxAge, owner);
        UniV3RouterAdapter r  = new UniV3RouterAdapter(univ3, weth, address(o), owner);
        V3PoolDeployerAdapter p = new V3PoolDeployerAdapter(posMgr, v3Factory, weth, poolFee, owner);

        vm.stopBroadcast();

        oracle       = address(o);
        router       = address(r);
        poolDeployer = address(p);

        console2.log("PythOracleAdapter    ", oracle);
        console2.log("UniV3RouterAdapter   ", router);
        console2.log("V3PoolDeployerAdapter", poolDeployer);
        console2.log("");
        console2.log("NEXT: set ORACLE, SWAP_ROUTER, POOL_DEPLOYER, then run Deploy.s.sol");
        console2.log("      owner.setTokenFeed(stock, feedId) + owner.setFee(stock, tier) per stock");
    }
}
