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
///         Run:
///           cd contracts
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

    /// @notice Treasury owner. Keep this on a wallet you control — the owner can
    ///         only route and sweep, never claim a Boss's credited ETH.
    address constant OWNER = 0x2fA1E9372c128e2A756f5BdD096d398eAEa0B659;

    function run() external returns (address treasury) {
        vm.startBroadcast();
        PitTreasury t = new PitTreasury(PIT_TOKEN, ROUTER, ORACLE, HOUSE_BOOK, OWNER);
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
    }
}
