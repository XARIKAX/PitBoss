// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./utils/TestBase.sol";

contract FloorTest is TestBase {
    address internal a = makeAddr("a");
    address internal b = makeAddr("b");

    function setUp() public {
        deploySystem();
    }

    /// @dev Invariant #6a: payout weight is bounded by the front-row cap (3.33x base)
    ///      no matter how much score a Boss accrues.
    function test_WeightBoundedByFrontRowCap() public {
        uint256 id = buyBoss(a);
        activateBoss(a, id);

        // Hammer the streak far past the cap saturation point.
        for (uint256 i; i < 60; ++i) {
            vm.warp(block.timestamp + 1 days);
            activation.pokeStreak(id);
        }

        uint256 cap = (floor.BASE_WEIGHT() * floor.FRONT_ROW_CAP_BPS()) / 10_000;
        assertLe(floor.weightOf(id), cap, "weight never exceeds front-row cap");
    }

    /// @dev Invariant #6b: totalWeight == Σ active weights (mirrored exactly in the
    ///      House Book so the crank distributes 100%).
    function test_TotalWeightConsistency() public {
        uint256 id1 = buyBoss(a);
        activateBoss(a, id1);
        uint256 id2 = buyBoss(b);
        activateBoss(b, id2);

        assertEq(floor.totalWeight(), floor.weightOf(id1) + floor.weightOf(id2), "totalWeight == sum of weights");
        assertEq(book.bookTotalWeight(), floor.totalWeight(), "House Book mirror matches floor");
    }

    /// @dev Selling a Boss (true transfer) clears its activation and drops it off the
    ///      payroll on sync.
    function test_TransferClearsActivation() public {
        uint256 id = buyBoss(a);
        activateBoss(a, id);
        assertTrue(activation.isActivated(id), "activated");

        vm.prank(a);
        boss.transferFrom(a, b, id);
        assertFalse(activation.isActivated(id), "activation cleared on transfer");

        activation.syncDeactivate(id);
        assertEq(floor.weightOf(id), 0, "weight removed after sync");
        assertEq(floor.totalWeight(), 0, "totalWeight back to zero");
    }

    /// @dev Free mint: with PRICE_PIT == 0 (the default), buying needs no PIT
    ///      balance and no approval — only the ETH fee, which goes to the book.
    function test_FreeMint_NoTokensNeeded() public {
        assertEq(amm.PRICE_PIT(), 0, "mint is free by default");
        address fresh = makeAddr("fresh");
        vm.deal(fresh, 1 ether);
        assertEq(pit.balanceOf(fresh), 0, "no PIT held");

        uint256 bookBefore = address(book).balance;
        vm.prank(fresh);
        uint256 id = amm.buyNext{value: amm.buyFee()}();

        assertEq(boss.ownerOf(id), fresh, "boss minted to buyer");
        assertEq(pit.balanceOf(address(amm)), 0, "no tokens pulled");
        assertEq(address(book).balance, bookBefore + amm.buyFee(), "ETH fee to book");
    }

    /// @dev Setting a non-zero price re-enables the flat token charge.
    function test_PaidMint_WhenPriceSet() public {
        amm.setPrice(1_000 ether);
        address buyer = makeAddr("payer");
        vm.deal(buyer, 1 ether);

        // No approval → the pull reverts.
        vm.prank(buyer);
        vm.expectRevert();
        amm.buyNext{value: amm.buyFee()}();

        // Funded + approved → charged exactly the price.
        vm.prank(treasury);
        pit.transfer(buyer, 1_000 ether);
        vm.startPrank(buyer);
        pit.approve(address(amm), 1_000 ether);
        uint256 id = amm.buyNext{value: amm.buyFee()}();
        vm.stopPrank();

        assertEq(boss.ownerOf(id), buyer, "boss minted");
        assertEq(pit.balanceOf(address(amm)), 1_000 ether, "flat price charged");
    }

    /// @dev The loan desk is closed while mint is free: lending against freely
    ///      minted collateral would drain the float.
    function test_LoanDeskClosed_WhileMintFree() public {
        uint256 id = buyBoss(a);
        vm.deal(a, 1 ether);
        vm.startPrank(a);
        boss.approve(address(loans), id);
        vm.expectRevert();
        loans.borrow{value: 0.1 ether}(id, 7 days);
        vm.stopPrank();
    }
}
