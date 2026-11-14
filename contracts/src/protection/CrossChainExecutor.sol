// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {IPayable} from "@reactive/src/interfaces/IPayable.sol";
import {AbstractCallback} from "@reactive/src/base/AbstractCallback.sol";

/// @notice Cross-chain attestation executor (e.g., Unichain Sepolia).
/// @dev Records a verifiable attestation that a protection event fired on the origin chain.
///      This proves genuine cross-chain event-driven execution; asset movement happens
///      on the origin chain via ProtectionExecutor. The attestation hash commits to
///      (policyId, price, timestamp, reactive) so third parties can verify the record.
contract CrossChainExecutor is AbstractCallback {
    struct ProtectionRecord {
        uint256 policyId;
        uint256 price;
        uint256 timestamp;
        address reactive;
        bytes32 attestation;
    }

    ProtectionRecord[] public records;
    mapping(uint256 => bool) public executedPolicies;
    /// @notice policyId => records index + 1 (0 = not recorded).
    mapping(uint256 => uint256) public recordIndex;

    event CrossChainProtectionRecorded(uint256 indexed policyId, uint256 price, address indexed reactive, bytes32 attestation);

    error RecordNotFound();

    constructor(IPayable callbackProxy_, address callbackSender_) payable AbstractCallback(callbackProxy_, callbackSender_) {}

    /// @notice Reactive callback entrypoint. First arg is injected by the proxy.
    function recordProtection(address reactive_, uint256 policyId, uint256 price) external onlyServiceProvider onlyCallbackSender(reactive_) {
        if (executedPolicies[policyId]) return; // idempotent
        executedPolicies[policyId] = true;

        bytes32 attestation = keccak256(abi.encode(policyId, price, block.timestamp, reactive_));
        records.push(ProtectionRecord({
            policyId: policyId,
            price: price,
            timestamp: block.timestamp,
            reactive: reactive_,
            attestation: attestation
        }));
        recordIndex[policyId] = records.length; // 1-based
        emit CrossChainProtectionRecorded(policyId, price, reactive_, attestation);
    }

    function recordCount() external view returns (uint256) {
        return records.length;
    }

    /// @notice Fetch the attestation record for a policy. Reverts if none exists.
    function getRecord(uint256 policyId) external view returns (ProtectionRecord memory) {
        uint256 idx = recordIndex[policyId];
        if (idx == 0) revert RecordNotFound();
        return records[idx - 1];
    }

    /// @notice Recompute the attestation hash for a stored record to verify integrity.
    function verifyAttestation(uint256 policyId) external view returns (bool) {
        uint256 idx = recordIndex[policyId];
        if (idx == 0) return false;
        ProtectionRecord storage r = records[idx - 1];
        return keccak256(abi.encode(r.policyId, r.price, r.timestamp, r.reactive)) == r.attestation;
    }

    function coverDebt() external {
        _coverDebt();
    }
}
