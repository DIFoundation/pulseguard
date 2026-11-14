// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {ProtectionManager} from "../src/protection/ProtectionManager.sol";
import {ProtectionTypes} from "../src/libraries/ProtectionTypes.sol";
import {ProtectionErrors} from "../src/libraries/ProtectionErrors.sol";
import {MockPriceFeed} from "../src/oracle/MockPriceFeed.sol";
import {PulseGuardVault} from "../src/vault/PulseGuardVault.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract ProtectionManagerTest is Test {
    using ProtectionTypes for *;

    MockPriceFeed feed;
    MockERC20 token;
    PulseGuardVault vault;
    ProtectionManager manager;

    address owner = makeAddr("owner");
    address user = makeAddr("user");
    address operator = makeAddr("operator");
    address executor = makeAddr("executor");
    address recipient = makeAddr("recipient");
    address reactive = makeAddr("reactive");

    address constant ASSET = address(0xA55E7); // monitored asset key
    uint256 constant BASE_CHAIN = 84532;
    uint256 constant UNI_CHAIN = 1301;

    function setUp() public {
        feed = new MockPriceFeed(owner);
        token = new MockERC20("T", "T", 18);
        vault = new PulseGuardVault(address(token), owner);
        manager = new ProtectionManager(address(feed), address(vault), owner);
        vm.prank(owner);
        feed.setOperator(operator, true);
        vm.startPrank(owner);
        manager.setExecutorForChain(BASE_CHAIN, executor);
        manager.setExecutorForChain(UNI_CHAIN, makeAddr("uniExecutor"));
        manager.setReactiveContract(reactive);
        vault.setExecutor(address(manager));
        vm.stopPrank();
    }

    function _policy(ProtectionTypes.TriggerType tt, uint256 threshold) internal view returns (ProtectionTypes.Policy memory) {
        return ProtectionTypes.Policy({
            id: 0,
            owner: user,
            asset: address(token),
            monitoredAsset: ASSET,
            destinationChainId: BASE_CHAIN,
            triggerType: tt,
            threshold: threshold,
            referencePrice: 2000e8,
            maxDrawdownBps: 500,
            protectedAmount: 10 ether,
            recipient: recipient,
            action: ProtectionTypes.ProtectionAction.PROTECTED_EXIT,
            status: ProtectionTypes.PolicyStatus.CREATED,
            createdAt: 0,
            expiresAt: 0,
            executedAt: 0
        });
    }

    function testCreatePolicy() public {
        vm.prank(user);
        uint256 id = manager.createPolicy(_policy(ProtectionTypes.TriggerType.STOP_LOSS, 1900e8));
        assertEq(id, 1);
        assertEq(uint8(manager.getPolicy(id).triggerType), uint8(ProtectionTypes.TriggerType.STOP_LOSS));
    }

    function testCreatePolicyRejectsBadInput() public {
        ProtectionTypes.Policy memory p = _policy(ProtectionTypes.TriggerType.STOP_LOSS, 0);
        vm.prank(user);
        vm.expectRevert(ProtectionErrors.InvalidThreshold.selector);
        manager.createPolicy(p);
    }

    function testStopLossTriggerAndExecute() public {
        vm.prank(user);
        uint256 id = manager.createPolicy(_policy(ProtectionTypes.TriggerType.STOP_LOSS, 1900e8));

        // deposit to vault so protectedExit has funds
        token.mint(user, 100 ether);
        vm.prank(user);
        token.approve(address(vault), type(uint256).max);
        vm.prank(user);
        vault.deposit(100 ether);

        // price above threshold: not triggered
        vm.prank(operator);
        feed.updatePrice(ASSET, 2000e8);
        vm.prank(reactive);
        assertEq(manager.triggeredPolicies(ASSET, 2000e8).length, 0);

        // price below threshold: triggered
        vm.prank(operator);
        feed.updatePrice(ASSET, 1800e8);
        vm.prank(reactive);
        uint256[] memory ids = manager.triggeredPolicies(ASSET, 1800e8);
        assertEq(ids.length, 1);
        assertEq(ids[0], id);

        // executor executes
        vm.prank(executor);
        manager.executePolicy(id);
        assertEq(token.balanceOf(recipient), 10 ether);
        assertEq(vault.balances(user), 90 ether);

        // second execution reverts (no repeat)
        vm.prank(executor);
        vm.expectRevert(ProtectionErrors.PolicyNotActive.selector);
        manager.executePolicy(id);
    }

    function testTakeProfit() public {
        vm.prank(user);
        manager.createPolicy(_policy(ProtectionTypes.TriggerType.TAKE_PROFIT, 2100e8));
        vm.prank(reactive);
        assertEq(manager.triggeredPolicies(ASSET, 2200e8).length, 1);
        vm.prank(reactive);
        assertEq(manager.triggeredPolicies(ASSET, 2000e8).length, 0);
    }

    function testMaxDrawdown() public {
        ProtectionTypes.Policy memory p = _policy(ProtectionTypes.TriggerType.MAX_DRAWDOWN, 0);
        p.referencePrice = 2000e8;
        p.maxDrawdownBps = 500; // 5%
        vm.prank(user);
        manager.createPolicy(p);
        // floor = 1900e8
        vm.prank(reactive);
        assertEq(manager.triggeredPolicies(ASSET, 1899e8).length, 1);
        vm.prank(reactive);
        assertEq(manager.triggeredPolicies(ASSET, 1901e8).length, 0);
    }

    function testDeactivateCancel() public {
        vm.prank(user);
        uint256 id = manager.createPolicy(_policy(ProtectionTypes.TriggerType.STOP_LOSS, 1900e8));
        vm.prank(user);
        manager.deactivatePolicy(id);
        vm.prank(reactive);
        assertEq(manager.triggeredPolicies(ASSET, 100e8).length, 0);
        vm.prank(user);
        manager.cancelPolicy(id);
        vm.prank(user);
        vm.expectRevert(ProtectionErrors.InvalidStatusTransition.selector);
        manager.activatePolicy(id);
    }

    function testOnlyReactiveCanEvaluate() public {
        vm.prank(user);
        manager.createPolicy(_policy(ProtectionTypes.TriggerType.STOP_LOSS, 1900e8));
        vm.prank(user);
        vm.expectRevert(ProtectionErrors.Unauthorized.selector);
        manager.triggeredPolicies(ASSET, 100e8);
    }

    function testOnlyRegisteredExecutor() public {
        vm.prank(user);
        uint256 id = manager.createPolicy(_policy(ProtectionTypes.TriggerType.STOP_LOSS, 1900e8));
        vm.prank(operator);
        feed.updatePrice(ASSET, 100e8);
        vm.prank(makeAddr("rando"));
        vm.expectRevert(ProtectionErrors.NotExecutor.selector);
        manager.executePolicy(id);
    }

    function testTriggerNotMetOnExecute() public {
        vm.prank(user);
        uint256 id = manager.createPolicy(_policy(ProtectionTypes.TriggerType.STOP_LOSS, 1900e8));
        vm.prank(operator);
        feed.updatePrice(ASSET, 2000e8); // above threshold
        vm.prank(executor);
        vm.expectRevert(ProtectionErrors.TriggerNotMet.selector);
        manager.executePolicy(id);
    }
}
