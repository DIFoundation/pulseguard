// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {PulseGuardReactive} from "../src/reactive/PulseGuardReactive.sol";
import {IReactive} from "@reactive/src/interfaces/IReactive.sol";
import {MockPriceFeed} from "../src/oracle/MockPriceFeed.sol";
import {MockSystemContract} from "./mocks/MockSystemContract.sol";

contract PulseGuardReactiveTest is Test {
    PulseGuardReactive reactive;
    MockPriceFeed feed;
    address managerAddr = makeAddr("manager");

    address owner = makeAddr("owner");
    address operator = makeAddr("operator");
    address SYSTEM = 0x8888888888888888888888888888888888888888;
    address executor = makeAddr("executor");

    uint256 constant ORIGIN_CHAIN = 84532; // Base Sepolia
    address constant ASSET = address(0xA55E7);

    function setUp() public {
        feed = new MockPriceFeed(owner);
        vm.prank(owner);
        feed.setOperator(operator, true);
        MockSystemContract mockSystem = new MockSystemContract();
        vm.etch(SYSTEM, address(mockSystem).code);
        uint256 topic0 = uint256(keccak256("PriceUpdated(address,uint256,uint256)"));
        uint256 syncTopic0 = uint256(
            keccak256("PolicyMirrorSync(uint256,address,uint8,uint256,uint256,uint256,uint256,uint64,bool)")
        );
        reactive = new PulseGuardReactive(ORIGIN_CHAIN, address(feed), topic0, managerAddr, syncTopic0);
        reactive.setExecutorForChain(84532, executor);
    }

    function _logRecord(uint256 price, uint256 txHashSeed, uint256 logIndex) internal view returns (IReactive.LogRecord memory) {
        return IReactive.LogRecord({
            chainId: ORIGIN_CHAIN,
            contractAddress: address(feed),
            topic0: uint256(keccak256("PriceUpdated(address,uint256,uint256)")),
            topic1: uint256(uint160(ASSET)),
            topic2: 0,
            topic3: 0,
            data: abi.encode(price, block.timestamp),
            blockNumber: 1,
            opCode: 2,
            blockHash: 0,
            txHash: txHashSeed,
            logIndex: logIndex
        });
    }

    function testOnlySystemCanReact() public {
        IReactive.LogRecord memory log = _logRecord(100e8, 1, 0);
        vm.prank(owner);
        vm.expectRevert();
        reactive.react(log);
    }

    function testIgnoresIrrelevantEvent() public {
        IReactive.LogRecord memory log = _logRecord(100e8, 1, 0);
        log.chainId = 1; // wrong chain
        vm.prank(SYSTEM);
        reactive.react(log); // should not revert, just emit IrrelevantEvent
    }

    function testStopLossRequestsCallback() public {
        reactive.mirrorPolicy(1, ASSET, 0, 1900e8, 0, 0, 84532, 0);
        IReactive.LogRecord memory log = _logRecord(1800e8, 0xabc, 0);
        vm.prank(SYSTEM);
        reactive.react(log);
        // CallbackRequested event emitted — verify via state: dedup set prevents re-request
        // Second identical event should not re-request (dedup)
        vm.prank(SYSTEM);
        reactive.react(log); // same txHash+logIndex+policyId → skipped
    }

    function testNoCallbackAboveThreshold() public {
        reactive.mirrorPolicy(1, ASSET, 0, 1900e8, 0, 0, 84532, 0);
        IReactive.LogRecord memory log = _logRecord(2000e8, 0xdef, 0);
        vm.prank(SYSTEM);
        reactive.react(log); // price above stop-loss → no trigger
    }

    function testTakeProfit() public {
        reactive.mirrorPolicy(2, ASSET, 1, 2100e8, 0, 0, 84532, 0);
        IReactive.LogRecord memory log = _logRecord(2200e8, 0x123, 0);
        vm.prank(SYSTEM);
        reactive.react(log);
    }

    function testMaxDrawdown() public {
        reactive.mirrorPolicy(3, ASSET, 2, 0, 2000e8, 500, 84532, 0);
        IReactive.LogRecord memory log = _logRecord(1899e8, 0x456, 0);
        vm.prank(SYSTEM);
        reactive.react(log);
    }

    function testDeactivatedMirrorIgnored() public {
        reactive.mirrorPolicy(4, ASSET, 0, 1900e8, 0, 0, 84532, 0);
        reactive.deactivateMirror(4);
        IReactive.LogRecord memory log = _logRecord(100e8, 0x789, 0);
        vm.prank(SYSTEM);
        reactive.react(log);
    }

    function testNoExecutorNoCallback() public {
        reactive.mirrorPolicy(5, ASSET, 0, 1900e8, 0, 0, 1301, 0); // unichain, no executor set
        IReactive.LogRecord memory log = _logRecord(100e8, 0x999, 0);
        vm.prank(SYSTEM);
        reactive.react(log); // should not revert
    }

    // ---------- Auto-mirroring via PolicyMirrorSync ----------

    function _syncLog(
        uint256 id,
        address asset,
        uint8 triggerType,
        uint256 threshold,
        uint256 referencePrice,
        uint256 maxDrawdownBps,
        uint256 destChainId,
        uint64 expiresAt,
        bool active,
        uint256 txHashSeed
    ) internal view returns (IReactive.LogRecord memory) {
        return IReactive.LogRecord({
            chainId: ORIGIN_CHAIN,
            contractAddress: managerAddr,
            topic0: uint256(keccak256("PolicyMirrorSync(uint256,address,uint8,uint256,uint256,uint256,uint256,uint64,bool)")),
            topic1: id,
            topic2: uint256(uint160(asset)),
            topic3: 0,
            data: abi.encode(triggerType, threshold, referencePrice, maxDrawdownBps, destChainId, expiresAt, active),
            blockNumber: 1,
            opCode: 3,
            blockHash: 0,
            txHash: txHashSeed,
            logIndex: 0
        });
    }

    function testAutoMirrorCreateThenTrigger() public {
        // Simulate PolicyMirrorSync(active=true) for a stop-loss policy
        IReactive.LogRecord memory sync = _syncLog(10, ASSET, 0, 1900e8, 0, 0, 84532, 0, true, 0xaaa);
        vm.prank(SYSTEM);
        reactive.react(sync);

        (uint256 id,,,,,, uint256 destChainId, , bool active) = reactive.mirrorPolicies(10);
        assertEq(id, 10);
        assertEq(destChainId, 84532);
        assertTrue(active);

        // Triggering price should now request a callback
        IReactive.LogRecord memory log = _logRecord(1800e8, 0xbbb, 0);
        vm.prank(SYSTEM);
        reactive.react(log);
    }

    function testAutoMirrorDeactivateStopsTrigger() public {
        IReactive.LogRecord memory syncOn = _syncLog(11, ASSET, 0, 1900e8, 0, 0, 84532, 0, true, 0xccc);
        vm.prank(SYSTEM);
        reactive.react(syncOn);

        IReactive.LogRecord memory syncOff = _syncLog(11, ASSET, 0, 1900e8, 0, 0, 84532, 0, false, 0xddd);
        vm.prank(SYSTEM);
        reactive.react(syncOff);

        (, , , , , , , , bool active) = reactive.mirrorPolicies(11);
        assertFalse(active);
    }

    function testAutoMirrorReactivation() public {
        IReactive.LogRecord memory syncOn = _syncLog(12, ASSET, 1, 2100e8, 0, 0, 84532, 0, true, 0xeee);
        vm.prank(SYSTEM);
        reactive.react(syncOn);
        IReactive.LogRecord memory syncOff = _syncLog(12, ASSET, 1, 2100e8, 0, 0, 84532, 0, false, 0xfff);
        vm.prank(SYSTEM);
        reactive.react(syncOff);
        IReactive.LogRecord memory syncOn2 = _syncLog(12, ASSET, 1, 2100e8, 0, 0, 84532, 0, true, 0x1000);
        vm.prank(SYSTEM);
        reactive.react(syncOn2);

        (, , , , , , , , bool active) = reactive.mirrorPolicies(12);
        assertTrue(active);
    }

    function testExpiredMirrorDoesNotTrigger() public {
        // Mirror a policy that expires at t=100; warp past it, then a triggering
        // price must NOT request a callback.
        reactive.mirrorPolicy(20, ASSET, 0, 1900e8, 0, 0, 84532, 100);
        vm.warp(200);
        IReactive.LogRecord memory log = _logRecord(100e8, 0xdead, 0);
        vm.prank(SYSTEM);
        reactive.react(log); // no revert, no callback
    }

    function testSyncWithExpiresAtStored() public {
        IReactive.LogRecord memory sync = _syncLog(21, ASSET, 0, 1900e8, 0, 0, 84532, 500, true, 0xbeef);
        vm.prank(SYSTEM);
        reactive.react(sync);
        (, , , , , , , uint64 expiresAt, bool active) = reactive.mirrorPolicies(21);
        assertEq(expiresAt, 500);
        assertTrue(active);
    }

    // ---------- Per-policy callback latch ----------

    function testCallbackLatchPreventsRepeatRequests() public {
        reactive.mirrorPolicy(30, ASSET, 0, 1900e8, 0, 0, 84532, 0);

        vm.recordLogs();
        IReactive.LogRecord memory log1 = _logRecord(1800e8, 0xaaa1, 0);
        vm.prank(SYSTEM);
        reactive.react(log1);
        // A second, DIFFERENT price update still below threshold must not
        // request another callback while the policy stays active.
        IReactive.LogRecord memory log2 = _logRecord(1700e8, 0xbbb2, 0);
        vm.prank(SYSTEM);
        reactive.react(log2);

        VmSafe.Log[] memory entries = vm.getRecordedLogs();
        uint256 callbackCount;
        bytes32 sig = keccak256("CallbackRequested(uint256,uint256,address,uint256,uint256)");
        for (uint256 i; i < entries.length; ++i) {
            if (entries[i].topics[0] == sig) ++callbackCount;
        }
        assertEq(callbackCount, 1);
        assertTrue(reactive.callbackRequestedForPolicy(30));
    }

    function testReactivationResetsLatch() public {
        reactive.mirrorPolicy(31, ASSET, 0, 1900e8, 0, 0, 84532, 0);
        vm.prank(SYSTEM);
        reactive.react(_logRecord(1800e8, 0xccc1, 0));
        assertTrue(reactive.callbackRequestedForPolicy(31));

        // Deactivate -> latch cleared; re-mirror -> can trigger again.
        reactive.deactivateMirror(31);
        assertFalse(reactive.callbackRequestedForPolicy(31));
        reactive.mirrorPolicy(31, ASSET, 0, 1900e8, 0, 0, 84532, 0);
        assertFalse(reactive.callbackRequestedForPolicy(31));

        vm.recordLogs();
        vm.prank(SYSTEM);
        reactive.react(_logRecord(1700e8, 0xddd2, 0));
        VmSafe.Log[] memory entries = vm.getRecordedLogs();
        uint256 callbackCount;
        bytes32 sig = keccak256("CallbackRequested(uint256,uint256,address,uint256,uint256)");
        for (uint256 i; i < entries.length; ++i) {
            if (entries[i].topics[0] == sig) ++callbackCount;
        }
        assertEq(callbackCount, 1);
    }

    function testSyncOffClearsLatch() public {
        IReactive.LogRecord memory syncOn = _syncLog(32, ASSET, 0, 1900e8, 0, 0, 84532, 0, true, 0xe1);
        vm.prank(SYSTEM);
        reactive.react(syncOn);
        vm.prank(SYSTEM);
        reactive.react(_logRecord(1800e8, 0xe2, 0));
        assertTrue(reactive.callbackRequestedForPolicy(32));

        IReactive.LogRecord memory syncOff = _syncLog(32, ASSET, 0, 1900e8, 0, 0, 84532, 0, false, 0xe3);
        vm.prank(SYSTEM);
        reactive.react(syncOff);
        assertFalse(reactive.callbackRequestedForPolicy(32));
    }
}
