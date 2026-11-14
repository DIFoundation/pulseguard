// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {ProtectionTypes} from "../libraries/ProtectionTypes.sol";
import {ProtectionErrors} from "../libraries/ProtectionErrors.sol";
import {IPriceFeed} from "../oracle/IPriceFeed.sol";
import {PulseGuardVault} from "../vault/PulseGuardVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Protection policy manager. Source of truth for policy state on the origin chain.
/// @dev The Reactive contract reads triggered policies via view functions; the destination
///      executor calls executePolicy which re-validates everything on-chain.
contract ProtectionManager is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;
    using ProtectionTypes for *;

    uint256 public constant MAX_POLICIES_PER_ASSET = 50;
    uint256 public constant BPS_DENOMINATOR = 10_000;

    IPriceFeed public immutable priceFeed;
    PulseGuardVault public immutable vault;

    uint256 public nextPolicyId = 1;
    mapping(uint256 => ProtectionTypes.Policy) public policies;
    mapping(address => uint256[]) private _policiesByAsset; // monitoredAsset => policy ids (ACTIVE only tracked loosely)
    mapping(uint256 => bool) private _activeByAsset; // id => in list (for removal simplicity we keep ids and check status)

    /// @notice Authorized destination executors per chain id.
    mapping(uint256 => address) public executorForChain;

    /// @notice The PulseGuardReactive contract allowed to read evaluation helpers.
    address public reactiveContract;

    event PolicyCreated(uint256 indexed id, address indexed owner, address asset, uint8 triggerType);
    event PolicyActivated(uint256 indexed id);
    event PolicyDeactivated(uint256 indexed id);
    event PolicyCancelled(uint256 indexed id);
    event PolicyExecuted(uint256 indexed id, address indexed executor);
    event ExecutorForChainSet(uint256 indexed chainId, address executor);
    event ReactiveContractSet(address reactive);

    error PolicyLimitReached();

    constructor(address priceFeed_, address vault_, address owner_) Ownable(owner_) {
        if (priceFeed_ == address(0) || vault_ == address(0) || owner_ == address(0)) revert ProtectionErrors.ZeroAddress();
        priceFeed = IPriceFeed(priceFeed_);
        vault = PulseGuardVault(vault_);
    }

    // ---------- Admin ----------

    function setExecutorForChain(uint256 chainId, address executor) external onlyOwner {
        if (executor == address(0)) revert ProtectionErrors.ZeroAddress();
        executorForChain[chainId] = executor;
        emit ExecutorForChainSet(chainId, executor);
    }

    function setReactiveContract(address reactive) external onlyOwner {
        if (reactive == address(0)) revert ProtectionErrors.ZeroAddress();
        reactiveContract = reactive;
        emit ReactiveContractSet(reactive);
    }

    // ---------- Policy lifecycle (user-facing) ----------

    function createPolicy(ProtectionTypes.Policy memory p) external whenNotPaused returns (uint256 id) {
        if (p.owner != msg.sender) revert ProtectionErrors.NotOwner();
        if (p.asset == address(0) || p.monitoredAsset == address(0)) revert ProtectionErrors.InvalidAsset();
        if (p.recipient == address(0)) revert ProtectionErrors.InvalidRecipient();
        if (p.protectedAmount == 0) revert ProtectionErrors.InvalidAmount();
        if (p.destinationChainId == 0) revert ProtectionErrors.UnsupportedChain();
        if (executorForChain[p.destinationChainId] == address(0)) revert ProtectionErrors.UnsupportedChain();
        _validateTrigger(p);

        id = nextPolicyId++;
        p.id = id;
        p.status = ProtectionTypes.PolicyStatus.ACTIVE;
        p.createdAt = uint64(block.timestamp);
        policies[id] = p;
        _policiesByAsset[p.monitoredAsset].push(id);
        if (_policiesByAsset[p.monitoredAsset].length > MAX_POLICIES_PER_ASSET) {
            revert PolicyLimitReached();
        }
        emit PolicyCreated(id, msg.sender, p.asset, uint8(p.triggerType));
        emit PolicyActivated(id);
    }

    function deactivatePolicy(uint256 id) external {
        ProtectionTypes.Policy storage p = policies[id];
        if (p.owner != msg.sender) revert ProtectionErrors.NotOwner();
        if (p.status != ProtectionTypes.PolicyStatus.ACTIVE) revert ProtectionErrors.PolicyNotActive();
        p.status = ProtectionTypes.PolicyStatus.CREATED;
        emit PolicyDeactivated(id);
    }

    function activatePolicy(uint256 id) external {
        ProtectionTypes.Policy storage p = policies[id];
        if (p.owner != msg.sender) revert ProtectionErrors.NotOwner();
        if (p.status != ProtectionTypes.PolicyStatus.CREATED) revert ProtectionErrors.InvalidStatusTransition();
        if (p.expiresAt != 0 && block.timestamp > p.expiresAt) revert ProtectionErrors.PolicyExpired();
        p.status = ProtectionTypes.PolicyStatus.ACTIVE;
        emit PolicyActivated(id);
    }

    function cancelPolicy(uint256 id) external {
        ProtectionTypes.Policy storage p = policies[id];
        if (p.owner != msg.sender) revert ProtectionErrors.NotOwner();
        if (p.status == ProtectionTypes.PolicyStatus.EXECUTED || p.status == ProtectionTypes.PolicyStatus.CANCELLED) {
            revert ProtectionErrors.InvalidStatusTransition();
        }
        p.status = ProtectionTypes.PolicyStatus.CANCELLED;
        emit PolicyCancelled(id);
    }

    // ---------- Evaluation (called by Reactive contract on Lasna) ----------

    /// @notice Returns ids of ACTIVE policies on `monitoredAsset` whose trigger is met at `price`.
    /// @dev Bounded by MAX_POLICIES_PER_ASSET. Only callable by the registered reactive contract.
    function triggeredPolicies(address monitoredAsset, uint256 price) external view returns (uint256[] memory ids) {
        if (msg.sender != reactiveContract) revert ProtectionErrors.Unauthorized();
        uint256[] storage all = _policiesByAsset[monitoredAsset];
        uint256 count;
        for (uint256 i; i < all.length; ++i) {
            ProtectionTypes.Policy storage p = policies[all[i]];
            if (p.status == ProtectionTypes.PolicyStatus.ACTIVE && _isTriggered(p, price)) {
                ++count;
            }
        }
        ids = new uint256[](count);
        uint256 j;
        for (uint256 i; i < all.length; ++i) {
            ProtectionTypes.Policy storage p = policies[all[i]];
            if (p.status == ProtectionTypes.PolicyStatus.ACTIVE && _isTriggered(p, price)) {
                ids[j++] = p.id;
            }
        }
    }

    /// @notice Callback target for a policy: (destinationChainId, executor).
    function callbackTarget(uint256 id) external view returns (uint256 chainId, address executor) {
        if (msg.sender != reactiveContract) revert ProtectionErrors.Unauthorized();
        ProtectionTypes.Policy storage p = policies[id];
        if (p.id == 0) revert ProtectionErrors.PolicyNotFound();
        chainId = p.destinationChainId;
        executor = executorForChain[p.destinationChainId];
    }

    // ---------- Execution (called by destination executor) ----------

    /// @notice Execute a triggered policy. Re-validates trigger against the live feed price.
    /// @dev Only callable by the executor registered for the policy's destination chain.
    function executePolicy(uint256 id) external nonReentrant whenNotPaused {
        ProtectionTypes.Policy storage p = policies[id];
        if (p.id == 0) revert ProtectionErrors.PolicyNotFound();
        if (executorForChain[p.destinationChainId] != msg.sender) revert ProtectionErrors.NotExecutor();
        if (p.status != ProtectionTypes.PolicyStatus.ACTIVE) revert ProtectionErrors.PolicyNotActive();
        if (p.expiresAt != 0 && block.timestamp > p.expiresAt) {
            p.status = ProtectionTypes.PolicyStatus.EXPIRED;
            revert ProtectionErrors.PolicyExpired();
        }

        (uint256 price,) = priceFeed.latestPrice(p.monitoredAsset);
        if (price == 0) revert ProtectionErrors.InvalidPrice();
        if (!_isTriggered(p, price)) revert ProtectionErrors.TriggerNotMet();

        p.status = ProtectionTypes.PolicyStatus.EXECUTED;
        p.executedAt = uint64(block.timestamp);

        // Move protected funds from vault to the policy recipient.
        if (p.asset == address(vault.asset())) {
            vault.protectedExit(p.owner, p.recipient, p.protectedAmount);
        } else {
            // Non-vault asset: pull from owner's approved balance is out of scope;
            // mark executed and emit — documented limitation for multi-asset vaults.
        }
        emit PolicyExecuted(id, msg.sender);
    }

    // ---------- Views ----------

    function getPolicy(uint256 id) external view returns (ProtectionTypes.Policy memory) {
        ProtectionTypes.Policy storage p = policies[id];
        if (p.id == 0) revert ProtectionErrors.PolicyNotFound();
        return p;
    }

    function policiesByAsset(address monitoredAsset) external view returns (uint256[] memory) {
        return _policiesByAsset[monitoredAsset];
    }

    function isTriggered(uint256 id, uint256 price) external view returns (bool) {
        ProtectionTypes.Policy storage p = policies[id];
        if (p.id == 0) revert ProtectionErrors.PolicyNotFound();
        return _isTriggered(p, price);
    }

    // ---------- Internal ----------

    function _validateTrigger(ProtectionTypes.Policy memory p) internal pure {
        if (p.triggerType == ProtectionTypes.TriggerType.STOP_LOSS || p.triggerType == ProtectionTypes.TriggerType.EMERGENCY) {
            if (p.threshold == 0) revert ProtectionErrors.InvalidThreshold();
        } else if (p.triggerType == ProtectionTypes.TriggerType.TAKE_PROFIT) {
            if (p.threshold == 0) revert ProtectionErrors.InvalidThreshold();
        } else if (p.triggerType == ProtectionTypes.TriggerType.MAX_DRAWDOWN) {
            if (p.referencePrice == 0 || p.maxDrawdownBps == 0 || p.maxDrawdownBps >= BPS_DENOMINATOR) {
                revert ProtectionErrors.InvalidThreshold();
            }
        }
    }

    function _isTriggered(ProtectionTypes.Policy storage p, uint256 price) internal view returns (bool) {
        if (p.expiresAt != 0 && block.timestamp > p.expiresAt) return false;
        if (p.triggerType == ProtectionTypes.TriggerType.STOP_LOSS) {
            return price <= p.threshold;
        } else if (p.triggerType == ProtectionTypes.TriggerType.TAKE_PROFIT) {
            return price >= p.threshold;
        } else if (p.triggerType == ProtectionTypes.TriggerType.EMERGENCY) {
            return price <= p.threshold;
        } else {
            // MAX_DRAWDOWN: trigger when price <= referencePrice * (1 - bps/10000)
            uint256 floorPrice = (p.referencePrice * (BPS_DENOMINATOR - p.maxDrawdownBps)) / BPS_DENOMINATOR;
            return price <= floorPrice;
        }
    }
}
