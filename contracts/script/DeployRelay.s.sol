// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {SettlementRelay} from "../src/protection/SettlementRelay.sol";

contract DeployRelay is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address manager = vm.envAddress("MANAGER_ADDRESS");
        vm.startBroadcast(deployerKey);
        SettlementRelay relay = new SettlementRelay(manager);
        vm.stopBroadcast();
        console.log("SettlementRelay:", address(relay));
    }
}
