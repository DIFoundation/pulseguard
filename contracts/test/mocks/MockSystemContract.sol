// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {ISystemContract} from "@reactive/src/interfaces/ISystemContract.sol";

/// @dev Minimal mock of the Reactive system contract for local Foundry tests.
///      Etch its runtime code at 0x8888888888888888888888888888888888888888.
contract MockSystemContract is ISystemContract {
    event Subscribed(uint256 chainId, address contract_, uint256 topic0);
    event CallbackRequested(uint256 chainId, address recipient, uint64 gasLimit, bytes payload);

    function subscribe(uint256 chainId_, address contract_, uint256 topic0_, uint256, uint256, uint256) external {
        emit Subscribed(chainId_, contract_, topic0_);
    }

    function unsubscribe(uint256, address, uint256, uint256, uint256, uint256) external {}

    function requestCallback(CallbackVersion, bytes memory) external {}

    function requestCallbackV_1_0(CallbackConfiguration_V_1_0 memory config_) external {
        emit CallbackRequested(config_.chainId, config_.recipient, config_.gasLimit, config_.payload);
    }

    function debt(address) external pure returns (uint256) { return 0; }
    receive() external payable {}
}
