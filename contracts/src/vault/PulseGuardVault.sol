// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Non-custodial protection vault. Users deposit a single supported ERC-20.
/// @dev Protected exits can only be initiated by the registered ProtectionExecutor,
///      and funds always go to the policy's pre-configured recipient — never arbitrary.
contract PulseGuardVault is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable asset;

    mapping(address => uint256) public balances; // user => asset amount
    uint256 public totalDeposits;

    /// @notice Address allowed to trigger protected exits (ProtectionExecutor).
    address public executor;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event ProtectedExit(address indexed user, address indexed recipient, uint256 amount);
    event ExecutorUpdated(address indexed executor);

    error ZeroAmount();
    error InsufficientBalance();
    error NotExecutor();
    error ZeroAddress();

    modifier onlyExecutor() {
        if (msg.sender != executor) revert NotExecutor();
        _;
    }

    constructor(address asset_, address owner_) Ownable(owner_) {
        if (asset_ == address(0) || owner_ == address(0)) revert ZeroAddress();
        asset = IERC20(asset_);
    }

    function setExecutor(address executor_) external onlyOwner {
        if (executor_ == address(0)) revert ZeroAddress();
        executor = executor_;
        emit ExecutorUpdated(executor_);
    }

    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        asset.safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender] += amount;
        totalDeposits += amount;
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        if (balances[msg.sender] < amount) revert InsufficientBalance();
        balances[msg.sender] -= amount;
        totalDeposits -= amount;
        asset.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Executor-only: move `amount` of `user`'s protected balance to `recipient`.
    /// @dev Called by ProtectionExecutor after policy validation. Funds never go to executor.
    function protectedExit(address user, address recipient, uint256 amount) external onlyExecutor nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (recipient == address(0)) revert ZeroAddress();
        if (balances[user] < amount) revert InsufficientBalance();
        balances[user] -= amount;
        totalDeposits -= amount;
        asset.safeTransfer(recipient, amount);
        emit ProtectedExit(user, recipient, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
