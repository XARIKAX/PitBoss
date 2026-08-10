// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {FreeMintPass} from "../src/nft/FreeMintPass.sol";

interface IPitBoss {
    function setMinter(address minter, bool allowed) external;
}

/// @notice Redeploys FreeMintPass with mintMany(uint256 count) support (max 10).
///         - Revokes old FreeMintPass minter permission.
///         - Grants new FreeMintPass minter permission.
///         - Patches deployments.<chainId>.json with new FreeMintPass address.
contract RedeployFreeMint is Script {
    using stdJson for string;

    address constant PIT_BOSS      = 0xaFC1acC4a5ABf7C317eE8D3D212C9c9331C9cc6E;
    address constant OLD_FREE_MINT = 0xC06F1366607A963612d0c395592AA4e8802fBbe9;

    function run() external {
        uint256 chainId = block.chainid;
        vm.startBroadcast();

        // 1. Deploy new FreeMintPass
        FreeMintPass pass = new FreeMintPass(PIT_BOSS);

        // 2. Revoke old FreeMintPass, grant new one
        IPitBoss(PIT_BOSS).setMinter(OLD_FREE_MINT, false);
        IPitBoss(PIT_BOSS).setMinter(address(pass), true);

        vm.stopBroadcast();

        // 3. Patch deployments JSON
        string memory root = vm.projectRoot();
        string memory path = string.concat(
            root, "/deployments/deployments.", vm.toString(chainId), ".json"
        );
        string memory json = vm.readFile(path);
        json = json.serialize("FreeMintPass", address(pass));
        vm.writeFile(path, json);
    }
}
