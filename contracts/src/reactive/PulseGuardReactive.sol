// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {ISystemContract} from "@reactive/src/interfaces/ISystemContract.sol";
import {IReactive} from "@reactive/src/interfaces/IReactive.sol";
import {AbstractReactive} from "@reactive/src/base/AbstractReactive.sol";

/// @notice PulseGuard Reactive contract (Reactive Omni).
/// @dev Lives on Reactive Lasna. Subscribes to PriceUpdated events on origin chains,
///      evaluates protection policies via ProtectionManager, and requests authenticated
///      callbacks to destination-chain executors.
///
///      IMPORTANT: ProtectionManager is on Base Sepolia (origin chain). Reactive Lasna
///      cannot make synchronous cross-chain view calls. Therefore this contract keeps a
///      local mirror of trigger evaluation: the origin chain's ProtectionManager is the
///      source of truth, and the destination executor re-validates on-chain. To evaluate
///      on Lasna we subscribe to the SAME PriceUpdated events and maintain a local policy
///      registry that the origin chain syncs via `syncPolicy` callbacks... 
///
///      Policies are mirrored automatically: ProtectionManager emits PolicyMirrorSync
///      on every lifecycle transition (create/activate/deactivate/cancel/execute), and
///      this contract subscribes to those events on the origin chain. The destination
///      executor remains the authoritative validator.
contract PulseGuardReactive is AbstractReactive {
    uint64 private constant CALLBACK_GAS_LIMIT = 500_000;

    struct MirrorPolicy {
        uint256 id;
        address monitoredAsset;
        uint8 triggerType; // 0 SL, 1 TP, 2 DD, 3 EMG
        uint256 threshold;
        uint256 referencePrice;
        uint256 maxDrawdownBps;
        uint256 destinationChainId;
        uint64 expiresAt;
        bool active;
    }

    address public owner;
    address public priceFeed; // origin-chain MockPriceFeed (for topic0 only)
    uint256 public originChainId;
    address public manager; // ProtectionManager on origin chain (mirror sync source)

    uint256 public priceTopic0; // PriceUpdated topic0
    uint256 public policySyncTopic0; // PolicyMirrorSync topic0

    mapping(uint256 => MirrorPolicy) public mirrorPolicies;
    mapping(address => uint256[]) private _mirrorByAsset;
    mapping(uint256 => bool) private _mirrorIndexed; // policyId => already in _mirrorByAsset
    mapping(bytes32 => bool) private _callbackRequested;

    event PolicyMirrored(uint256 indexed id, address monitoredAsset);
    event PolicyMirrorRemoved(uint256 indexed id);
    /// @notice `originTxHash`/`originLogIndex` identify the exact PriceUpdated log
    ///         that triggered evaluation — enables precise latency correlation.
    event TriggerEvaluated(uint256 indexed policyId, uint256 price, uint256 originTxHash, uint256 originLogIndex);
    event CallbackRequested(
        uint256 indexed policyId,
        uint256 destinationChainId,
        address recipient,
        uint256 originTxHash,
        uint256 originLogIndex
    );
    event IrrelevantEvent(uint256 chainId, address contractAddress, uint256 topic0);

    error NotOwner();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @param originChainId_       chain where events originate (e.g. Base Sepolia 84532)
    /// @param priceFeed_           origin-chain feed contract to subscribe to
    /// @param priceTopic0_         topic0 of PriceUpdated(address,uint256,uint256)
    /// @param manager_             origin-chain ProtectionManager (mirror sync source)
    /// @param policySyncTopic0_    topic0 of PolicyMirrorSync(uint256,address,uint8,uint256,uint256,uint256,uint256,uint64,bool)
    constructor(
        uint256 originChainId_,
        address priceFeed_,
        uint256 priceTopic0_,
        address manager_,
        uint256 policySyncTopic0_
    ) payable {
        if (priceFeed_ == address(0) || manager_ == address(0)) revert ZeroAddress();
        owner = msg.sender;
        originChainId = originChainId_;
        priceFeed = priceFeed_;
        priceTopic0 = priceTopic0_;
        manager = manager_;
        policySyncTopic0 = policySyncTopic0_;
        _subscribe();
    }

    function _subscribe() internal {
        SYSTEM.subscribe(originChainId, priceFeed, priceTopic0, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
        SYSTEM.subscribe(originChainId, manager, policySyncTopic0, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
    }

    /// @notice Re-register the event subscription. Useful if the constructor-time
    ///         subscribe did not stick (e.g. contract was unfunded at deploy).
    function resubscribe() external onlyOwner {
        _subscribe();
    }

    // ---------- Owner: mirror management ----------

    /// @notice Mirror a policy locally so react() can evaluate it without cross-chain calls.
    /// @dev DEPRECATED: policy mirroring is now automatic via PolicyMirrorSync events
    ///      delivered by the Reactive Network subscription (see _handlePolicySync).
    ///      This owner-only path is retained for manual recovery only; the destination
    ///      executor remains the authoritative validator.
    function mirrorPolicy(
        uint256 id,
        address monitoredAsset,
        uint8 triggerType,
        uint256 threshold,
        uint256 referencePrice,
        uint256 maxDrawdownBps,
        uint256 destinationChainId,
        uint64 expiresAt
    ) external onlyOwner {
        mirrorPolicies[id] = MirrorPolicy({
            id: id,
            monitoredAsset: monitoredAsset,
            triggerType: triggerType,
            threshold: threshold,
            referencePrice: referencePrice,
            maxDrawdownBps: maxDrawdownBps,
            destinationChainId: destinationChainId,
            expiresAt: expiresAt,
            active: true
        });
        if (!_mirrorIndexed[id]) {
            _mirrorIndexed[id] = true;
            _mirrorByAsset[monitoredAsset].push(id);
        }
        emit PolicyMirrored(id, monitoredAsset);
    }

    /// @notice Deactivate a mirrored policy.
    /// @dev DEPRECATED: mirror deactivation is now automatic via PolicyMirrorSync
    ///      events (active=false) delivered by the Reactive Network subscription.
    ///      DEPRECATED: use the automatic PolicyMirrorSync flow instead.
    function deactivateMirror(uint256 id) external onlyOwner {
        mirrorPolicies[id].active = false;
        emit PolicyMirrorRemoved(id);
    }

    function setManager(address manager_) external onlyOwner {
        if (manager_ == address(0)) revert ZeroAddress();
        manager = manager_;
    }

    // ---------- Reactive entrypoint ----------

    /// @inheritdoc IReactive
    function react(LogRecord memory log_) external onlySystem {
        // Policy lifecycle sync from ProtectionManager — update mirror, no callback.
        if (log_.chainId == originChainId && log_.contractAddress == manager && log_.topic0 == policySyncTopic0) {
            _handlePolicySync(log_);
            return;
        }

        // Route on topic0; ignore irrelevant events cheaply.
        if (log_.topic0 != priceTopic0 || log_.chainId != originChainId || log_.contractAddress != priceFeed) {
            emit IrrelevantEvent(log_.chainId, log_.contractAddress, log_.topic0);
            return;
        }

        // PriceUpdated(address indexed asset, uint256 price, uint256 timestamp)
        // opCode == 2 (topic0 + indexed asset); data = abi.encode(price, timestamp)
        if (log_.opCode != 2) return;

        address asset = address(uint160(log_.topic1));
        (uint256 price,) = abi.decode(log_.data, (uint256, uint256));
        if (price == 0) return;

        uint256[] storage ids = _mirrorByAsset[asset];
        for (uint256 i; i < ids.length; ++i) {
            uint256 id = ids[i];
            MirrorPolicy storage mp = mirrorPolicies[id];
            if (!mp.active) continue;
            if (!_isTriggered(mp, price)) continue;

            // Don't burn the dedup slot if no executor is registered — the policy
            // may become deliverable later once setExecutorForChain is called.
            if (executorForChain[mp.destinationChainId] == address(0)) continue;

            bytes32 dedup = keccak256(abi.encode(log_.txHash, log_.logIndex, id));
            if (_callbackRequested[dedup]) continue;
            _callbackRequested[dedup] = true;

            emit TriggerEvaluated(id, price, log_.txHash, log_.logIndex);
            _requestCallback(mp, id, price, log_);
        }
    }

    /// @dev PolicyMirrorSync(uint256 indexed id, address indexed monitoredAsset,
    ///      uint8 triggerType, uint256 threshold, uint256 referencePrice,
    ///      uint256 maxDrawdownBps, uint256 destinationChainId, uint64 expiresAt, bool active)
    ///      opCode == 3 (topic0 + 2 indexed); data = abi.encode(triggerType, threshold,
    ///      referencePrice, maxDrawdownBps, destinationChainId, expiresAt, active)
    function _handlePolicySync(LogRecord memory log_) internal {
        if (log_.opCode != 3) return;

        uint256 id = log_.topic1;
        address monitoredAsset = address(uint160(log_.topic2));
        (
            uint8 triggerType,
            uint256 threshold,
            uint256 referencePrice,
            uint256 maxDrawdownBps,
            uint256 destinationChainId,
            uint64 expiresAt,
            bool active
        ) = abi.decode(log_.data, (uint8, uint256, uint256, uint256, uint256, uint64, bool));

        MirrorPolicy storage mp = mirrorPolicies[id];
        mp.id = id;
        if (active) {
            mp.monitoredAsset = monitoredAsset;
            mp.triggerType = triggerType;
            mp.threshold = threshold;
            mp.referencePrice = referencePrice;
            mp.maxDrawdownBps = maxDrawdownBps;
            mp.destinationChainId = destinationChainId;
            mp.expiresAt = expiresAt;
            mp.active = true;
            if (!_mirrorIndexed[id]) {
                _mirrorIndexed[id] = true;
                _mirrorByAsset[monitoredAsset].push(id);
            }
            emit PolicyMirrored(id, monitoredAsset);
        } else {
            mp.active = false;
            emit PolicyMirrorRemoved(id);
        }
    }

    function _isTriggered(MirrorPolicy storage mp, uint256 price) internal view returns (bool) {
        if (mp.expiresAt != 0 && block.timestamp > mp.expiresAt) return false;
        if (mp.triggerType == 0) return price <= mp.threshold; // STOP_LOSS
        if (mp.triggerType == 1) return price >= mp.threshold; // TAKE_PROFIT
        if (mp.triggerType == 3) return price <= mp.threshold; // EMERGENCY
        // MAX_DRAWDOWN
        uint256 floorPrice = (mp.referencePrice * (10_000 - mp.maxDrawdownBps)) / 10_000;
        return price <= floorPrice;
    }

    function _requestCallback(MirrorPolicy storage mp, uint256 id, uint256 price, LogRecord memory log_) internal {
        // Destination executor is resolved off-chain via ProtectionManager.executorForChain;
        // the reactive contract stores a per-chain recipient map set by owner.
        address recipient = executorForChain[mp.destinationChainId];
        if (recipient == address(0)) return;

        bytes memory payload;
        if (mp.destinationChainId == BASE_SEPOLIA_CHAIN_ID) {
            // ProtectionExecutor.executeProtection(address reactive_, uint256 policyId)
            payload = abi.encodeWithSignature("executeProtection(address,uint256)", address(0), id);
        } else {
            // CrossChainExecutor.recordProtection(address reactive_, uint256 policyId, uint256 price)
            payload = abi.encodeWithSignature("recordProtection(address,uint256,uint256)", address(0), id, price);
        }

        SYSTEM.requestCallbackV_1_0(
            ISystemContract.CallbackConfiguration_V_1_0({
                chainId: mp.destinationChainId,
                recipient: recipient,
                gasLimit: CALLBACK_GAS_LIMIT,
                payload: payload
            })
        );
        emit CallbackRequested(id, mp.destinationChainId, recipient, log_.txHash, log_.logIndex);
    }

    // ---------- Per-chain executor registry ----------

    uint256 public constant BASE_SEPOLIA_CHAIN_ID = 84532;
    mapping(uint256 => address) public executorForChain;

    function setExecutorForChain(uint256 chainId, address executor) external onlyOwner {
        if (executor == address(0)) revert ZeroAddress();
        executorForChain[chainId] = executor;
    }

    // receive() is inherited as payable from AbstractPayer — fund via plain transfer or depositTo().
}
