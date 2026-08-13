// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {RouletteWheel} from "../src/pit/RouletteWheel.sol";
import {Roulette} from "../src/pit/Roulette.sol";

contract RouletteWheelTest is TestBase {
    address internal house = makeAddr("rhouse"); // bankroll staker (owns activated Boss)
    address internal player = makeAddr("rplayer");
    uint256 internal houseBossId;
    RouletteWheel internal wheel;

    function setUp() public {
        deploySystem();

        wheel = new RouletteWheel(
            address(stock),
            address(conductor),
            address(book),
            address(oracle),
            address(router),
            address(cert),
            address(boss),
            address(activation),
            address(floor),
            creator,
            protocolReserve,
            address(pit)
        );
        cert.setIssuer(address(wheel), true);
        floor.setBumper(address(wheel), true);

        houseBossId = buyBoss(house);
        activateBoss(house, houseBossId);
        _stakeWheel(house, houseBossId, 10_000 ether); // seed inventory
        vm.deal(player, 100 ether);
    }

    function _stakeWheel(address who, uint256 bossId, uint256 amount) internal {
        stock.mint(who, amount);
        vm.startPrank(who);
        stock.approve(address(wheel), amount);
        wheel.stakeBankroll(bossId, amount);
        vm.stopPrank();
    }

    function _entropyId(uint256 spinId) internal view returns (bytes32) {
        return keccak256(abi.encode(address(wheel), spinId));
    }

    // notional = eth * 1e18 / 1e15 = eth * 1000. For 0.01 ETH -> 1e19 (10 tokens).

    /// @dev A straight-up number reserves 36× and releases it on settle.
    function test_ReserveInvariant_HeldThenReleased() public {
        uint256 freeBefore = wheel.freeStock();
        vm.prank(player);
        uint256 sid = wheel.spin{value: 0.01 ether}(RouletteWheel.Lane.Instant, Roulette.Bet.Straight, 7);

        // reserve = 1e19 * 36 = 3.6e20
        assertEq(wheel.totalReserved(), 3.6e20, "36x reserve held for straight");
        assertGe(wheel.totalBankrollStock(), wheel.totalReserved(), "bankroll >= reserved");
        assertEq(wheel.freeStock(), freeBefore - 3.6e20, "free reduced by reserve");

        conductor.presetWord(_entropyId(sid), 0); // pocket 0 -> straight(7) loses
        vm.warp(block.timestamp + 1 minutes);
        wheel.settle(sid);

        assertEq(wheel.totalReserved(), 0, "reserve released after settle");
    }

    /// @dev A straight-up hit pays 36× the notional as stock to the player.
    function test_StraightWin_PaysStock() public {
        vm.prank(player);
        uint256 sid = wheel.spin{value: 0.01 ether}(RouletteWheel.Lane.Instant, Roulette.Bet.Straight, 7);
        conductor.presetWord(_entropyId(sid), 7); // pocket 7 == selection -> win
        vm.warp(block.timestamp + 1 minutes);

        uint256 before = stock.balanceOf(player);
        uint256 prize = wheel.settle(sid);
        assertEq(prize, 3.6e20, "36x of 10-token notional");
        assertEq(stock.balanceOf(player) - before, prize, "prize paid as stock");
    }

    /// @dev Even-money bet: red wins on a red pocket and pays 2×.
    function test_RedWin_PaysDouble() public {
        vm.prank(player);
        uint256 sid = wheel.spin{value: 0.01 ether}(RouletteWheel.Lane.Instant, Roulette.Bet.Red, 0);
        conductor.presetWord(_entropyId(sid), 1); // pocket 1 is red -> win
        vm.warp(block.timestamp + 1 minutes);

        uint256 prize = wheel.settle(sid);
        assertEq(prize, 2e19, "2x of 10-token notional");
    }

    /// @dev Every outside bet loses on the green zero.
    function test_OutsideBet_LosesOnZero() public {
        vm.prank(player);
        uint256 sid = wheel.spin{value: 0.01 ether}(RouletteWheel.Lane.Instant, Roulette.Bet.Red, 0);
        conductor.presetWord(_entropyId(sid), 0); // pocket 0 (green) -> loss
        vm.warp(block.timestamp + 1 minutes);

        uint256 before = stock.balanceOf(player);
        uint256 prize = wheel.settle(sid);
        assertEq(prize, 0, "zero pays nothing on outside bets");
        assertEq(stock.balanceOf(player), before, "no stock paid on a loss");
    }

    /// @dev Dozen bet pays 3× when the pocket falls in the chosen dozen.
    function test_DozenWin_PaysTriple() public {
        vm.prank(player);
        // Dozen 0 == numbers 1..12.
        uint256 sid = wheel.spin{value: 0.01 ether}(RouletteWheel.Lane.Instant, Roulette.Bet.Dozen, 0);
        conductor.presetWord(_entropyId(sid), 5); // pocket 5 in dozen 0 -> win
        vm.warp(block.timestamp + 1 minutes);

        uint256 prize = wheel.settle(sid);
        assertEq(prize, 3e19, "3x of 10-token notional");
    }

    /// @dev An out-of-range selection reverts (straight > 36).
    function test_InvalidSelection_Reverts() public {
        vm.prank(player);
        vm.expectRevert();
        wheel.spin{value: 0.01 ether}(RouletteWheel.Lane.Instant, Roulette.Bet.Straight, 37);
    }

    /// @dev A straight whose 36× reserve exceeds free inventory reverts.
    function test_ReserveShortfall_Reverts() public {
        // 10,000-token bankroll / 36 / 1000 = ~0.277 ETH straight-backed max.
        vm.deal(player, 5 ether);
        vm.prank(player);
        vm.expectRevert();
        wheel.spin{value: 1 ether}(RouletteWheel.Lane.Vault, Roulette.Bet.Straight, 0);
    }

    /// @dev Fails closed: unhealthy entropy stops new spins but settles still work.
    function test_FailsClosed_OnEntropyStall() public {
        vm.prank(player);
        uint256 sid = wheel.spin{value: 0.01 ether}(RouletteWheel.Lane.Instant, Roulette.Bet.Red, 0);

        conductor.setHealthy(false);
        vm.prank(player);
        vm.expectRevert(); // FloorUnhealthy
        wheel.spin{value: 0.01 ether}(RouletteWheel.Lane.Instant, Roulette.Bet.Red, 0);

        // The already-open spin still settles.
        conductor.presetWord(_entropyId(sid), 1);
        vm.warp(block.timestamp + 1 minutes);
        wheel.settle(sid);
    }

    /// @dev Unfulfilled spin is refundable after 48h; refund returns the full stake.
    function test_Refund_After48h() public {
        vm.prank(player);
        uint256 sid = wheel.spin{value: 0.01 ether}(RouletteWheel.Lane.Vault, Roulette.Bet.Black, 0);

        uint256 before = player.balance;
        vm.warp(block.timestamp + 48 hours + 1);
        wheel.refund(sid);
        assertEq(player.balance - before, 0.01 ether, "full stake refunded");
        assertEq(wheel.totalReserved(), 0, "reserve released on refund");
    }

    /// @dev Sealing a winning spin issues a certificate for the full prize.
    function test_SealWin_IssuesCertificate() public {
        vm.prank(player);
        uint256 sid = wheel.spin{value: 0.01 ether}(RouletteWheel.Lane.Instant, Roulette.Bet.Straight, 7);
        conductor.presetWord(_entropyId(sid), 7);
        vm.warp(block.timestamp + 1 minutes);

        uint256 prize = wheel.sealIntoCertificate(sid);
        uint256 certId = cert.totalSupply();
        assertEq(cert.ownerOf(certId), player, "player holds the deed");
        (, uint256 amount) = cert.deedOf(certId);
        assertEq(amount, prize, "deed backs full prize");
    }

    /// @dev Bankroll share accounting: first staker gets amount - DEAD_SHARES.
    function test_BankrollStakeUnstake() public {
        assertEq(wheel.sharePrice(), 1e18, "parity at seed");
        assertEq(wheel.shares(house), 10_000 ether - wheel.DEAD_SHARES(), "1:1 shares minus dead-shares");

        vm.prank(house);
        uint256 out = wheel.unstake(1_000 ether);
        assertEq(out, 1_000 ether, "unstake returns proportional stock");
    }
}
