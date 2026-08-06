// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {LiquidityLocker} from "../src/locker/LiquidityLocker.sol";
import {MockPoolDeployer} from "../src/mocks/MockPoolDeployer.sol";

contract LockerTest is TestBase {
    address internal lp = makeAddr("lp");

    function setUp() public {
        deploySystem();
        vm.deal(lp, 10 ether);
    }

    /// @dev Mint a mock V3 position to `lp` via the pool deployer (acts as the
    ///      position manager) and return its id.
    function _mintPosition(uint256 amount) internal returns (uint256 positionId) {
        stock.mint(lp, amount);
        vm.startPrank(lp);
        stock.approve(address(poolDeployer), amount);
        (, positionId) = poolDeployer.deployPoolAndMint(address(stock), address(0), amount);
        vm.stopPrank();
    }

    /// @dev Invariant #5a: a hard lock's principal cannot be released before the
    ///      window elapses; can after.
    function test_HardLock_WindowEnforced() public {
        uint256 pid = _mintPosition(1_000 ether);
        vm.startPrank(lp);
        poolDeployer.approve(address(locker), pid);
        uint256 lockId = locker.lock(
            address(poolDeployer), pid, LiquidityLocker.Style.Hard, LiquidityLocker.FeeMode.FeeShare, 30 days
        );

        vm.expectRevert(); // WindowNotElapsed
        locker.release(lockId);

        vm.warp(block.timestamp + 30 days + 1);
        locker.release(lockId);
        vm.stopPrank();
        assertEq(poolDeployer.ownerOf(pid), lp, "position returned after window");
    }

    /// @dev Invariant #5b: a permanent lock can NEVER be released.
    function test_PermanentLock_NeverReleasable() public {
        uint256 pid = _mintPosition(1_000 ether);
        vm.startPrank(lp);
        poolDeployer.approve(address(locker), pid);
        uint256 lockId = locker.lock(
            address(poolDeployer), pid, LiquidityLocker.Style.Permanent, LiquidityLocker.FeeMode.FeeShare, 0
        );

        vm.expectRevert(); // PermanentLock
        locker.release(lockId);

        // Even far in the future.
        vm.warp(block.timestamp + 3650 days);
        vm.expectRevert();
        locker.release(lockId);
        vm.stopPrank();
    }

    /// @dev Only the lock-NFT holder can collect/release; no admin path to principal.
    function test_OnlyHolderControls() public {
        uint256 pid = _mintPosition(1_000 ether);
        vm.startPrank(lp);
        poolDeployer.approve(address(locker), pid);
        uint256 lockId = locker.lock(
            address(poolDeployer), pid, LiquidityLocker.Style.Hard, LiquidityLocker.FeeMode.FeeShare, 1 days
        );
        vm.stopPrank();

        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert();
        locker.collectFees(lockId);
    }

    /// @dev Upfront fee mode routes the ETH lock fee to the House Book.
    function test_UpfrontFeeToHouseBook() public {
        uint256 pid = _mintPosition(500 ether);
        uint256 bookBefore = address(book).balance;
        vm.startPrank(lp);
        poolDeployer.approve(address(locker), pid);
        locker.lock{value: locker.upfrontFee()}(
            address(poolDeployer), pid, LiquidityLocker.Style.Hard, LiquidityLocker.FeeMode.Upfront, 1 days
        );
        vm.stopPrank();
        assertEq(address(book).balance - bookBefore, locker.upfrontFee(), "upfront fee to book");
    }
}
