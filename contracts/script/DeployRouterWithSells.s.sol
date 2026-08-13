// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {UniV3RouterAdapter} from "../src/integrations/UniV3RouterAdapter.sol";

/// @notice Deploys a router adapter that can sell tokens for ETH, and points the
///         treasury at it.
///
///         The live adapter (0x0B09a1E1…) predates `swapExactTokensForETH` and the
///         sell-route setters, so calling setSellRouteDirect on it reverts with
///         empty data — the selector simply is not there. PitTreasury.convert()
///         needs that direction to turn $PITBOSS into ETH, so it needs this one.
///
///         The live games keep using the old adapter and are untouched: they only
///         ever swap ETH -> stock, which it does correctly. Nothing needs migrating.
///
///         Deploy from the SAME wallet that owns the treasury, and never from the
///         $PITBOSS deployer — this adapter is the address that executes the sells.
///
///         Run:
///           cd contracts
///           export ROUTER_OWNER=0x...   # same wallet that owns PitTreasury
///           export PIT_POOL_FEE=3000    # 3000 = 0.3%, 10000 = 1%, 500 = 0.05%
///           forge script script/DeployRouterWithSells.s.sol \
///             --rpc-url $RPC_URL --private-key $KEY --broadcast \
///             --verifier blockscout \
///             --verifier-url https://robinhoodchain.blockscout.com/api/
contract DeployRouterWithSells is Script {
    address constant UNIV3_ROUTER = 0xCaf681a66D020601342297493863E78C959E5cb2; // SwapRouter02
    address constant WETH         = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant ORACLE       = 0x0B6CdED92c881B2e879d8105a2b9236f3121289B;
    address constant PIT_TOKEN    = 0xd6f542cAdD79F1ec824883a0fdb90cB8c980A7aD;
    address constant TREASURY     = 0x3831680d2ca4D84EA9CBc9736d85f3613aFa1ca6;

    /// @notice $PITBOSS deployer — must not deploy or own the contract that sells it.
    address constant PIT_DEPLOYER = 0x2fA1E9372c128e2A756f5BdD096d398eAEa0B659;

    function run() external returns (address adapter) {
        address owner = vm.envAddress("ROUTER_OWNER");
        require(owner != address(0), "ROUTER_OWNER not set");
        require(owner != PIT_DEPLOYER, "ROUTER_OWNER must not be the $PITBOSS deployer");

        // 3000 = 0.3%. Set PIT_POOL_FEE to whatever tier the live PIT/WETH pool
        // uses — a wrong tier points the route at a pool that does not exist and
        // convert() reverts at swap time rather than here.
        uint24 poolFee = uint24(vm.envOr("PIT_POOL_FEE", uint256(3000)));

        vm.startBroadcast();
        require(msg.sender != PIT_DEPLOYER, "broadcast from a wallet other than the $PITBOSS deployer");

        UniV3RouterAdapter r = new UniV3RouterAdapter(UNIV3_ROUTER, WETH, ORACLE, owner);
        adapter = address(r);
        vm.stopBroadcast();

        console2.log("UniV3RouterAdapter (with sells):", adapter);
        console2.log("PIT/WETH pool fee tier used:    ", poolFee);
        console2.log("");
        console2.log("NEXT - from ROUTER_OWNER (%s):", owner);
        console2.log("  1. adapter.setSellRouteDirect(PIT, %s)", poolFee);
        console2.log("       target:", adapter);
        console2.log("  2. treasury.setRouter(adapter)");
        console2.log("       target:", TREASURY);
        console2.log("");
        console2.log("Then convert() can turn treasury $PITBOSS into ETH for Bosses.");
        console2.log("The live games keep the old adapter and need no change.");
    }
}
