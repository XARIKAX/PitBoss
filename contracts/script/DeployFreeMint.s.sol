// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {FreeMintPass} from "../src/nft/FreeMintPass.sol";
import {PitBoss} from "../src/nft/PitBoss.sol";

/// @notice Deploys FreeMintPass and registers it as a minter on the live PitBoss.
///
///   cd contracts
///   forge script script/DeployFreeMint.s.sol \
///     --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast \
///     --verifier blockscout \
///     --verifier-url https://robinhoodchain.blockscout.com/api/
///
///   To pause later (once $PIT is live):
///     cast send <FreeMintPass> "setOpen(bool)" false \
///       --rpc-url $RPC_URL --private-key $PRIVATE_KEY
contract DeployFreeMint is Script {
    address constant PIT_BOSS = 0xaFC1acC4a5ABf7C317eE8D3D212C9c9331C9cc6E;

    function run() external {
        vm.startBroadcast();

        FreeMintPass pass = new FreeMintPass(PIT_BOSS);
        PitBoss(PIT_BOSS).setMinter(address(pass), true);

        vm.stopBroadcast();

        string memory path = "deployments/deployments.4663.json";
        vm.writeJson(vm.toString(address(pass)), path, ".FreeMintPass");

        console2.log("FreeMintPass:", address(pass));
        console2.log("Registered as minter on PitBoss.");
        console2.log("To pause when PIT goes live:");
        console2.log("  cast send", address(pass), "\"setOpen(bool)\" false \\");
        console2.log("    --rpc-url $RPC_URL --private-key $PRIVATE_KEY");
    }
}
