// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {IHouseBook} from "../src/interfaces/IHouseBook.sol";

contract HouseBookTest is TestBase {
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        deploySystem();
    }

    /// @dev Invariant #4: address balance == bar + owed at all times.
    function _assertBalanceIdentity() internal view {
        assertEq(address(book).balance, book.bar() + book.owed(), "balance == bar + owed");
    }

    /// @dev Accounting: Σ per-source == total ETH ever paid in (cumulative).
    function test_PerSourceAccountingSumsToInflow() public {
        vm.deal(address(this), 10 ether);
        book.payFee{value: 1 ether}(IHouseBook.Source.PitEdge);
        book.payFee{value: 2 ether}(IHouseBook.Source.CertFees);
        book.payFee{value: 3 ether}(IHouseBook.Source.LauncherFees);

        uint256 sum;
        for (uint256 i; i <= uint256(type(IHouseBook.Source).max); ++i) {
            sum += book.accruedBySource(IHouseBook.Source(i));
        }
        assertEq(sum, 6 ether, "sum of sources == total in");
        _assertBalanceIdentity();
    }

    /// @dev Invariant #6: crank pays out exactly 100% of the pot (tip + owed credited
    ///      + dust rolled back into bar), and never more than the balance.
    function test_CrankPaysExactly100Percent() public {
        // Two activated Bosses with weight so the pot can be distributed.
        uint256 b1 = buyBoss(alice);
        activateBoss(alice, b1);
        uint256 b2 = buyBoss(bob);
        activateBoss(bob, b2);

        assertGt(book.bookTotalWeight(), 0, "weights mirrored");

        vm.deal(address(this), 10 ether);
        book.payFee{value: 5 ether}(IHouseBook.Source.PitEdge);

        uint256 balBefore = address(book).balance;
        address cranker = makeAddr("cranker");
        uint256 crankerBefore = cranker.balance;

        vm.prank(cranker);
        (uint256 pot, uint256 tip) = book.crank();

        assertEq(pot, 5 ether, "pot == bar");
        assertEq(tip, (5 ether * book.crankTipBps()) / 10_000, "tip is 0.5%");
        assertEq(cranker.balance - crankerBefore, tip, "cranker got the tip");

        // Conservation: tip left; the rest is bar + owed still held.
        assertEq(address(book).balance, balBefore - tip, "only tip left the book");
        _assertBalanceIdentity();

        // Pending across both Bosses equals owed (100% of distributable accounted).
        uint256 p1 = book.pendingOf(b1);
        uint256 p2 = book.pendingOf(b2);
        assertApproxEqAbs(p1 + p2, book.owed(), 2, "pending sums to owed");
    }

    /// @dev Pro-rata: equal-weight Bosses receive equal credit; delivery pushes ETH
    ///      to the TBA and reduces `owed` exactly.
    function test_DeliverPushesToTBAAndReducesOwed() public {
        uint256 b1 = buyBoss(alice);
        activateBoss(alice, b1);
        uint256 b2 = buyBoss(bob);
        activateBoss(bob, b2);

        vm.deal(address(this), 10 ether);
        book.payFee{value: 4 ether}(IHouseBook.Source.PitEdge);
        book.crank();

        uint256 owedBefore = book.owed();
        address tba = boss.accountOf(b1);
        uint256 tbaBefore = tba.balance;

        uint256 amt = book.deliver(b1);
        assertGt(amt, 0, "delivered > 0");
        assertEq(tba.balance - tbaBefore, amt, "ETH pushed to TBA (default election)");
        assertEq(book.owed(), owedBefore - amt, "owed reduced by delivered");
        _assertBalanceIdentity();
    }

    /// @dev Cranking below threshold reverts.
    function test_CrankRevertsBelowThreshold() public {
        vm.deal(address(this), 1 ether);
        book.payFee{value: 0.5 ether}(IHouseBook.Source.PitEdge); // threshold is 1 ether
        vm.expectRevert();
        book.crank();
    }
}
