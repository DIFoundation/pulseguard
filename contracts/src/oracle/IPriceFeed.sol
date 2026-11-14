// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

/// @notice Price feed interface. `asset` is an opaque key (e.g. token address or feed id).
interface IPriceFeed {
    /// @notice Latest price for `asset` in feed decimals (8).
    function latestPrice(address asset) external view returns (uint256 price, uint256 timestamp);
}
