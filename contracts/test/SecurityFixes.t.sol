// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {DegenRoll} from "../src/pit/DegenRoll.sol";
import {LauncherFactory} from "../src/launcher/LauncherFactory.sol";
import {MinerEntropyConductor} from "../src/pit/entropy/MinerEntropyConductor.sol";
import {VRFEntropyConductor} from "../src/pit/entropy/VRFEntropyConductor.sol";
import {MockVRFCoordinator} from "../src/mocks/MockVRFCoordinator.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";

/// @title SecurityFixes
/// @notice Regression tests for the pre-deployment audit fixes: C2 (commit
///         namespacing), C3 (compressBatch gate), C4 (launcher graduation),
///         C5 (Opening Bell bounds/reset), H3 (bankroll dead-shares), H4 (VRF
///         push model).
contract SecurityFixesTest is TestBase {
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;

    function setUp() public {
        deploySystem();
    }

    // ---- C2: a third party cannot occupy a consumer's commitment id ----
    function test_C2_CommitIsNamespacedByCaller() public {
        MinerEntropyConductor c = new MinerEntropyConductor();
        bytes32 id = keccak256("round-1");
        address attacker = makeAddr("attacker");
        address machineAddr = makeAddr("machineAddr");

        // Attacker front-runs and commits the machine's public id.
        vm.prank(attacker);
        c.commit(id, uint64(block.timestamp));

        // The machine can STILL commit the same id — different namespace, no brick.
        vm.prank(machineAddr);
        c.commit(id, uint64(block.timestamp));

        // Each namespace is unique: a repeat commit by the same caller reverts.
        vm.prank(machineAddr);
        vm.expectRevert();
        c.commit(id, uint64(block.timestamp));
    }

    // ---- C3: compressBatch is owner/keeper-gated and once-per-season ----
    function test_C3_CompressBatch_Gated() public {
        uint256 bid = buyBoss(makeAddr("holder"));

        // Not authorized: a random caller cannot compress.
        uint256[] memory ids = new uint256[](1);
        ids[0] = bid;
        vm.prank(makeAddr("griefer"));
        vm.expectRevert();
        season.compressBatch(ids);

        // Owner, but no season has rolled yet -> reverts.
        vm.expectRevert();
        season.compressBatch(ids);

        // Roll a season, then owner can compress; it records the season.
        vm.warp(block.timestamp + season.SEASON_LENGTH());
        season.rollSeason();
        season.compressBatch(ids);
        assertEq(season.lastCompressedSeason(bid), season.seasonIndex(), "compressed this season");

        // A second compress in the same season is a no-op (cannot repeat-halve).
        season.compressBatch(ids); // does not revert, does nothing
        assertEq(season.lastCompressedSeason(bid), season.seasonIndex(), "still same season");
    }

    // ---- C4: launch graduation completes (no ERC721 receiver revert) ----
    function test_C4_GraduationCompletes() public {
        vm.deal(address(this), 200 ether);
        (uint256 lid,) = launcher.createLaunch{value: 0.01 ether}(
            "Acme", "ACME", 1e30, LauncherFactory.Curve.FixedPrice, 1e15, 0, 1 ether
        );
        // Cross the graduation threshold in one buy.
        launcher.buy{value: 2 ether}(lid, 0);

        (,,,,,,, bool graduated,) = launcher.launches(lid);
        assertTrue(graduated, "launch graduated");
        assertGt(launcher.graduationLockId(lid), 0, "graduation lock minted to factory");

        // The lock NFT is sweepable to a treasury.
        address treasuryEOA = makeAddr("treasuryEOA");
        launcher.sweepGraduationLock(lid, treasuryEOA);
    }

    // ---- C5: Opening Bell readyAt is bounded and a stalled draw resets ----
    function test_C5_BellBoundsAndReset() public {
        vm.deal(address(this), 500 ether);
        (uint256 lid,) = launcher.createLaunch{value: 0.01 ether}(
            "Beta", "BETA", 1e30, LauncherFactory.Curve.Bonding, 1e15, 1e9, 1000 ether
        );
        // Fund the bell bar via curve fees (30% of the 1% fee).
        launcher.buy{value: 100 ether}(lid, 0);
        assertGe(bell.bar(), bell.barThreshold(), "bell bar filled");

        // Out-of-bounds reveal delays revert.
        vm.expectRevert();
        bell.commitDraw(uint64(block.timestamp)); // below MIN_REVEAL_DELAY
        vm.expectRevert();
        bell.commitDraw(uint64(block.timestamp + 2 hours)); // above MAX_REVEAL_DELAY

        // A valid commit sticks.
        bell.commitDraw(uint64(block.timestamp + 5 minutes));
        assertTrue(bell.drawCommitted(), "draw committed");

        // Reset before the timeout is rejected.
        vm.expectRevert();
        bell.resetDraw();

        // After the timeout, a stalled (never-fulfilled) draw resets — no permanent freeze.
        vm.warp(block.timestamp + 5 minutes + bell.DRAW_RESET_TIMEOUT() + 1);
        bell.resetDraw();
        assertFalse(bell.drawCommitted(), "draw reset");
    }

    // ---- H3: bankroll dead-shares defeat the first-depositor inflation ----
    function test_H3_DeadSharesAndZeroShareRevert() public {
        MockStockToken stock2 = new MockStockToken("S2", "S2", 18);
        oracle.setEthPerToken(address(stock2), 1e15);
        DegenRoll m2 = DegenRoll(payable(factory.createMachine(address(stock2), creator)));

        // First staker: a dust seed reverts.
        address a = makeAddr("a");
        uint256 aid = buyBoss(a);
        activateBoss(a, aid);
        stock2.mint(a, 500);
        vm.startPrank(a);
        stock2.approve(address(m2), 500);
        vm.expectRevert(); // amount <= DEAD_SHARES
        m2.stakeBankroll(aid, 500);
        vm.stopPrank();

        // A real first stake locks DEAD_SHARES to the dead address.
        stock2.mint(a, 2000);
        vm.startPrank(a);
        stock2.approve(address(m2), 2000);
        m2.stakeBankroll(aid, 2000);
        vm.stopPrank();
        assertEq(m2.shares(DEAD), m2.DEAD_SHARES(), "dead shares locked");
        assertEq(m2.shares(a), 2000 - m2.DEAD_SHARES(), "first staker minus dead");

        // Inflate bankroll stock with no share mint (donation via receive + restock).
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(m2).call{value: 1 ether}("");
        require(ok, "seed float");
        m2.restock();

        // A later staker whose deposit would round to zero shares is rejected
        // (without the guard this silently gifted their stock to the attacker).
        address v = makeAddr("v");
        uint256 vid = buyBoss(v);
        activateBoss(v, vid);
        stock2.mint(v, 1e17);
        vm.startPrank(v);
        stock2.approve(address(m2), 1e17);
        vm.expectRevert();
        m2.stakeBankroll(vid, 1e17);
        vm.stopPrank();
    }

    // ---- H4: VRF push model — the coordinator lands the word, not the player ----
    function test_H4_VRFPushModel() public {
        MockVRFCoordinator coord = new MockVRFCoordinator();
        VRFEntropyConductor vrf = new VRFEntropyConductor(address(coord));
        bytes32 id = keccak256("vrf-round");
        address consumer = makeAddr("consumerMachine");

        // Consumer commits -> a VRF request is made (requestId 1).
        vm.prank(consumer);
        vrf.commit(id, uint64(block.timestamp));
        vm.prank(consumer);
        assertFalse(vrf.isFulfilled(id), "not fulfilled pre-callback");

        // The coordinator delivers the word (push). The consumer cannot prevent it.
        coord.fulfill(1, 424242);

        vm.prank(consumer);
        assertTrue(vrf.isFulfilled(id), "fulfilled by coordinator");
        vm.prank(consumer);
        assertEq(vrf.wordOf(id), 424242, "word landed");
    }
}
