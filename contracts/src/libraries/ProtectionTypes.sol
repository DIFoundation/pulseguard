// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

/// @notice Shared types for PulseGuard protection policies.
library ProtectionTypes {
    enum TriggerType {
        STOP_LOSS, // price <= threshold
        TAKE_PROFIT, // price >= threshold
        MAX_DRAWDOWN, // price <= referencePrice * (10000 - maxDrawdownBps) / 10000
        EMERGENCY // price <= threshold (explicit emergency condition)
    }

    enum PolicyStatus {
        CREATED,
        ACTIVE,
        TRIGGERED,
        EXECUTED,
        CANCELLED,
        EXPIRED,
        FAILED
    }

    enum ProtectionAction {
        PROTECTED_EXIT // move protectedAmount of asset to recipient via vault
    }

    /// @notice Result of ProtectionManager.executePolicy — lets executors avoid
    ///         emitting success events for no-op paths (e.g. expired policies).
    enum ExecutionOutcome {
        EXECUTED, // funds actually moved via protected exit
        EXPIRED // policy was past expiresAt; marked EXPIRED, no funds moved
    }

    struct Policy {
        uint256 id;
        address owner;
        address asset; // protected ERC-20
        address monitoredAsset; // price feed key
        uint256 destinationChainId; // chain the callback executes on
        TriggerType triggerType;
        uint256 threshold; // price, feed decimals
        uint256 referencePrice; // for MAX_DRAWDOWN
        uint256 maxDrawdownBps; // for MAX_DRAWDOWN
        uint256 protectedAmount; // asset amount to protect
        address recipient; // receives protected funds on execution
        ProtectionAction action;
        PolicyStatus status;
        uint64 createdAt;
        uint64 expiresAt; // 0 = no expiry
        uint64 executedAt;
    }
}
