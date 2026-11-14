// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {IPayable} from "@reactive/src/interfaces/IPayable.sol";
import {AbstractCallback} from "@reactive/src/base/AbstractCallback.sol";

/// @notice Cross-chain demonstration executor (e.g., Unichain Sepolia).
/// @dev Records protection events on a destination chain that does NOT hold the vault.
///      This proves genuine cross-chain event-driven execution; it never moves Base assets.
contract CrossChainExecutor is AbstractCallback {
    struct ProtectionRecord {
        uint256 policyId;
        uint256 price;
        uint256 timestamp;
        address reactive;
    }

    ProtectionRecord[] public records;
    mapping(uint256 => bool) public executedPolicies;

    event CrossChainProtectionRecorded(uint256 indexed policyId, uint256 price, address indexed reactive);

    constructor(IPayable callbackProxy_, address callbackSender_) payable AbstractCallback(callbackProxy_, callbackSender_) {}

    /// @notice Reactive callback entrypoint. First arg is injected by the proxy.
    function recordProtection(address reactive_, uint256 policyId, uint256 price) external onlyServiceProvider onlyCallbackSender(reactive_) {
        if (executedPolicies[policyId]) return; // idempotent
        executedPolicies[policyId] = true;
        records.push(ProtectionRecord({policyId: policyId, price: price, timestamp: block.timestamp, reactive: reactive_}));
        emit CrossChainProtectionRecorded(policyId, price, reactive_);
    }

    function recordCount() external view returns (uint256) {
        return records.length;
    }

    function coverDebt() external {
        _coverDebt();
    }
}
