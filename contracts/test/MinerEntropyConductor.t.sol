// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MinerEntropyConductor} from "../src/pit/entropy/MinerEntropyConductor.sol";

/// @title MinerEntropyConductorTest
/// @notice Verifies the blockhash conductor's fast-L2 targeting: the target block
///         tracks `readyAt`, so even the 10-minute Vault delay lands its hash
///         inside the 256-block window — the bug a naive `commit + k` target would
///         hit on a ~0.25s chain. Also checks the aged-out (fail-closed) path and
///         that the derived word is deterministic and verifiable.
contract MinerEntropyConductorTest is Test {
    MinerEntropyConductor internal cond;
    // Robinhood Chain: block.number is L1-synced (~12s), so blockTimeMs = 12_000.
    uint256 internal constant BT_MS = 12_000;

    function setUp() public {
        cond = new MinerEntropyConductor(BT_MS);
        // Start from a realistic height so blockhash() has history to return.
        vm.roll(1_000_000);
        vm.warp(1_000_000);
    }

    function _commit(bytes32 id, uint64 delay) internal returns (uint64 readyAt) {
        readyAt = uint64(block.timestamp) + delay;
        cond.commit(id, readyAt);
    }

    /// @dev Vault lane: 10-minute delay. Target ≈ commit + 600s/0.25s = 2400 blocks.
    ///      Advancing to just past the target with time >= readyAt fulfils cleanly.
    function test_VaultLane_FulfilsWithinWindow() public {
        bytes32 id = keccak256("vault-1");
        uint64 readyAt = _commit(id, 10 minutes);

        uint256 target = cond.targetBlockFor(address(this), id);
        // commit + (600*1000/12000) + 2 = commit + 52
        assertEq(target, 1_000_000 + 52, "target tracks readyAt");

        // Advance to one block past target; warp to readyAt.
        vm.roll(target + 1);
        vm.warp(readyAt + 1);

        assertTrue(cond.isReady(id), "ready once target mined + readyAt passed");
        uint256 word = cond.fulfill(id);
        assertTrue(word != 0, "word landed");
        assertEq(cond.wordOf(id), word, "wordOf reproduces");
    }

    /// @dev Instant lane: 30s delay. Target ≈ commit + 120 blocks; fulfils fresh.
    function test_InstantLane_Fulfils() public {
        bytes32 id = keccak256("instant-1");
        uint64 readyAt = _commit(id, 30);
        uint256 target = cond.targetBlockFor(address(this), id);
        // commit + (30*1000/12000 = 2) + 2 = commit + 4
        assertEq(target, 1_000_000 + 4, "instant target");

        vm.roll(target + 1);
        vm.warp(readyAt + 1);
        uint256 word = cond.fulfill(id);
        assertTrue(word != 0, "instant word landed");
    }

    /// @dev Before the target block is mined, fulfill is not ready (reverts).
    function test_NotReady_BeforeTarget() public {
        bytes32 id = keccak256("early");
        uint64 readyAt = _commit(id, 30);
        vm.warp(readyAt + 1); // time passed, but blocks not advanced
        assertFalse(cond.isReady(id), "not ready before target block");
        vm.expectRevert();
        cond.fulfill(id);
    }

    /// @dev Aged out: if the keeper misses the 256-block window the hash reads 0,
    ///      the pull is unfulfillable, and the consumer refunds (fail-closed).
    function test_AgedOut_FailsClosed() public {
        bytes32 id = keccak256("aged");
        uint64 readyAt = _commit(id, 30);
        uint256 target = cond.targetBlockFor(address(this), id);

        // Advance far past the target so blockhash(target) == 0.
        vm.roll(target + 300);
        vm.warp(readyAt + 300);

        assertFalse(cond.isReady(id), "aged out -> not ready");
        vm.expectRevert();
        cond.fulfill(id);
    }

    /// @dev Two commitments that resolve against the same target block still get
    ///      distinct words (the id is mixed into the seed).
    function test_DistinctWordsPerId() public {
        bytes32 a = keccak256("a");
        bytes32 b = keccak256("b");
        uint64 ra = _commit(a, 30);
        _commit(b, 30);
        uint256 target = cond.targetBlockFor(address(this), a);
        vm.roll(target + 1);
        vm.warp(ra + 1);
        uint256 wa = cond.fulfill(a);
        uint256 wb = cond.fulfill(b);
        assertTrue(wa != wb, "distinct ids -> distinct words");
    }
}
