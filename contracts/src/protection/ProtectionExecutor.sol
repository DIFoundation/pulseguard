// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {IPayable} from "@reactive/src/interfaces/IPayable.sol";
import {AbstractCallback} from "@reactive/src/base/AbstractCallback.sol";
import {ProtectionManager} from "./ProtectionManager.sol";

/// @notice Destination-chain executor for same-chain (Base Sepolia) protection.
/// @dev Receives authenticated callbacks from PulseGuardReactive via the callback proxy.
///      Re-validates the policy on-chain before executing — the reactive contract is not trusted.
contract ProtectionExecutor is AbstractCallback {
    ProtectionManager public immutable manager;

    event ProtectionExecuted(uint256 indexed policyId, address indexed reactive);
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
        manager.executePolicy(policyId);
        emit ProtectionExecuted(policyId, reactive_);
    }

    /// @notice Settle any outstanding proxy debt from this contract's balance.
    function coverDebt() external {
        _coverDebt();
    }
}
