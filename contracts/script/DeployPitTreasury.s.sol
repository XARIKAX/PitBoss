// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {PitTreasury} from "../src/book/PitTreasury.sol";

/// @notice Deploys the $PITBOSS treasury and prints the two follow-up calls that
///         route activation revenue into it.
///
///         Fixes: `ActivationManager` sends half of every 888,888 $PITBOSS
///         activation fee to a "book" address, which is currently `HouseBook` — a
///         contract with no ERC-20 code path, so those tokens can never leave.
///         This treasury can both convert and sweep, so the same revenue becomes
///         ETH rewards for Bosses instead.
///
///         Already-stranded tokens are NOT recoverable. This only stops the leak.
///
///         MUST be deployed from a wallet that is NOT the $PITBOSS deployer, and
///         owned by one either — this contract sells $PITBOSS, and chart UIs flag
///         sells attributable to a token's deployer. The script refuses to run
///         otherwise. Use a second wallet you control, so no external party gains
///         authority over a protocol contract.
///
///         Run:
///           cd contracts
///           export TREASURY_OWNER=0x...        # NOT the $PITBOSS deployer
///           forge script script/DeployPitTreasury.s.sol \
///             --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast \
///             --verifier blockscout \
///             --verifier-url https://robinhoodchain.blockscout.com/api/
contract DeployPitTreasury is Script {
    // ── Live deployments (deployments.4663.json) ────────────────────────────────
    address constant PIT_TOKEN  = 0xd6f542cAdD79F1ec824883a0fdb90cB8c980A7aD;
    address constant ROUTER     = 0x0B09a1E136c6096f8C9E8478fe7705C5CE9Be3f9;
    address constant ORACLE     = 0x0B6CdED92c881B2e879d8105a2b9236f3121289B;
    address constant HOUSE_BOOK = 0x008718A207e78fc0f83f6454982063A99DdB41Ef;
    address constant ACTIVATION = 0x5807f5Bf9C18aF6D27DdA20b90e2810877672C4b;
    address constant LOCKER     = 0xFA15a03d5e28BD000f3cF78bF1AF50eda8595544;

    /// @notice The wallet that deployed $PITBOSS. This contract SELLS $PITBOSS, so
    ///         neither its deployer nor its owner may be this address: chart UIs
    ///         (DEX Screener et al) attribute sells from the token deployer — and
    ///         from contracts clustered to it — as a dev sell, and flag the pair.
    address constant PIT_DEPLOYER = 0x2fA1E9372c128e2A756f5BdD096d398eAEa0B659;

    function run() external returns (address treasury) {
        // Owner can only route and sweep, never claim a Boss's credited ETH — so a
        // second wallet you control satisfies both this and the rule that no
        // external party holds authority over protocol contracts.
        address owner = vm.envAddress("TREASURY_OWNER");
        require(owner != address(0), "TREASURY_OWNER not set");
        require(owner != PIT_DEPLOYER, "TREASURY_OWNER must not be the $PITBOSS deployer");

        vm.startBroadcast();
        require(msg.sender != PIT_DEPLOYER, "broadcast from a wallet other than the $PITBOSS deployer");
        PitTreasury t = new PitTreasury(PIT_TOKEN, ROUTER, ORACLE, HOUSE_BOOK, owner);
        vm.stopBroadcast();

        treasury = address(t);
        console2.log("PitTreasury:", treasury);
        console2.log("");
        console2.log("NEXT - repoint token revenue at the treasury (owner txs):");
        console2.log("  ActivationManager.setHouseBook(%s)", treasury);
        console2.log("    target:", ACTIVATION);
        console2.log("  LiquidityLocker.setHouseBook(%s)", treasury);
        console2.log("    target:", LOCKER);
        console2.log("");
        console2.log("The router also needs a $PITBOSS sell route before convert() works:");
        console2.log("  UniV3RouterAdapter.setSellRouteDirect(PIT, 3000)  // PIT/WETH pool");
        console2.log("    target:", ROUTER);
        console2.log("");
        console2.log("ETH-only fee sources keep paying the House Book directly and are untouched.");
        console2.log("");
        console2.log("Treasury owner:", owner);
        console2.log("Deployed by:   ", msg.sender);
        console2.log("Neither is the $PITBOSS deployer, so its sells are not attributable to it.");
    }
}
