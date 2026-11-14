// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {ProtectionExecutor} from "../src/protection/ProtectionExecutor.sol";
import {CrossChainExecutor} from "../src/protection/CrossChainExecutor.sol";
import {IPayable} from "@reactive/src/interfaces/IPayable.sol";

/// @notice Deploys destination-chain callback executors.
/// @dev Run AFTER PulseGuardReactive exists on Lasna. Pass REACTIVE_ADDRESS env.
///      Callback proxy is chain-specific (see docs/REACTIVE_INTEGRATION.md).
contract DeployExecutor is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address reactive = vm.envAddress("REACTIVE_ADDRESS");
        address manager = vm.envAddress("MANAGER_ADDRESS");
        address proxy = vm.envAddress("CALLBACK_PROXY"); // e.g. Base Sepolia proxy
        bool crossChain = vm.envOr("CROSS_CHAIN", false);

        vm.startBroadcast(deployerKey);
        if (crossChain) {
            CrossChainExecutor ex = new CrossChainExecutor{value: 0}(IPayable(payable(proxy)), reactive);
            console2.log("crossChainExecutor", address(ex));
        } else {
            ProtectionExecutor ex = new ProtectionExecutor{value: 0}(IPayable(payable(proxy)), reactive, manager);
            console2.log("protectionExecutor", address(ex));
        }
        console2.log("chainId", block.chainid);
        vm.stopBroadcast();
    }
}
