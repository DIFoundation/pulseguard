// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {IPayable} from "@reactive/src/interfaces/IPayable.sol";
import {AbstractCallback} from "@reactive/src/base/AbstractCallback.sol";
import {ProtectionManager} from "./ProtectionManager.sol";
import {ProtectionTypes} from "../libraries/ProtectionTypes.sol";

/// @notice Destination-chain executor for same-chain (Base Sepolia) protection.
/// @dev Receives authenticated callbacks from PulseGuardReactive via the callback proxy.
///      Re-validates the policy on-chain before executing — the reactive contract is not trusted.
contract ProtectionExecutor is AbstractCallback {
    ProtectionManager public immutable manager;

    event ProtectionExecuted(uint256 indexed policyId, address indexed reactive);
    /// @notice Emitted when a callback was processed but no protection action occurred
    ///         (e.g. the policy had expired). Distinct from ProtectionExecuted so event
    ///         history never claims a vault exit that did not happen.
    event ProtectionNotExecuted(uint256 indexed policyId, address indexed reactive, ProtectionTypes.ExecutionOutcome outcome);
    event CallbackReceived(address indexed reactive, uint256 policyId);

    constructor(IPayable callbackProxy_, address callbackSender_, address manager_)
        payable
        AbstractCallback(callbackProxy_, callbackSender_)
    {
        manager = ProtectionManager(manager_);
    }

    /// @notice Reactive callback entrypoint. First arg is injected by the proxy.
    function executeProtection(address reactive_, uint256 policyId) external onlyServiceProvider onlyCallbackSender(reactive_) {
        emit CallbackReceived(reactive_, policyId);
        ProtectionTypes.ExecutionOutcome outcome = manager.executePolicy(policyId);
        if (outcome == ProtectionTypes.ExecutionOutcome.EXECUTED) {
            emit ProtectionExecuted(policyId, reactive_);
        } else {
            emit ProtectionNotExecuted(policyId, reactive_, outcome);
        }
    }

    /// @notice Settle any outstanding proxy debt from this contract's balance.
    function coverDebt() external {
        _coverDebt();
    }
}
