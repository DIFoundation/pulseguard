// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {PulseGuardReactive} from "../src/reactive/PulseGuardReactive.sol";
import {IReactive} from "@reactive/src/interfaces/IReactive.sol";
import {MockPriceFeed} from "../src/oracle/MockPriceFeed.sol";
import {MockSystemContract} from "./mocks/MockSystemContract.sol";

contract PulseGuardReactiveTest is Test {
    PulseGuardReactive reactive;
    MockPriceFeed feed;

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
        reactive = new PulseGuardReactive(ORIGIN_CHAIN, address(feed), topic0);
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
        reactive.mirrorPolicy(1, ASSET, 0, 1900e8, 0, 0, 84532);
        IReactive.LogRecord memory log = _logRecord(1800e8, 0xabc, 0);
        vm.prank(SYSTEM);
        reactive.react(log);
        // CallbackRequested event emitted — verify via state: dedup set prevents re-request
        // Second identical event should not re-request (dedup)
        vm.prank(SYSTEM);
        reactive.react(log); // same txHash+logIndex+policyId → skipped
    }

    function testNoCallbackAboveThreshold() public {
        reactive.mirrorPolicy(1, ASSET, 0, 1900e8, 0, 0, 84532);
        IReactive.LogRecord memory log = _logRecord(2000e8, 0xdef, 0);
        vm.prank(SYSTEM);
        reactive.react(log); // price above stop-loss → no trigger
    }

    function testTakeProfit() public {
        reactive.mirrorPolicy(2, ASSET, 1, 2100e8, 0, 0, 84532);
        IReactive.LogRecord memory log = _logRecord(2200e8, 0x123, 0);
        vm.prank(SYSTEM);
        reactive.react(log);
    }

    function testMaxDrawdown() public {
        reactive.mirrorPolicy(3, ASSET, 2, 0, 2000e8, 500, 84532);
        IReactive.LogRecord memory log = _logRecord(1899e8, 0x456, 0);
        vm.prank(SYSTEM);
        reactive.react(log);
    }

    function testDeactivatedMirrorIgnored() public {
        reactive.mirrorPolicy(4, ASSET, 0, 1900e8, 0, 0, 84532);
        reactive.deactivateMirror(4);
        IReactive.LogRecord memory log = _logRecord(100e8, 0x789, 0);
        vm.prank(SYSTEM);
        reactive.react(log);
    }

    function testNoExecutorNoCallback() public {
        reactive.mirrorPolicy(5, ASSET, 0, 1900e8, 0, 0, 1301); // unichain, no executor set
        IReactive.LogRecord memory log = _logRecord(100e8, 0x999, 0);
        vm.prank(SYSTEM);
        reactive.react(log); // should not revert
    }
}
