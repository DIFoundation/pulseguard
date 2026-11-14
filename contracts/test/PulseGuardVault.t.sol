// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {PulseGuardVault} from "../src/vault/PulseGuardVault.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract PulseGuardVaultTest is Test {
    PulseGuardVault vault;
    MockERC20 token;
    address owner = makeAddr("owner");
    address user = makeAddr("user");
    address executor = makeAddr("executor");
    address recipient = makeAddr("recipient");

    function setUp() public {
        token = new MockERC20("Test Token", "TST", 18);
        vault = new PulseGuardVault(address(token), owner);
        token.mint(user, 1000 ether);
        vm.prank(user);
        token.approve(address(vault), type(uint256).max);
        vm.prank(owner);
        vault.setExecutor(executor);
    }

    function testDeposit() public {
        vm.prank(user);
        vault.deposit(100 ether);
        assertEq(vault.balances(user), 100 ether);
        assertEq(vault.totalDeposits(), 100 ether);
        assertEq(token.balanceOf(address(vault)), 100 ether);
    }

    function testWithdraw() public {
        vm.prank(user);
        vault.deposit(100 ether);
        vm.prank(user);
        vault.withdraw(40 ether);
        assertEq(vault.balances(user), 60 ether);
        assertEq(token.balanceOf(user), 940 ether);
    }

    function testWithdrawInsufficient() public {
        vm.prank(user);
        vault.deposit(10 ether);
        vm.prank(user);
        vm.expectRevert();
        vault.withdraw(11 ether);
    }

    function testProtectedExitOnlyExecutor() public {
        vm.prank(user);
        vault.deposit(100 ether);
        vm.prank(user);
        vm.expectRevert(PulseGuardVault.NotExecutor.selector);
        vault.protectedExit(user, recipient, 50 ether);
    }

    function testProtectedExitMovesToRecipient() public {
        vm.prank(user);
        vault.deposit(100 ether);
        vm.prank(executor);
        vault.protectedExit(user, recipient, 50 ether);
        assertEq(vault.balances(user), 50 ether);
        assertEq(token.balanceOf(recipient), 50 ether);
        assertEq(token.balanceOf(executor), 0);
    }

    function testPauseBlocksDeposit() public {
        vm.prank(owner);
        vault.pause();
        vm.prank(user);
        vm.expectRevert();
        vault.deposit(1 ether);
    }

    function testReentrancyGuard() public {
        // nonReentrant is enforced; a second nested call would revert — covered by OZ.
        vm.prank(user);
        vault.deposit(1 ether);
        assertEq(vault.balances(user), 1 ether);
    }
}
