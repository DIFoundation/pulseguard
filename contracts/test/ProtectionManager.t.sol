// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {ProtectionManager} from "../src/protection/ProtectionManager.sol";
import {SettlementRelay} from "../src/protection/SettlementRelay.sol";
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

        // Fund the user so policies can reserve protected amounts.
        token.mint(user, 1000 ether);
        vm.prank(user);
        token.approve(address(vault), type(uint256).max);
        vm.prank(user);
        vault.deposit(1000 ether);
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

    function testCreatePolicyRejectsUnsupportedAsset() public {
        ProtectionTypes.Policy memory p = _policy(ProtectionTypes.TriggerType.STOP_LOSS, 1900e8);
        p.asset = makeAddr("otherToken");
        vm.prank(user);
        vm.expectRevert(ProtectionErrors.UnsupportedAsset.selector);
        manager.createPolicy(p);
    }

    function testCreatePolicyRejectsUnfundedAmount() public {
        ProtectionTypes.Policy memory p = _policy(ProtectionTypes.TriggerType.STOP_LOSS, 1900e8);
        p.protectedAmount = 2000 ether; // user only deposited 1000
        vm.prank(user);
        vm.expectRevert(ProtectionErrors.InsufficientBalance.selector);
        manager.createPolicy(p);
    }

    function testReservationBlocksExcessWithdraw() public {
        vm.prank(user);
        uint256 id = manager.createPolicy(_policy(ProtectionTypes.TriggerType.STOP_LOSS, 1900e8));
        assertEq(vault.reservedBalances(user), 10 ether);
        assertEq(vault.availableBalance(user), 990 ether);

        vm.prank(user);
        vm.expectRevert(PulseGuardVault.InsufficientBalance.selector);
        vault.withdraw(991 ether);

        vm.prank(user);
        vault.withdraw(990 ether);
        assertEq(vault.balances(user), 10 ether); // 1000 deposited - 990 withdrawn

        // Balance (10) is fully covered by the reservation (10) → nothing available.
        assertEq(vault.availableBalance(user), 0);
        vm.prank(user);
        manager.cancelPolicy(id); // releases reservation without underflow
        assertEq(vault.reservedBalances(user), 0);
    }

    function testOverlappingPoliciesCannotExceedBalance() public {
        ProtectionTypes.Policy memory p1 = _policy(ProtectionTypes.TriggerType.STOP_LOSS, 1900e8);
        p1.protectedAmount = 600 ether;
        vm.prank(user);
        manager.createPolicy(p1);

        ProtectionTypes.Policy memory p2 = _policy(ProtectionTypes.TriggerType.TAKE_PROFIT, 2100e8);
        p2.protectedAmount = 600 ether; // 600 + 600 > 1000 deposited
        vm.prank(user);
        vm.expectRevert(ProtectionErrors.InsufficientBalance.selector);
        manager.createPolicy(p2);
    }

    function testCancelReleasesReservation() public {
        vm.prank(user);
        uint256 id = manager.createPolicy(_policy(ProtectionTypes.TriggerType.STOP_LOSS, 1900e8));
        assertEq(vault.reservedBalances(user), 10 ether);
        vm.prank(user);
        manager.cancelPolicy(id);
        assertEq(vault.reservedBalances(user), 0);
        assertEq(vault.availableBalance(user), 1000 ether);
    }

    function testExecuteReleasesReservation() public {
        vm.prank(user);
        uint256 id = manager.createPolicy(_policy(ProtectionTypes.TriggerType.STOP_LOSS, 1900e8));
        vm.prank(operator);
        feed.updatePrice(ASSET, 1800e8);
        vm.prank(executor);
        assertEq(uint8(manager.executePolicy(id)), uint8(ProtectionTypes.ExecutionOutcome.EXECUTED));
        assertEq(vault.reservedBalances(user), 0);
        assertEq(vault.balances(user), 990 ether);
    }

    function testCancelExpiredPolicyReverts() public {
        ProtectionTypes.Policy memory p = _policy(ProtectionTypes.TriggerType.STOP_LOSS, 1900e8);
        p.expiresAt = 50;
        vm.prank(user);
        uint256 id = manager.createPolicy(p);
        vm.warp(100);

        vm.prank(operator);
        feed.updatePrice(ASSET, 100e8);
        vm.prank(executor);
        assertEq(uint8(manager.executePolicy(id)), uint8(ProtectionTypes.ExecutionOutcome.EXPIRED));
        assertEq(vault.reservedBalances(user), 0); // released on expiry

        // Cancelling a terminal (EXPIRED) policy must revert — no double decrement.
        vm.prank(user);
        vm.expectRevert(ProtectionErrors.InvalidStatusTransition.selector);
        manager.cancelPolicy(id);
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
        assertEq(vault.balances(user), 1090 ether); // 1000 (setUp) + 100 (test) - 10 exit

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

    function testExpiredPolicyTransitionsWithoutRevert() public {
        ProtectionTypes.Policy memory p = _policy(ProtectionTypes.TriggerType.STOP_LOSS, 1900e8);
        p.expiresAt = 50;
        vm.prank(user);
        uint256 id = manager.createPolicy(p);
        vm.warp(100); // now past expiresAt

        vm.prank(operator);
        feed.updatePrice(ASSET, 100e8); // trigger condition met, but expired
        vm.prank(executor);
        assertEq(uint8(manager.executePolicy(id)), uint8(ProtectionTypes.ExecutionOutcome.EXPIRED));

        assertEq(uint8(manager.getPolicy(id).status), uint8(ProtectionTypes.PolicyStatus.EXPIRED));
        assertEq(vault.reservedBalances(user), 0);

        // Second call reverts: no longer ACTIVE
        vm.prank(executor);
        vm.expectRevert(ProtectionErrors.PolicyNotActive.selector);
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

    // ---------- Permissionless expiry ----------

    function testExpirePolicyPermissionless() public {
        ProtectionTypes.Policy memory p = _policy(ProtectionTypes.TriggerType.STOP_LOSS, 1900e8);
        p.expiresAt = 50;
        vm.prank(user);
        uint256 id = manager.createPolicy(p);
        assertEq(vault.reservedBalances(user), 10 ether);

        vm.warp(100);
        // Anyone can expire — not just the owner.
        vm.prank(makeAddr("rando"));
        manager.expirePolicy(id);

        assertEq(uint8(manager.getPolicy(id).status), uint8(ProtectionTypes.PolicyStatus.EXPIRED));
        assertEq(vault.reservedBalances(user), 0);
        assertEq(vault.availableBalance(user), 1000 ether);
    }

    function testExpireDeactivatedPolicy() public {
        ProtectionTypes.Policy memory p = _policy(ProtectionTypes.TriggerType.STOP_LOSS, 1900e8);
        p.expiresAt = 50;
        vm.prank(user);
        uint256 id = manager.createPolicy(p);
        vm.prank(user);
        manager.deactivatePolicy(id); // ACTIVE -> CREATED, reservation still held

        vm.warp(100);
        vm.prank(makeAddr("rando"));
        manager.expirePolicy(id); // must release exactly once

        assertEq(uint8(manager.getPolicy(id).status), uint8(ProtectionTypes.PolicyStatus.EXPIRED));
        assertEq(vault.reservedBalances(user), 0);
        assertEq(vault.availableBalance(user), 1000 ether);
    }

    function testExpirePolicyReverts() public {
        // No expiry set -> NotExpired
        vm.prank(user);
        uint256 id1 = manager.createPolicy(_policy(ProtectionTypes.TriggerType.STOP_LOSS, 1900e8));
        vm.prank(user);
        vm.expectRevert(ProtectionErrors.NotExpired.selector);
        manager.expirePolicy(id1);

        // Not yet past expiresAt -> NotExpired
        ProtectionTypes.Policy memory p = _policy(ProtectionTypes.TriggerType.STOP_LOSS, 1900e8);
        p.expiresAt = 1000;
        vm.prank(user);
        uint256 id2 = manager.createPolicy(p);
        vm.prank(user);
        vm.expectRevert(ProtectionErrors.NotExpired.selector);
        manager.expirePolicy(id2);

        // Terminal policy -> InvalidStatusTransition
        vm.prank(user);
        manager.cancelPolicy(id2);
        vm.warp(2000);
        vm.prank(user);
        vm.expectRevert(ProtectionErrors.InvalidStatusTransition.selector);
        manager.expirePolicy(id2);
    }

    function testCreatePolicyRejectsAlreadyExpired() public {
        vm.warp(100);
        ProtectionTypes.Policy memory p = _policy(ProtectionTypes.TriggerType.STOP_LOSS, 1900e8);
        p.expiresAt = 50; // in the past
        vm.prank(user);
        vm.expectRevert(ProtectionErrors.PolicyExpired.selector);
        manager.createPolicy(p);
    }

    // ---------- Bounded active-policy array ----------

    function testActiveArrayCleanup() public {
        uint256 id1 = _createStopLoss();
        uint256 id2 = _createStopLoss();
        uint256 id3 = _createStopLoss();
        assertEq(manager.policiesByAsset(ASSET).length, 3);

        vm.prank(user);
        manager.cancelPolicy(id2);
        assertEq(manager.policiesByAsset(ASSET).length, 2);

        vm.prank(user);
        manager.deactivatePolicy(id1); // CREATED leaves the eval list too
        assertEq(manager.policiesByAsset(ASSET).length, 1);
        assertEq(manager.policiesByAsset(ASSET)[0], id3);

        // Reactivation re-adds it.
        vm.prank(user);
        manager.activatePolicy(id1);
        assertEq(manager.policiesByAsset(ASSET).length, 2);
    }

    function _createStopLoss() internal returns (uint256 id) {
        vm.prank(user);
        id = manager.createPolicy(_policy(ProtectionTypes.TriggerType.STOP_LOSS, 1900e8));
    }

    // ---------- Settlement relay authorization ----------

    function testSettlementRelayLifecycle() public {
        SettlementRelay relay = new SettlementRelay(address(manager));
        vm.prank(owner);
        manager.setExecutorForChain(UNI_CHAIN, address(relay)); // relay replaces raw uniExecutor

        ProtectionTypes.Policy memory p = _policy(ProtectionTypes.TriggerType.STOP_LOSS, 1900e8);
        p.destinationChainId = UNI_CHAIN;
        vm.prank(user);
        uint256 id = manager.createPolicy(p);

        // Settlement before trigger -> TriggerNotMet
        vm.prank(operator);
        feed.updatePrice(ASSET, 2000e8);
        vm.prank(makeAddr("rando"));
        vm.expectRevert(ProtectionErrors.TriggerNotMet.selector);
        relay.settle(id);

        // Trigger, then settle — permissionless caller.
        vm.prank(operator);
        feed.updatePrice(ASSET, 1800e8);
        vm.prank(makeAddr("rando"));
        relay.settle(id);
        assertEq(uint8(manager.getPolicy(id).status), uint8(ProtectionTypes.PolicyStatus.EXECUTED));
        assertEq(token.balanceOf(recipient), 10 ether);

        // Replay -> policy no longer ACTIVE.
        vm.prank(makeAddr("rando"));
        vm.expectRevert(ProtectionErrors.PolicyNotActive.selector);
        relay.settle(id);
    }

    function testOnlyRelayCanExecuteUnichainPolicy() public {
        SettlementRelay relay = new SettlementRelay(address(manager));
        vm.prank(owner);
        manager.setExecutorForChain(UNI_CHAIN, address(relay));

        ProtectionTypes.Policy memory p = _policy(ProtectionTypes.TriggerType.STOP_LOSS, 1900e8);
        p.destinationChainId = UNI_CHAIN;
        vm.prank(user);
        uint256 id = manager.createPolicy(p);
        vm.prank(operator);
        feed.updatePrice(ASSET, 1800e8);

        // The old raw executor address is no longer authorized.
        vm.prank(makeAddr("uniExecutor"));
        vm.expectRevert(ProtectionErrors.NotExecutor.selector);
        manager.executePolicy(id);

        // The relay is.
        vm.prank(makeAddr("rando"));
        relay.settle(id);
        assertEq(uint8(manager.getPolicy(id).status), uint8(ProtectionTypes.PolicyStatus.EXECUTED));
    }
}
