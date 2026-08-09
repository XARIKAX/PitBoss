// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {PIT} from "../src/token/PIT.sol";
import {PitBossAccount} from "../src/tba/PitBossAccount.sol";
import {InitializingRegistry} from "../src/tba/InitializingRegistry.sol";
import {PitBoss} from "../src/nft/PitBoss.sol";
import {FloorPosition} from "../src/floor/FloorPosition.sol";
import {HouseBook} from "../src/book/HouseBook.sol";
import {FlatAMMVault} from "../src/amm/FlatAMMVault.sol";
import {ActivationManager} from "../src/activation/ActivationManager.sol";
import {BearerCertificate} from "../src/pit/BearerCertificate.sol";
import {CertificateCounter} from "../src/pit/CertificateCounter.sol";
import {DegenRollFactory} from "../src/pit/DegenRollFactory.sol";
import {RouletteWheelFactory} from "../src/pit/RouletteWheelFactory.sol";
import {LiquidityLocker} from "../src/locker/LiquidityLocker.sol";
import {LoanVault} from "../src/loans/LoanVault.sol";
import {OpeningBell} from "../src/launcher/OpeningBell.sol";
import {LauncherFactory} from "../src/launcher/LauncherFactory.sol";
import {SeasonEngine} from "../src/season/SeasonEngine.sol";

import {MockStockToken} from "../src/mocks/MockStockToken.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";
import {MockSwapRouter} from "../src/mocks/MockSwapRouter.sol";
import {MockEntropyConductor} from "../src/mocks/MockEntropyConductor.sol";
import {MinerEntropyConductor} from "../src/pit/entropy/MinerEntropyConductor.sol";
import {VRFEntropyConductor} from "../src/pit/entropy/VRFEntropyConductor.sol";
import {MockPoolDeployer} from "../src/mocks/MockPoolDeployer.sol";
import {Chains} from "../src/config/Chains.sol";

