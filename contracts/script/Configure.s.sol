// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {ProtectionManager} from "../src/protection/ProtectionManager.sol";
import {PulseGuardReactive} from "../src/reactive/PulseGuardReactive.sol";
import {PulseGuardVault} from "../src/vault/PulseGuardVault.sol";

/// @notice Wires up executors, reactive contract, and vault after all deployments.
/// @dev Run on the origin chain (Base Sepolia) with DEPLOYER_PRIVATE_KEY.
contract Configure is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        ProtectionManager manager = ProtectionManager(vm.envAddress("MANAGER_ADDRESS"));
        PulseGuardVault vault = PulseGuardVault(vm.envAddress("VAULT_ADDRESS"));
        address baseExecutor = vm.envAddress("BASE_EXECUTOR");
        address uniExecutor = vm.envAddress("UNI_EXECUTOR");
        address reactive = vm.envAddress("REACTIVE_ADDRESS");

        vm.startBroadcast(deployerKey);
        manager.setExecutorForChain(84532, baseExecutor);
        manager.setExecutorForChain(1301, uniExecutor);
        manager.setReactiveContract(reactive);
        vault.setExecutor(address(manager));
        console2.log("configured manager", address(manager));
        vm.stopBroadcast();
    }
}
