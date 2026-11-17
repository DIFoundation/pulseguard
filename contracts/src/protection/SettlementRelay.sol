// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {ProtectionManager} from "./ProtectionManager.sol";
import {ProtectionTypes} from "../libraries/ProtectionTypes.sol";

/// @notice Base-side settlement relay for policies whose destination chain only
///         records an attestation (e.g., Unichain CrossChainExecutor).
/// @dev Registered on ProtectionManager as the executor for those chain ids, so
///      `executePolicy` accepts calls relayed through here. Settlement is
///      permissionless but safe: the manager re-validates policy status, expiry,
///      price freshness, and the trigger condition before executing.
contract SettlementRelay {
    ProtectionManager public immutable manager;

    event PolicySettled(uint256 indexed policyId, address indexed caller);
    /// @notice Emitted when settlement was attempted but no execution occurred
    ///         (e.g. the policy had expired on Base before settlement).
    event PolicySettlementSkipped(uint256 indexed policyId, address indexed caller, ProtectionTypes.ExecutionOutcome outcome);

    constructor(address manager_) {
        if (manager_ == address(0)) revert ZeroAddress();
        manager = ProtectionManager(manager_);
    }

    error ZeroAddress();

    /// @notice Settle a triggered policy on Base. Reverts if the trigger is not met.
    function settle(uint256 policyId) external {
        ProtectionTypes.ExecutionOutcome outcome = manager.executePolicy(policyId);
        if (outcome == ProtectionTypes.ExecutionOutcome.EXECUTED) {
            emit PolicySettled(policyId, msg.sender);
        } else {
            emit PolicySettlementSkipped(policyId, msg.sender, outcome);
        }
    }
}
