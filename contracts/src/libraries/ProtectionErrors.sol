// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

/// @notice Custom errors for PulseGuard.
library ProtectionErrors {
    error NotOwner();
    error NotExecutor();
    error PolicyNotFound();
    error PolicyNotActive();
    error InvalidStatusTransition();
    error InvalidThreshold();
    error InvalidAmount();
    error InvalidAsset();
    error InvalidRecipient();
    error PolicyExpired();
    error TriggerNotMet();
    error AlreadyExecuted();
    error Paused();
    error ZeroAddress();
    error UnsupportedChain();
    error TooManyPolicies();
    error InvalidPrice();
    error StalePrice();
    error Unauthorized();
}
