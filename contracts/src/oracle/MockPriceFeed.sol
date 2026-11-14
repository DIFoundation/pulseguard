// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {IPriceFeed} from "./IPriceFeed.sol";

/// @notice MOCK testnet price feed. Emits PriceUpdated for every accepted update.
/// @dev TESTNET ONLY. Prices are operator-published, not market data.
contract MockPriceFeed is IPriceFeed {
    uint8 public constant DECIMALS = 8;

    event PriceUpdated(address indexed asset, uint256 price, uint256 timestamp);

    mapping(address => uint256) private _prices;
    mapping(address => uint256) private _timestamps;

    mapping(address => bool) public operators;
    address public owner;

    error ZeroPrice();
    error NotOperator();
    error NotOwner();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOperator() {
        if (!operators[msg.sender]) revert NotOperator();
        _;
    }

    constructor(address owner_) {
        if (owner_ == address(0)) revert ZeroPrice();
        owner = owner_;
    }

    function setOperator(address op, bool allowed) external onlyOwner {
        operators[op] = allowed;
    }

    /// @notice Publish a price update. Price must be non-zero, 8 decimals.
    function updatePrice(address asset, uint256 price) external onlyOperator {
        if (price == 0) revert ZeroPrice();
        _prices[asset] = price;
        _timestamps[asset] = block.timestamp;
        emit PriceUpdated(asset, price, block.timestamp);
    }

    function latestPrice(address asset) external view returns (uint256 price, uint256 timestamp) {
        price = _prices[asset];
        timestamp = _timestamps[asset];
    }
}
