// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {ProtectionExecutor} from "../src/protection/ProtectionExecutor.sol";
import {CrossChainExecutor} from "../src/protection/CrossChainExecutor.sol";
import {ProtectionManager} from "../src/protection/ProtectionManager.sol";
import {ProtectionTypes} from "../src/libraries/ProtectionTypes.sol";
import {MockPriceFeed} from "../src/oracle/MockPriceFeed.sol";
import {PulseGuardVault} from "../src/vault/PulseGuardVault.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {IPayable} from "@reactive/src/interfaces/IPayable.sol";

/// @dev Minimal mock of the destination callback proxy: only needs to satisfy IPayable
///      for AbstractCallback construction and onlyServiceProvider checks in tests.
contract MockCallbackProxy is IPayable {
    function debt(address) external pure returns (uint256) { return 0; }
    receive() external payable {}
}

contract ProtectionExecutorTest is Test {
    MockPriceFeed feed;
    MockERC20 token;
    PulseGuardVault vault;
    ProtectionManager manager;
    ProtectionExecutor executor;
    CrossChainExecutor uniExecutor;

    address owner = makeAddr("owner");
    address user = makeAddr("user");
    address operator = makeAddr("operator");
    address reactive = makeAddr("reactive");
    address proxy = makeAddr("proxy");
    address recipient = makeAddr("recipient");
    address rando = makeAddr("rando");

    address constant ASSET = address(0xA55E7);
    uint256 constant BASE_CHAIN = 84532;
    uint256 constant UNI_CHAIN = 1301;

    function setUp() public {
        feed = new MockPriceFeed(owner);
        token = new MockERC20("T", "T", 18);
        vault = new PulseGuardVault(address(token), owner);
        manager = new ProtectionManager(address(feed), address(vault), owner);
        vm.prank(owner);
        feed.setOperator(operator, true);

        executor = new ProtectionExecutor(IPayable(payable(proxy)), reactive, address(manager));
        uniExecutor = new CrossChainExecutor(IPayable(payable(proxy)), reactive);
        vm.startPrank(owner);
        manager.setExecutorForChain(BASE_CHAIN, address(executor));
        manager.setExecutorForChain(UNI_CHAIN, address(uniExecutor));
        manager.setReactiveContract(reactive);
        vault.setExecutor(address(manager));
        vm.stopPrank();

        token.mint(user, 100 ether);
        vm.prank(user);
        token.approve(address(vault), type(uint256).max);
        vm.prank(user);
        vault.deposit(100 ether);
    }

    function _createPolicy() internal returns (uint256 id) {
        ProtectionTypes.Policy memory p = ProtectionTypes.Policy({
            id: 0, owner: user, asset: address(token), monitoredAsset: ASSET,
            destinationChainId: BASE_CHAIN, triggerType: ProtectionTypes.TriggerType.STOP_LOSS,
            threshold: 1900e8, referencePrice: 0, maxDrawdownBps: 0,
            protectedAmount: 10 ether, recipient: recipient,
            action: ProtectionTypes.ProtectionAction.PROTECTED_EXIT,
            status: ProtectionTypes.PolicyStatus.CREATED, createdAt: 0, expiresAt: 0, executedAt: 0
        });
        vm.prank(user);
        id = manager.createPolicy(p);
    }

    function testCallbackExecutesProtection() public {
        uint256 id = _createPolicy();
        vm.prank(operator);
        feed.updatePrice(ASSET, 1800e8);
        // simulate proxy delivering callback: msg.sender = proxy, first arg = reactive
        vm.prank(proxy);
        executor.executeProtection(reactive, id);
        assertEq(token.balanceOf(recipient), 10 ether);
    }

    function testRejectsDirectCall() public {
        uint256 id = _createPolicy();
        vm.prank(operator);
        feed.updatePrice(ASSET, 1800e8);
        vm.prank(rando);
        vm.expectRevert(); // onlyServiceProvider
        executor.executeProtection(reactive, id);
    }

    function testRejectsForgedSender() public {
        uint256 id = _createPolicy();
        vm.prank(operator);
        feed.updatePrice(ASSET, 1800e8);
        vm.prank(proxy);
        vm.expectRevert(); // onlyCallbackSender
        executor.executeProtection(rando, id);
    }

    function testDuplicateCallbackRejected() public {
        uint256 id = _createPolicy();
        vm.prank(operator);
        feed.updatePrice(ASSET, 1800e8);
        vm.prank(proxy);
        executor.executeProtection(reactive, id);
        vm.prank(proxy);
        vm.expectRevert(); // policy no longer ACTIVE
        executor.executeProtection(reactive, id);
    }

    function testExpiredCallbackDoesNotEmitSuccess() public {
        ProtectionTypes.Policy memory p = ProtectionTypes.Policy({
            id: 0, owner: user, asset: address(token), monitoredAsset: ASSET,
            destinationChainId: BASE_CHAIN, triggerType: ProtectionTypes.TriggerType.STOP_LOSS,
            threshold: 1900e8, referencePrice: 0, maxDrawdownBps: 0,
            protectedAmount: 10 ether, recipient: recipient,
            action: ProtectionTypes.ProtectionAction.PROTECTED_EXIT,
            status: ProtectionTypes.PolicyStatus.CREATED, createdAt: 0, expiresAt: 50, executedAt: 0
        });
        vm.prank(user);
        uint256 id = manager.createPolicy(p);
        vm.warp(100); // now past expiresAt=50
        vm.prank(operator);
        feed.updatePrice(ASSET, 100e8);

        vm.expectEmit(true, true, true, true);
        emit ProtectionExecutor.ProtectionNotExecuted(id, reactive, ProtectionTypes.ExecutionOutcome.EXPIRED);
        vm.prank(proxy);
        executor.executeProtection(reactive, id);

        assertEq(token.balanceOf(recipient), 0); // no funds moved
        assertEq(uint8(manager.getPolicy(id).status), uint8(ProtectionTypes.PolicyStatus.EXPIRED));
    }

    function testCrossChainExecutorRecords() public {
        vm.prank(proxy);
        uniExecutor.recordProtection(reactive, 42, 1800e8);
        assertEq(uniExecutor.recordCount(), 1);
        // idempotent
        vm.prank(proxy);
        uniExecutor.recordProtection(reactive, 42, 1800e8);
        assertEq(uniExecutor.recordCount(), 1);
    }

    function testCrossChainAttestation() public {
        vm.prank(proxy);
        uniExecutor.recordProtection(reactive, 42, 1800e8);

        CrossChainExecutor.ProtectionRecord memory rec = uniExecutor.getRecord(42);
        assertEq(rec.policyId, 42);
        assertEq(rec.price, 1800e8);
        assertEq(rec.timestamp, block.timestamp);
        assertEq(rec.reactive, reactive);
        assertTrue(rec.attestation != bytes32(0));
        assertTrue(uniExecutor.verifyAttestation(42));
        assertEq(uniExecutor.recordIndex(42), 1);

        // unrecorded policy: getRecord reverts, verifyAttestation returns false
        vm.expectRevert(CrossChainExecutor.RecordNotFound.selector);
        uniExecutor.getRecord(99);
        assertFalse(uniExecutor.verifyAttestation(99));
    }
}
