// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {PIT} from "../../src/token/PIT.sol";
import {PitBossAccount} from "../../src/tba/PitBossAccount.sol";
import {InitializingRegistry} from "../../src/tba/InitializingRegistry.sol";
import {PitBoss} from "../../src/nft/PitBoss.sol";
import {FloorPosition} from "../../src/floor/FloorPosition.sol";
import {HouseBook} from "../../src/book/HouseBook.sol";
import {FlatAMMVault} from "../../src/amm/FlatAMMVault.sol";
import {ActivationManager} from "../../src/activation/ActivationManager.sol";
import {BearerCertificate} from "../../src/pit/BearerCertificate.sol";
import {CertificateCounter} from "../../src/pit/CertificateCounter.sol";
import {DegenRoll} from "../../src/pit/DegenRoll.sol";
import {DegenRollFactory} from "../../src/pit/DegenRollFactory.sol";
import {LiquidityLocker} from "../../src/locker/LiquidityLocker.sol";
import {LoanVault} from "../../src/loans/LoanVault.sol";
import {OpeningBell} from "../../src/launcher/OpeningBell.sol";
import {LauncherFactory} from "../../src/launcher/LauncherFactory.sol";
import {SeasonEngine} from "../../src/season/SeasonEngine.sol";

import {MockStockToken} from "../../src/mocks/MockStockToken.sol";
import {MockOracle} from "../../src/mocks/MockOracle.sol";
import {MockSwapRouter} from "../../src/mocks/MockSwapRouter.sol";
import {MockEntropyConductor} from "../../src/mocks/MockEntropyConductor.sol";
import {MockPoolDeployer} from "../../src/mocks/MockPoolDeployer.sol";

/// @title TestBase
/// @notice Deploys and wires the full PitBosses system against mocks. Mirrors the
///         production deploy script so tests exercise the same wiring.
abstract contract TestBase is Test {
    // roles
    address internal treasury = makeAddr("treasury");
    address internal protocolReserve = makeAddr("protocolReserve");
    address internal creator = makeAddr("creator");
    address internal royalty = makeAddr("royalty");

    // core
    PIT internal pit;
    InitializingRegistry internal registry;
    PitBoss internal boss;
    FloorPosition internal floor;
    HouseBook internal book;
    FlatAMMVault internal amm;
    ActivationManager internal activation;

    // pit
    BearerCertificate internal cert;
    CertificateCounter internal counter;
    DegenRollFactory internal factory;
    DegenRoll internal machine;

    // phase 3-4
    LiquidityLocker internal locker;
    LoanVault internal loans;
    OpeningBell internal bell;
    LauncherFactory internal launcher;
    SeasonEngine internal season;

    // mocks
    MockStockToken internal stock;
    MockOracle internal oracle;
    MockSwapRouter internal router;
    MockEntropyConductor internal conductor;
    MockPoolDeployer internal poolDeployer;

    function deploySystem() internal {
        // --- mocks / oracle ---
        oracle = new MockOracle();
        router = new MockSwapRouter(address(oracle));
        conductor = new MockEntropyConductor();
        poolDeployer = new MockPoolDeployer();
        stock = new MockStockToken("Tokenized NVDA", "tNVDA", 18);
        oracle.setEthPerToken(address(stock), 1e15); // 0.001 ETH per token
        oracle.setUsdPerEth(3000e8);

        // --- token + collection ---
        pit = new PIT(treasury);
        PitBossAccount impl = new PitBossAccount();
        registry = new InitializingRegistry(address(impl));
        boss = new PitBoss(address(registry), royalty);

        // --- floor + book ---
        floor = new FloorPosition();
        book = new HouseBook(address(boss), address(floor), address(router));
        floor.setRewardSink(address(book));

        // --- amm ---
        amm = new FlatAMMVault(address(boss), address(pit), address(book), 500_000 ether);
        boss.setMinter(address(amm), true);

        // --- activation ---
        activation = new ActivationManager(address(boss), address(pit), address(floor), address(book));
        floor.setBumper(address(activation), true);

        // --- certificates ---
        cert = new BearerCertificate(address(registry), royalty);
        counter = new CertificateCounter(address(cert), address(book), address(oracle), protocolReserve);
        cert.setIssuer(address(counter), true);
        counter.setRouted(address(stock), true);

        // --- degen roll factory + one machine ---
        factory = new DegenRollFactory(
            DegenRollFactory.Wiring({
                conductor: address(conductor),
                houseBook: address(book),
                oracle: address(oracle),
                router: address(router),
                certificate: address(cert),
                boss: address(boss),
                activation: address(activation),
                floor: address(floor),
                protocolReserve: protocolReserve
            })
        );
        machine = DegenRoll(payable(factory.createMachine(address(stock), creator)));
        cert.setIssuer(address(machine), true);
        floor.setBumper(address(machine), true);

        // --- locker + loans ---
        locker = new LiquidityLocker(address(book));
        loans = new LoanVault(
            address(boss), address(pit), address(amm), address(book), address(oracle), protocolReserve
        );
        amm.setLiquidator(address(loans), true);

        // --- launcher + bell ---
        bell = new OpeningBell(address(conductor));
        launcher = new LauncherFactory(address(book), address(bell), address(locker), address(poolDeployer));
        bell.setLauncher(address(launcher));

        // --- seasons ---
        season = new SeasonEngine(address(floor));
        floor.setBumper(address(season), true);
    }

    // -------- helpers --------

    /// @notice Mint a Boss to `who` via the AMM (approves + pays fees).
    /// @dev Values are hoisted before vm.prank: a view call would otherwise
    ///      consume the prank and the transfer would run as the default sender.
    function buyBoss(address who) internal returns (uint256 tokenId) {
        uint256 price = amm.PRICE_PIT();
        uint256 fee = amm.buyFee();
        vm.prank(treasury);
        pit.transfer(who, price);
        vm.deal(who, who.balance + 1 ether);
        vm.startPrank(who);
        pit.approve(address(amm), price);
        tokenId = amm.buyNext{value: fee}();
        vm.stopPrank();
    }

    /// @notice Activate a Boss owned by `who`.
    function activateBoss(address who, uint256 tokenId) internal {
        uint256 fee = activation.activationFee();
        vm.prank(treasury);
        pit.transfer(who, fee);
        vm.startPrank(who);
        pit.approve(address(activation), fee);
        activation.activate(tokenId);
        vm.stopPrank();
    }

    /// @notice Seed the machine bankroll from `who` (needs an activated Boss).
    function stakeBankroll(address who, uint256 bossId, uint256 amount) internal {
        stock.mint(who, amount);
        vm.startPrank(who);
        stock.approve(address(machine), amount);
        machine.stakeBankroll(bossId, amount);
        vm.stopPrank();
    }
}
