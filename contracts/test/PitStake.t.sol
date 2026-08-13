// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {RouletteWheel} from "../src/pit/RouletteWheel.sol";
import {Roulette} from "../src/pit/Roulette.sol";
import {DegenRoll} from "../src/pit/DegenRoll.sol";
import {Errors} from "../src/lib/Errors.sol";

/// @notice Covers staking $PITBOSS instead of ETH on both games.
///
///         The claim these tests exist to defend is that a PIT wager is the same
///         bet as an ETH wager of equal value — same notional, same reserve, same
///         prize — and that the only difference is the house's cut being burned
///         rather than split. If the burn ever exceeded the edge, the bankroll
///         would take in less than it pays out; `test_Burn*` pins the exact split.
contract PitStakeTest is TestBase {
    address internal house = makeAddr("pshouse");
    address internal player = makeAddr("psplayer");
    uint256 internal houseBossId;
    RouletteWheel internal wheel;

    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;

    /// @dev 1 PIT = 0.0001 ETH. Chosen so a whole number of PIT maps to a clean
    ///      ETH value and the parity assertions are exact rather than approximate.
    uint256 internal constant ETH_PER_PIT = 1e14;

    function setUp() public {
        deploySystem();

        oracle.setEthPerToken(address(pit), ETH_PER_PIT);

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
        _stakeWheel(house, houseBossId, 10_000 ether);

        vm.deal(player, 100 ether);
        _givePit(player, 1_000_000 ether);
    }

    function _stakeWheel(address who, uint256 bossId, uint256 amount) internal {
        stock.mint(who, amount);
        vm.startPrank(who);
        stock.approve(address(wheel), amount);
        wheel.stakeBankroll(bossId, amount);
        vm.stopPrank();
    }

    function _givePit(address who, uint256 amount) internal {
        vm.prank(treasury);
        pit.transfer(who, amount);
    }

    function _entropyId(address consumer, uint256 id) internal pure returns (bytes32) {
        return keccak256(abi.encode(consumer, id));
    }

    function _spinPit(uint256 pitAmount, Roulette.Bet bet, uint8 sel) internal returns (uint256 sid) {
        vm.startPrank(player);
        pit.approve(address(wheel), pitAmount);
        sid = wheel.spinWithPIT(RouletteWheel.Lane.Instant, bet, sel, pitAmount);
        vm.stopPrank();
    }

    // ==================== odds parity ====================

    /// @dev The whole design rests on this: staking PIT worth X ETH must produce
    ///      the same notional as staking X ETH, or the two tables pay differently.
    function test_PitAndEthOfEqualValue_GiveSameNotional() public {
        uint256 pitAmount = 100 ether; // 100 PIT * 1e14 = 0.01 ETH
        uint256 ethAmount = 0.01 ether;

        uint256 pitSid = _spinPit(pitAmount, Roulette.Bet.Red, 0);
        vm.prank(player);
        uint256 ethSid = wheel.spin{value: ethAmount}(RouletteWheel.Lane.Instant, Roulette.Bet.Red, 0);

        (, , uint256 pitNotional, , , , , , , , ) = wheel.spins(pitSid);
        (, , uint256 ethNotional, , , , , , , , ) = wheel.spins(ethSid);
        assertEq(pitNotional, ethNotional, "equal value must give equal notional");
    }

    /// @dev And therefore the same reserve against the bankroll.
    function test_PitBet_ReservesLikeEth() public {
        uint256 freeBefore = wheel.freeStock();
        uint256 sid = _spinPit(100 ether, Roulette.Bet.Straight, 7);

        // notional = 0.01 ETH / 1e15 = 1e19; straight reserves 36x = 3.6e20.
        assertEq(wheel.totalReserved(), 3.6e20, "36x reserve held");
        assertEq(wheel.freeStock(), freeBefore - 3.6e20, "free reduced");
        assertGe(wheel.totalBankrollStock(), wheel.totalReserved(), "invariant holds");

        conductor.presetWord(_entropyId(address(wheel), sid), 0); // pocket 0 -> loses
        vm.warp(block.timestamp + 1 minutes);
        wheel.settle(sid);
        assertEq(wheel.totalReserved(), 0, "reserve released");
    }

    // ==================== the burn ====================

    /// @dev Exactly the wheel's 2% edge burns; the other 98% must reach pitFloat,
    ///      because that is what funds the prizes paid at full notional.
    function test_Burn_IsExactlyTheEdge_AndRemainderFloats() public {
        uint256 stake = 100 ether;
        uint256 deadBefore = pit.balanceOf(DEAD);

        uint256 sid = _spinPit(stake, Roulette.Bet.Red, 0);
        assertEq(pit.balanceOf(DEAD), deadBefore, "nothing burns before settle");
        assertEq(wheel.pitFloat(), 0, "nothing floats before settle");

        conductor.presetWord(_entropyId(address(wheel), sid), 0); // green -> loses
        vm.warp(block.timestamp + 1 minutes);
        wheel.settle(sid);

        uint256 expectedBurn = (stake * wheel.PIT_BURN_BPS()) / 10_000;
        assertEq(pit.balanceOf(DEAD) - deadBefore, expectedBurn, "burn == edge");
        assertEq(wheel.pitFloat(), stake - expectedBurn, "remainder floats to bankroll");
        assertEq(expectedBurn + wheel.pitFloat(), stake, "stake fully accounted");
    }

    /// @dev Burning more than the edge would make the bankroll insolvent, so the
    ///      constant is pinned to the structural edge rather than left free.
    function test_BurnRate_DoesNotExceedTheHouseEdge() public view {
        // Wheel: single zero => 1/37 = 2.70%. Burn is 2%, inside it.
        assertLe(wheel.PIT_BURN_BPS(), 270, "wheel burn must sit inside the 2.70% edge");
        // Machine: prize table RTP is 90%, so the edge is 10%.
        assertLe(machine.PIT_BURN_BPS(), 1000, "machine burn must sit inside the 10% edge");
    }

    // ==================== refunds ====================

    /// @dev Nothing is burned or converted until settle, so an unfulfilled bet must
    ///      refund the entire stake — not the post-burn remainder.
    function test_Refund_ReturnsFullPitStake() public {
        uint256 stake = 100 ether;
        uint256 before = pit.balanceOf(player);
        uint256 sid = _spinPit(stake, Roulette.Bet.Red, 0);
        assertEq(pit.balanceOf(player), before - stake, "stake escrowed");

        vm.warp(block.timestamp + 49 hours);
        wheel.refund(sid);

        assertEq(pit.balanceOf(player), before, "full stake refunded");
        assertEq(pit.balanceOf(DEAD), 0, "refund burns nothing");
        assertEq(wheel.totalReserved(), 0, "reserve released on refund");
    }

    // ==================== payouts ====================

    /// @dev A PIT bet wins the same stock, from the same shared bankroll.
    function test_PitWin_PaysStockFromSharedBankroll() public {
        uint256 sid = _spinPit(100 ether, Roulette.Bet.Red, 0);
        uint256 bankrollBefore = wheel.totalBankrollStock();

        conductor.presetWord(_entropyId(address(wheel), sid), 1); // pocket 1 is red -> win
        vm.warp(block.timestamp + 1 minutes);
        wheel.settle(sid);

        // Red pays 2x the notional (1e19) = 2e19.
        assertEq(stock.balanceOf(player), 2e19, "player paid 2x notional in stock");
        assertEq(bankrollBefore - wheel.totalBankrollStock(), 2e19, "paid from the bankroll");
    }

    // ==================== guards ====================

    function test_PitBet_FailsClosedOnEntropyStall() public {
        conductor.setHealthy(false);
        vm.startPrank(player);
        pit.approve(address(wheel), 100 ether);
        vm.expectRevert(Errors.FloorUnhealthy.selector);
        wheel.spinWithPIT(RouletteWheel.Lane.Instant, Roulette.Bet.Red, 0, 100 ether);
        vm.stopPrank();
    }

    function test_PitBet_RejectsZeroStake() public {
        vm.prank(player);
        vm.expectRevert(Errors.ZeroAmount.selector);
        wheel.spinWithPIT(RouletteWheel.Lane.Instant, Roulette.Bet.Red, 0, 0);
    }

    /// @dev The Instant lane's dollar ceiling must bind on PIT as it does on ETH,
    ///      or the cap could be bypassed by switching stake currency.
    function test_PitBet_RespectsInstantLaneCap() public {
        // INSTANT_MAX_USD = 100e8 at 3000 USD/ETH => 0.0333… ETH => ~333 PIT.
        uint256 tooBig = 400 ether; // 0.04 ETH = $120
        _givePit(player, tooBig);
        vm.startPrank(player);
        pit.approve(address(wheel), tooBig);
        vm.expectRevert(Errors.InvalidConfig.selector);
        wheel.spinWithPIT(RouletteWheel.Lane.Instant, Roulette.Bet.Red, 0, tooBig);
        vm.stopPrank();
    }

    // ==================== machines ====================

    /// @dev The machine path mirrors the wheel: same escrow, same burn-at-settle.
    function test_Machine_PitTicket_BurnsEdgeAndFloatsRemainder() public {
        uint256 stake = 100 ether;
        // Seed the machine's bankroll so the 50x reserve can be met.
        stock.mint(house, 100_000 ether);
        vm.startPrank(house);
        stock.approve(address(machine), 100_000 ether);
        machine.stakeBankroll(houseBossId, 100_000 ether);
        vm.stopPrank();

        _givePit(player, stake);
        uint256 deadBefore = pit.balanceOf(DEAD);

        vm.startPrank(player);
        pit.approve(address(machine), stake);
        uint256 rid = machine.buyWithPIT(DegenRoll.Lane.Instant, stake);
        vm.stopPrank();

        conductor.presetWord(_entropyId(address(machine), rid), 0);
        vm.warp(block.timestamp + 1 minutes);
        machine.settle(rid);

        uint256 expectedBurn = (stake * machine.PIT_BURN_BPS()) / 10_000;
        assertEq(pit.balanceOf(DEAD) - deadBefore, expectedBurn, "machine burns its 10% edge");
        assertEq(machine.pitFloat(), stake - expectedBurn, "remainder floats");
    }
}
