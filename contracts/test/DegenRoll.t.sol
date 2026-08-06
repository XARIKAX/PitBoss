// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {DegenRoll} from "../src/pit/DegenRoll.sol";

contract DegenRollTest is TestBase {
    address internal house = makeAddr("house"); // bankroll staker (owns activated Boss)
    address internal player = makeAddr("player");
    uint256 internal houseBossId;

    function setUp() public {
        deploySystem();
        houseBossId = buyBoss(house);
        activateBoss(house, houseBossId);
        stakeBankroll(house, houseBossId, 5_000 ether); // seed inventory
        vm.deal(player, 100 ether);
    }

    function _entropyId(uint256 roundId) internal view returns (bytes32) {
        return keccak256(abi.encode(address(machine), roundId));
    }

    /// @dev Core reserve invariants (#2/#3): bankroll >= reserved, and reserved is
    ///      released on settle.
    function test_ReserveInvariant_HeldThenReleased() public {
        uint256 freeBefore = machine.freeStock();
        vm.prank(player);
        uint256 rid = machine.buy{value: 0.01 ether}(DegenRoll.Lane.Instant);

        assertGe(machine.totalBankrollStock(), machine.totalReserved(), "bankroll >= reserved");
        assertEq(machine.freeStock(), freeBefore - machine.totalReserved(), "free reduced by reserve");
        assertGt(machine.totalReserved(), 0, "reserve held");

        // Settle at the floor.
        conductor.presetWord(_entropyId(rid), 0); // residue 0 -> 0.70x
        vm.warp(block.timestamp + 1 minutes);
        machine.settle(rid);

        assertEq(machine.totalReserved(), 0, "reserve released after settle");
        assertGe(machine.totalBankrollStock(), machine.totalReserved(), "invariant preserved");
    }

    /// @dev Buying beyond what free inventory can back reverts (reserve shortfall).
    function test_ReserveShortfall_Reverts() public {
        // A ticket whose 50x reserve exceeds the 5,000-token bankroll.
        // notional = eth * 1e18 / 1e15 = eth * 1000; reserve = notional * 50.
        // 5,000 / 50 / 1000 = 0.1 ETH free-backed max. 0.2 ETH exceeds it.
        vm.deal(player, 1 ether);
        vm.prank(player);
        vm.expectRevert();
        machine.buy{value: 0.2 ether}(DegenRoll.Lane.Vault);
    }

    /// @dev A jackpot settles the full 50x prize as stock to the player wallet.
    function test_Jackpot_PaysStock() public {
        vm.prank(player);
        uint256 rid = machine.buy{value: 0.01 ether}(DegenRoll.Lane.Instant);
        conductor.presetWord(_entropyId(rid), 9_999); // residue 9999 -> 50x
        vm.warp(block.timestamp + 1 minutes);

        uint256 before = stock.balanceOf(player);
        uint256 prize = machine.settle(rid);
        // notional = 0.01e18 * 1000 = 1e19; 50x -> 5e20.
        assertEq(prize, 5e20, "50x of 10-token notional");
        assertEq(stock.balanceOf(player) - before, prize, "prize paid as stock");
    }

    /// @dev sealIntoCertificate issues a deed for the full prize (no spread).
    function test_SealIntoCertificate() public {
        vm.prank(player);
        uint256 rid = machine.buy{value: 0.01 ether}(DegenRoll.Lane.Instant);
        conductor.presetWord(_entropyId(rid), 9_999);
        vm.warp(block.timestamp + 1 minutes);

        uint256 prize = machine.sealIntoCertificate(rid);
        // Player holds a certificate whose deed backs `prize` stock.
        uint256 certId = cert.totalSupply();
        assertEq(cert.ownerOf(certId), player, "player holds the deed");
        (, uint256 amount) = cert.deedOf(certId);
        assertEq(amount, prize, "deed backs full prize");
    }

    /// @dev Fails closed: unhealthy entropy stops new sales but settles still work.
    function test_FailsClosed_OnEntropyStall() public {
        vm.prank(player);
        uint256 rid = machine.buy{value: 0.01 ether}(DegenRoll.Lane.Instant);

        conductor.setHealthy(false);
        vm.prank(player);
        vm.expectRevert(); // FloorUnhealthy
        machine.buy{value: 0.01 ether}(DegenRoll.Lane.Instant);

        // But the already-open round still settles.
        conductor.presetWord(_entropyId(rid), 0);
        vm.warp(block.timestamp + 1 minutes);
        machine.settle(rid);
    }

    /// @dev Unfulfilled pull is refundable after 48h; refund returns the full ticket.
    function test_Refund_After48h() public {
        vm.prank(player);
        uint256 rid = machine.buy{value: 0.01 ether}(DegenRoll.Lane.Vault);

        uint256 before = player.balance;
        vm.warp(block.timestamp + 48 hours + 1);
        machine.refund(rid);
        assertEq(player.balance - before, 0.01 ether, "full ticket refunded");
        assertEq(machine.totalReserved(), 0, "reserve released on refund");
    }

    /// @dev Loss-streak rebate: 5 consecutive floor rolls mint a rebate certificate.
    function test_LossStreakRebate() public {
        uint256 certsBefore = cert.totalSupply();
        for (uint256 i; i < 5; ++i) {
            vm.prank(player);
            uint256 rid = machine.buy{value: 0.01 ether}(DegenRoll.Lane.Instant);
            conductor.presetWord(_entropyId(rid), 0); // floor every time
            vm.warp(block.timestamp + 1 minutes);
            assertTrue(
                conductor.isReady(_entropyId(rid)),
                string.concat("conductor not ready at iter ", vm.toString(i), " round ", vm.toString(rid))
            );
            uint256 count = machine.streakCount(player);
            machine.settle(rid);
            assertEq(machine.streakCount(player), i == 4 ? 0 : count + 1, "streak count tracks");
        }
        assertEq(cert.totalSupply(), certsBefore + 1, "rebate certificate minted");
    }

    /// @dev Bankroll share accounting: stake then unstake round-trips, limited by
    ///      reserves; share price starts at parity.
    function test_BankrollStakeUnstake() public {
        assertEq(machine.sharePrice(), 1e18, "parity at seed");
        uint256 sharesHouse = machine.shares(house);
        assertEq(sharesHouse, 5_000 ether, "1:1 shares on first stake");

        vm.prank(house);
        uint256 out = machine.unstake(1_000 ether);
        assertEq(out, 1_000 ether, "unstake returns proportional stock");
    }
}
