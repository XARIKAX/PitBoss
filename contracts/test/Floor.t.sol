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
}
