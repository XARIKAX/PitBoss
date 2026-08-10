// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockTaxToken} from "../src/mocks/MockTaxToken.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";
import {MockSwapRouter} from "../src/mocks/MockSwapRouter.sol";
import {PitBoss} from "../src/nft/PitBoss.sol";
import {PitBossAccount} from "../src/tba/PitBossAccount.sol";
import {InitializingRegistry} from "../src/tba/InitializingRegistry.sol";
import {FloorPosition} from "../src/floor/FloorPosition.sol";
import {HouseBook} from "../src/book/HouseBook.sol";
import {ActivationManager} from "../src/activation/ActivationManager.sol";

/// @title FeeOnTransferTest
/// @notice Proves the protocol survives a launchpad token with a transfer tax
///         ($PITBOSS on Pons, 1–2%). Activation is the one path that would break
///         without the fee-on-transfer-safe fix: it pulls the fee, then splits it
///         to the dead address + House Book. With a naive split of the NOMINAL fee
///         the two out-transfers would exceed the taxed-down balance and revert;
///         computing the split from the amount ACTUALLY received is what keeps it
///         working. Also confirms the dead-address "burn" replaces the missing
///         `burn()` a launchpad token doesn't have.
contract FeeOnTransferTest is Test {
    MockTaxToken internal pit;
    PitBoss internal boss;
    FloorPosition internal floor;
    HouseBook internal book;
    ActivationManager internal activation;

    address internal taxSink = makeAddr("taxSink");
    address internal user = makeAddr("user");
    address internal royalty = makeAddr("royalty");
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 internal constant TAX = 200; // 2%

    function setUp() public {
        pit = new MockTaxToken("PitBosses", "PITBOSS", TAX, taxSink);

        PitBossAccount impl = new PitBossAccount();
        InitializingRegistry reg = new InitializingRegistry(address(impl));
        boss = new PitBoss(address(reg), royalty);
        floor = new FloorPosition();
        MockOracle oracle = new MockOracle();
        MockSwapRouter router = new MockSwapRouter(address(oracle));
        book = new HouseBook(address(boss), address(floor), address(router));
        floor.setRewardSink(address(book));
        activation = new ActivationManager(address(boss), address(pit), address(floor), address(book));
        floor.setBumper(address(activation), true);

        // Grant a Boss directly (bypass the AMM, which would also be taxed).
        boss.setMinter(address(this), true);
    }

    function test_Activate_SurvivesTransferTax() public {
        uint256 id = boss.mint(user);
        uint256 fee = activation.activationFee();
        pit.mint(user, fee); // mint is untaxed

        vm.startPrank(user);
        pit.approve(address(activation), fee);
        activation.activate(id); // would revert if the split used the nominal fee
        vm.stopPrank();

        assertTrue(activation.isActivated(id), "activated despite the tax");

        // received = fee net of the inbound tax; each out-transfer is taxed again.
        uint256 received = fee - (fee * TAX) / 10_000;
        uint256 burnShare = received / 2;
        uint256 bookShare = received - burnShare;
        assertEq(pit.balanceOf(DEAD), burnShare - (burnShare * TAX) / 10_000, "dead got burn share (net)");
        assertEq(
            pit.balanceOf(address(book)),
            bookShare - (bookShare * TAX) / 10_000,
            "book got park share (net)"
        );
        assertEq(pit.balanceOf(address(activation)), 0, "no dust stuck in activation");
    }

    /// @dev Sanity: with tax disabled the same flow still works (no regression).
    function test_Activate_NoTax() public {
        pit = new MockTaxToken("PitBosses", "PITBOSS", 0, taxSink);
        activation = new ActivationManager(address(boss), address(pit), address(floor), address(book));
        floor.setBumper(address(activation), true);

        uint256 id = boss.mint(user);
        uint256 fee = activation.activationFee();
        pit.mint(user, fee);
        vm.startPrank(user);
        pit.approve(address(activation), fee);
        activation.activate(id);
        vm.stopPrank();

        assertEq(pit.balanceOf(DEAD), fee / 2, "half burned");
        assertEq(pit.balanceOf(address(book)), fee - fee / 2, "half parked");
    }
}