/// @title Deploy
/// @notice Idempotent full-system deploy. On local/anvil (or when USE_MOCKS=true) it
///         deploys mock stock/oracle/router/entropy so every page works against a
///         fork; on a real chain it wires the entropy conductor per Chains config
///         and expects real oracle/router/stock addresses via env. Writes
///         deployments/deployments.<chainId>.json consumed by the web app + docs.
/// @dev    Run: forge script script/Deploy.s.sol --rpc-url <url> --broadcast
contract Deploy is Script {
    struct Addrs {
        address pit;
        address registry;
        address account;
        address boss;
        address floor;
        address book;
        address amm;
        address activation;
        address certificate;
        address counter;
        address rollFactory;
        address rouletteFactory;
        address locker;
        address loans;
        address bell;
        address launcher;
        address season;
        address conductor;
        address oracle;
        address router;
        address poolDeployer;
        address stockSample;
    }

    function run() external {
        address treasury = _envOr("TREASURY", msg.sender);
        address protocolReserve = _envOr("PROTOCOL_RESERVE", msg.sender);
        address royalty = _envOr("ROYALTY_RECEIVER", msg.sender);
        bool useMocks = _envBool("USE_MOCKS", block.chainid == 31337);

        vm.startBroadcast();
        Addrs memory a;

        // ---- external deps (mocks locally) ----
        if (useMocks) {
            MockOracle o = new MockOracle();
            MockSwapRouter r = new MockSwapRouter(address(o));
            MockStockToken s = new MockStockToken("Tokenized NVDA", "tNVDA", 18);
            o.setEthPerToken(address(s), 1e15);
            o.setUsdPerEth(3000e8);
            a.oracle = address(o);
            a.router = address(r);
            a.stockSample = address(s);
            a.conductor = address(new MockEntropyConductor());
        } else {
            a.oracle = vm.envAddress("ORACLE");
            a.router = vm.envAddress("SWAP_ROUTER");
            a.stockSample = vm.envAddress("STOCK_SAMPLE");
            a.conductor = Chains.entropyKind(block.chainid) == Chains.EntropyKind.Miner
                ? address(new MinerEntropyConductor(Chains.blockTimeMs(block.chainid)))
                : address(new VRFEntropyConductor(vm.envAddress("VRF_COORDINATOR")));
        }
        a.poolDeployer = address(new MockPoolDeployer()); // replace with V3 adapter on mainnet

        // ---- token + collection ----
        // Protocol token: use the launchpad token ($PITBOSS on Pons) when its
        // address is provided; otherwise deploy the reference PIT.sol (local/test).
        a.pit = _envOr("PIT_TOKEN", address(0));
        if (a.pit == address(0)) a.pit = address(new PIT(treasury));
        a.account = address(new PitBossAccount());
        a.registry = address(new InitializingRegistry(a.account));
        a.boss = address(new PitBoss(a.registry, royalty));

        // ---- floor + book ----
        FloorPosition floor = new FloorPosition();
        a.floor = address(floor);
        HouseBook book = new HouseBook(a.boss, a.floor, a.router);
        a.book = address(book);
        floor.setRewardSink(a.book);

        // ---- amm ----
        FlatAMMVault amm = new FlatAMMVault(a.boss, a.pit, a.book);
        a.amm = address(amm);
        PitBoss(a.boss).setMinter(a.amm, true);

        // ---- activation ----
        ActivationManager activation = new ActivationManager(a.boss, a.pit, a.floor, a.book);
        a.activation = address(activation);
        floor.setBumper(a.activation, true);

        // ---- certificates ----
        BearerCertificate cert = new BearerCertificate(a.registry, royalty);
        a.certificate = address(cert);
        CertificateCounter counter = new CertificateCounter(a.certificate, a.book, a.oracle, protocolReserve);
        a.counter = address(counter);
        cert.setIssuer(a.counter, true);
        if (useMocks) counter.setRouted(a.stockSample, true);

        // ---- degen roll factory + sample machine ----
        DegenRollFactory factory = new DegenRollFactory(
            DegenRollFactory.Wiring({
                conductor: a.conductor,
                houseBook: a.book,
                oracle: a.oracle,
                router: a.router,
                certificate: a.certificate,
                boss: a.boss,
                activation: a.activation,
                floor: a.floor,
                protocolReserve: protocolReserve
            })
        );
        a.rollFactory = address(factory);
        if (useMocks) {
            address machine = factory.createMachine(a.stockSample, msg.sender);
            cert.setIssuer(machine, true);
            floor.setBumper(machine, true);
        }

        // ---- roulette factory + sample wheel ----
        RouletteWheelFactory rFactory = new RouletteWheelFactory(
            RouletteWheelFactory.Wiring({
                conductor: a.conductor,
                houseBook: a.book,
                oracle: a.oracle,
                router: a.router,
                certificate: a.certificate,
                boss: a.boss,
                activation: a.activation,
                floor: a.floor,
                protocolReserve: protocolReserve
            })
        );
        a.rouletteFactory = address(rFactory);
        if (useMocks) {
            address wheel = rFactory.createWheel(a.stockSample, msg.sender);
            cert.setIssuer(wheel, true);
            floor.setBumper(wheel, true);
        }

        // ---- locker + loans ----
        a.locker = address(new LiquidityLocker(a.book));
        LoanVault loans = new LoanVault(a.boss, a.pit, a.amm, a.book, a.oracle, protocolReserve);
        a.loans = address(loans);
        amm.setLiquidator(a.loans, true);

        // ---- launcher + bell ----
        OpeningBell bell = new OpeningBell(a.conductor);
        a.bell = address(bell);
        LauncherFactory launcher = new LauncherFactory(a.book, a.bell, a.locker, a.poolDeployer);
        a.launcher = address(launcher);
        bell.setLauncher(a.launcher);

        // ---- seasons ----
        SeasonEngine season = new SeasonEngine(a.floor);
        a.season = address(season);
        floor.setBumper(a.season, true);

        vm.stopBroadcast();

        _write(a);
        console2.log("Deployed PitBosses to chain", block.chainid);
    }

    // -------- json output --------

    function _write(Addrs memory a) internal {
        string memory o = "deployments";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeAddress(o, "PIT", a.pit);
        vm.serializeAddress(o, "InitializingRegistry", a.registry);
        vm.serializeAddress(o, "PitBossAccount", a.account);
        vm.serializeAddress(o, "PitBoss", a.boss);
        vm.serializeAddress(o, "FloorPosition", a.floor);
        vm.serializeAddress(o, "HouseBook", a.book);
        vm.serializeAddress(o, "FlatAMMVault", a.amm);
        vm.serializeAddress(o, "ActivationManager", a.activation);
        vm.serializeAddress(o, "BearerCertificate", a.certificate);
        vm.serializeAddress(o, "CertificateCounter", a.counter);
        vm.serializeAddress(o, "DegenRollFactory", a.rollFactory);
        vm.serializeAddress(o, "RouletteWheelFactory", a.rouletteFactory);
        vm.serializeAddress(o, "LiquidityLocker", a.locker);
        vm.serializeAddress(o, "LoanVault", a.loans);
        vm.serializeAddress(o, "OpeningBell", a.bell);
        vm.serializeAddress(o, "LauncherFactory", a.launcher);
        vm.serializeAddress(o, "SeasonEngine", a.season);
        vm.serializeAddress(o, "EntropyConductor", a.conductor);
        vm.serializeAddress(o, "Oracle", a.oracle);
        vm.serializeAddress(o, "SwapRouter", a.router);
        vm.serializeAddress(o, "PoolDeployer", a.poolDeployer);
        string memory json = vm.serializeAddress(o, "StockSample", a.stockSample);

        string memory path = string.concat("deployments/deployments.", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console2.log("Wrote", path);
    }

    // -------- env helpers --------

    function _envOr(string memory key, address dflt) internal view returns (address) {
        try vm.envAddress(key) returns (address v) {
            return v;
        } catch {
            return dflt;
        }
    }

    function _envBool(string memory key, bool dflt) internal view returns (bool) {
        try vm.envBool(key) returns (bool v) {
            return v;
        } catch {
            return dflt;
        }
    }
}
