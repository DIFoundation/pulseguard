// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {PulseGuardReactive} from "../src/reactive/PulseGuardReactive.sol";

/// @notice Registers destination-chain executors on PulseGuardReactive (Lasna).
/// @dev PulseGuardReactive keeps its OWN executorForChain mapping — separate from
///      ProtectionManager's. Without this step react() evaluates triggers but skips
///      every callback request (`executorForChain[chainId] == address(0)`).
///
///      Run on Reactive Lasna with the reactive contract owner's key:
///        REACTIVE_ADDRESS=0x... BASE_EXECUTOR=0x... UNI_EXECUTOR=0x... \
///        DEPLOYER_PRIVATE_KEY=0x... \
///        forge script script/ConfigureReactive.s.sol:ConfigureReactive \
///          --rpc-url $LASNA_RPC --broadcast
contract ConfigureReactive is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        PulseGuardReactive reactive = PulseGuardReactive(vm.envAddress("REACTIVE_ADDRESS"));
        address baseExecutor = vm.envAddress("BASE_EXECUTOR");
        address uniExecutor = vm.envAddress("UNI_EXECUTOR");

        vm.startBroadcast(deployerKey);
        reactive.setExecutorForChain(84532, baseExecutor); // Base Sepolia
        reactive.setExecutorForChain(1301, uniExecutor); // Unichain Sepolia
        console2.log("configured reactive executors", address(reactive));
        vm.stopBroadcast();
    }
}
