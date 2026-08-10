// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {MinerEntropyConductor} from "../src/pit/entropy/MinerEntropyConductor.sol";

contract DeployMinerConductor is Script {
    function run() external {
        vm.startBroadcast();
        MinerEntropyConductor conductor = new MinerEntropyConductor(12000);
        vm.stopBroadcast();
        console.log("MinerEntropyConductor:", address(conductor));
    }
}
