// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {FreeMintPass} from "../src/nft/FreeMintPass.sol";
import {PitBoss} from "../src/nft/PitBoss.sol";
import {PitBossAccount} from "../src/tba/PitBossAccount.sol";
import {InitializingRegistry} from "../src/tba/InitializingRegistry.sol";

contract FreeMintPassTest is Test {
    PitBoss internal boss;
    FreeMintPass internal pass;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        InitializingRegistry registry = new InitializingRegistry(address(new PitBossAccount()));
        boss = new PitBoss(address(registry), address(this));
        pass = new FreeMintPass(address(boss));
        boss.setMinter(address(pass), true);
    }

    function test_SingleMint() public {
        vm.prank(alice);
        pass.mint();
        assertEq(boss.balanceOf(alice), 1, "one boss minted");
        assertEq(pass.mintedBy(alice), 1, "allowance tracked");
        assertEq(pass.remainingOf(alice), 9, "nine left");
    }

    function test_BatchMint_UpToTen() public {
        vm.prank(alice);
        pass.mint(10);
        assertEq(boss.balanceOf(alice), 10, "ten bosses in one tx");
        assertEq(pass.remainingOf(alice), 0, "allowance spent");
    }

    function test_WalletCap_Enforced() public {
        vm.startPrank(alice);
        pass.mint(7);
        vm.expectRevert(FreeMintPass.WalletLimit.selector);
        pass.mint(4); // 7 + 4 > 10
        pass.mint(3); // exactly to the cap is fine
        vm.expectRevert(FreeMintPass.WalletLimit.selector);
        pass.mint();
        vm.stopPrank();
        assertEq(boss.balanceOf(alice), 10, "capped at ten");

        // Cap is per wallet, not global.
        vm.prank(bob);
        pass.mint(2);
        assertEq(boss.balanceOf(bob), 2, "fresh wallet unaffected");
    }

    function test_InvalidCounts_Revert() public {
        vm.startPrank(alice);
        vm.expectRevert(FreeMintPass.InvalidCount.selector);
        pass.mint(0);
        vm.expectRevert(FreeMintPass.InvalidCount.selector);
        pass.mint(11);
        vm.stopPrank();
    }

    function test_Closed_Reverts() public {
        pass.setOpen(false);
        vm.prank(alice);
        vm.expectRevert(FreeMintPass.MintClosed.selector);
        pass.mint(1);
    }
}
