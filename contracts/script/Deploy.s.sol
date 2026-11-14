// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";
import {MockPriceFeed} from "../src/oracle/MockPriceFeed.sol";
import {PulseGuardVault} from "../src/vault/PulseGuardVault.sol";
import {ProtectionManager} from "../src/protection/ProtectionManager.sol";

/// @notice Deploys origin-chain contracts on Base Sepolia (or Unichain Sepolia).
/// @dev Executors are deployed separately AFTER the reactive contract exists on Lasna,
///      because AbstractCallback stores the reactive address immutably.
contract DeployOrigin is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        MockERC20 token = new MockERC20("PulseGuard Test Asset", "pTST", 18);
        MockPriceFeed feed = new MockPriceFeed(deployer);
        feed.setOperator(deployer, true);

        PulseGuardVault vault = new PulseGuardVault(address(token), deployer);
        ProtectionManager manager = new ProtectionManager(address(feed), address(vault), deployer);

        console2.log("token", address(token));
        console2.log("feed", address(feed));
        console2.log("vault", address(vault));
        console2.log("manager", address(manager));
        console2.log("chainId", block.chainid);

        vm.stopBroadcast();
    }
}
