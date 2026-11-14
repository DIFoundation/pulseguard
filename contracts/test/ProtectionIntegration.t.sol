// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {PulseGuardReactive} from "../src/reactive/PulseGuardReactive.sol";
import {ProtectionExecutor} from "../src/protection/ProtectionExecutor.sol";
import {CrossChainExecutor} from "../src/protection/CrossChainExecutor.sol";
import {ProtectionManager} from "../src/protection/ProtectionManager.sol";
import {ProtectionTypes} from "../src/libraries/ProtectionTypes.sol";
import {MockPriceFeed} from "../src/oracle/MockPriceFeed.sol";
import {PulseGuardVault} from "../src/vault/PulseGuardVault.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockSystemContract} from "./mocks/MockSystemContract.sol";
import {IReactive} from "@reactive/src/interfaces/IReactive.sol";
import {IPayable} from "@reactive/src/interfaces/IPayable.sol";

/// @dev End-to-end simulation: origin event → reactive eval → callback payload → executor.
///      In production the callback is delivered by Reactive Signer via the proxy; here we
///      simulate the proxy call directly to verify the full lifecycle logic.
contract ProtectionIntegrationTest is Test {
    MockPriceFeed feed;
    MockERC20 token;
    PulseGuardVault vault;
    ProtectionManager manager;
    PulseGuardReactive reactive;
    ProtectionExecutor executor;
    CrossChainExecutor uniExecutor;
    MockCallbackProxy proxy;

    address owner = makeAddr("owner");
    address user = makeAddr("user");
    address operator = makeAddr("operator");
    address SYSTEM = 0x8888888888888888888888888888888888888888;
    address reactiveAddr;
    address recipient = makeAddr("recipient");

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
        MockSystemContract mockSystem = new MockSystemContract();
        vm.etch(SYSTEM, address(mockSystem).code);
        proxy = new MockCallbackProxy();

        uint256 topic0 = uint256(keccak256("PriceUpdated(address,uint256,uint256)"));
        uint256 syncTopic0 = uint256(
            keccak256("PolicyMirrorSync(uint256,address,uint8,uint256,uint256,uint256,uint256,bool)")
        );
        reactive = new PulseGuardReactive(BASE_CHAIN, address(feed), topic0, address(manager), syncTopic0);
        reactiveAddr = address(reactive);

        executor = new ProtectionExecutor(IPayable(payable(address(proxy))), reactiveAddr, address(manager));
        uniExecutor = new CrossChainExecutor(IPayable(payable(address(proxy))), reactiveAddr);

        vm.startPrank(owner);
        manager.setExecutorForChain(BASE_CHAIN, address(executor));
        manager.setExecutorForChain(UNI_CHAIN, address(uniExecutor));
        manager.setReactiveContract(reactiveAddr);
        vault.setExecutor(address(manager));
        vm.stopPrank();
        // reactive contract owner is this test contract (deployer)
        reactive.setExecutorForChain(BASE_CHAIN, address(executor));
        reactive.setExecutorForChain(UNI_CHAIN, address(uniExecutor));

        token.mint(user, 100 ether);
        vm.prank(user);
        token.approve(address(vault), type(uint256).max);
        vm.prank(user);
        vault.deposit(100 ether);
    }

    function testFullLifecycle() public {
        // 1. Create stop-loss policy: ref 2000, trigger 1900, protect 10 tokens
        ProtectionTypes.Policy memory p = ProtectionTypes.Policy({
            id: 0, owner: user, asset: address(token), monitoredAsset: ASSET,
            destinationChainId: BASE_CHAIN, triggerType: ProtectionTypes.TriggerType.STOP_LOSS,
            threshold: 1900e8, referencePrice: 0, maxDrawdownBps: 0,
            protectedAmount: 10 ether, recipient: recipient,
            action: ProtectionTypes.ProtectionAction.PROTECTED_EXIT,
            status: ProtectionTypes.PolicyStatus.CREATED, createdAt: 0, expiresAt: 0, executedAt: 0
        });
        vm.prank(user);
        uint256 id = manager.createPolicy(p);

        // 2. Mirror policy on reactive contract via PolicyMirrorSync event (auto-sync path)
        IReactive.LogRecord memory syncLog = IReactive.LogRecord({
            chainId: BASE_CHAIN,
            contractAddress: address(manager),
            topic0: uint256(keccak256("PolicyMirrorSync(uint256,address,uint8,uint256,uint256,uint256,uint256,bool)")),
            topic1: id,
            topic2: uint256(uint160(ASSET)),
            topic3: 0,
            data: abi.encode(uint8(ProtectionTypes.TriggerType.STOP_LOSS), 1900e8, 0, 0, BASE_CHAIN, true),
            blockNumber: 1, opCode: 3, blockHash: 0, txHash: 0xaaa, logIndex: 0
        });
        vm.prank(SYSTEM);
        reactive.react(syncLog);

        // 3. Publish non-triggering price
        vm.prank(operator);
        feed.updatePrice(ASSET, 2000e8);
        IReactive.LogRecord memory log1 = _log(2000e8, 0x111, 0);
        vm.prank(SYSTEM);
        reactive.react(log1);
        // policy still active, no execution
        assertEq(uint8(manager.getPolicy(id).status), uint8(ProtectionTypes.PolicyStatus.ACTIVE));

        // 4. Publish triggering price
        vm.prank(operator);
        feed.updatePrice(ASSET, 1800e8);
        IReactive.LogRecord memory log2 = _log(1800e8, 0x222, 0);
        vm.prank(SYSTEM);
        reactive.react(log2);

        // 5. Simulate destination callback delivery via proxy
        vm.prank(address(proxy));
        executor.executeProtection(reactiveAddr, id);

        // 6. Verify execution
        assertEq(token.balanceOf(recipient), 10 ether);
        assertEq(uint8(manager.getPolicy(id).status), uint8(ProtectionTypes.PolicyStatus.EXECUTED));
    }

    function _log(uint256 price, uint256 txHash, uint256 logIndex) internal view returns (IReactive.LogRecord memory) {
        return IReactive.LogRecord({
            chainId: BASE_CHAIN,
            contractAddress: address(feed),
            topic0: uint256(keccak256("PriceUpdated(address,uint256,uint256)")),
            topic1: uint256(uint160(ASSET)),
            topic2: 0, topic3: 0,
            data: abi.encode(price, block.timestamp),
            blockNumber: 1, opCode: 2, blockHash: 0, txHash: txHash, logIndex: logIndex
        });
    }
}

contract MockCallbackProxy is IPayable {
    function debt(address) external pure returns (uint256) { return 0; }
    receive() external payable {}
}
