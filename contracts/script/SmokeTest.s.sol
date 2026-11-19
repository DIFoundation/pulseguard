// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";
import {MockPriceFeed} from "../src/oracle/MockPriceFeed.sol";
import {PulseGuardVault} from "../src/vault/PulseGuardVault.sol";
import {ProtectionManager} from "../src/protection/ProtectionManager.sol";
import {ProtectionTypes} from "../src/libraries/ProtectionTypes.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice End-to-end smoke test on Base Sepolia:
///   mint pTST -> approve -> deposit -> set price -> create STOP_LOSS policy.
/// @dev After this, mirror the policy on Lasna and push a triggering price update.
contract SmokeTest is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address tokenAddr = vm.envAddress("TOKEN_ADDRESS");
        address feedAddr = vm.envAddress("PRICE_FEED_ADDRESS");
        address vaultAddr = vm.envAddress("VAULT_ADDRESS");
        address managerAddr = vm.envAddress("MANAGER_ADDRESS");

        MockERC20 token = MockERC20(tokenAddr);
        MockPriceFeed feed = MockPriceFeed(feedAddr);
        PulseGuardVault vault = PulseGuardVault(vaultAddr);
        ProtectionManager manager = ProtectionManager(managerAddr);

        // Demo parameters: price starts at $100 (8 decimals), stop-loss at $90.
        // Override via env for additional flows (e.g. DESTINATION_CHAIN_ID=1301).
        uint256 initialPrice = vm.envOr("INITIAL_PRICE", uint256(100 * 10 ** 8));
        uint256 stopLoss = vm.envOr("STOP_LOSS", uint256(90 * 10 ** 8));
        uint256 depositAmount = vm.envOr("DEPOSIT_AMOUNT", uint256(1_000 * 10 ** 18)); // 1000 pTST
        uint256 protectedAmount = vm.envOr("PROTECTED_AMOUNT", uint256(500 * 10 ** 18)); // 500 pTST
        uint256 destChainId = vm.envOr("DESTINATION_CHAIN_ID", uint256(84532));

        vm.startBroadcast(deployerKey);

        token.mint(deployer, depositAmount);
        feed.updatePrice(address(token), initialPrice);

        IERC20(tokenAddr).approve(vaultAddr, depositAmount);
        vault.deposit(depositAmount);

        ProtectionTypes.Policy memory p;
        p.owner = deployer;
        p.asset = tokenAddr;
        p.monitoredAsset = tokenAddr;
        p.destinationChainId = destChainId;
        p.triggerType = ProtectionTypes.TriggerType.STOP_LOSS;
        p.threshold = stopLoss;
        p.referencePrice = 0;
        p.maxDrawdownBps = 0;
        p.protectedAmount = protectedAmount;
        p.recipient = deployer;
        p.action = ProtectionTypes.ProtectionAction.PROTECTED_EXIT;
        p.status = ProtectionTypes.PolicyStatus.CREATED;
        p.createdAt = 0;
        p.expiresAt = 0;
        p.executedAt = 0;

        uint256 id = manager.createPolicy(p);

        console2.log("policyId", id);
        console2.log("deployer", deployer);
        console2.log("token", tokenAddr);
        console2.log("initialPrice", initialPrice);
        console2.log("stopLossThreshold", stopLoss);

        vm.stopBroadcast();
    }
}
