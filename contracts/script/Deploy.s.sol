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
import {MockPoolDeployer} from "../src/mocks/MockPoolDeployer.sol";
import {MinerEntropyConductor} from "../src/pit/entropy/MinerEntropyConductor.sol";
import {VRFEntropyConductor} from "../src/pit/entropy/VRFEntropyConductor.sol";
import {VRFServiceConductor} from "../src/pit/entropy/VRFServiceConductor.sol";
import {Chains} from "../src/config/Chains.sol";

/// @title Deploy
/// @notice Idempotent full-system deploy. On local/anvil (or USE_MOCKS=true) it
///         deploys mock stock/oracle/router/entropy so every page works against a
///         fork; on a real chain it wires real adapters and the Pons-launched PIT
///         token. Writes deployments/deployments.<chainId>.json consumed by the
///         web app and keeper bots.
///
/// @dev    Run on mainnet:
///           1. Deploy adapters first: forge script script/DeployIntegrations.s.sol
///           2. Launch $PIT on Pons; note the graduated token address.
///           3. Set env vars and run: forge script script/Deploy.s.sol --broadcast
///
///         Mainnet env vars:
///           PIT_TOKEN         — Pons-graduated $PIT token address (optional;
///                               omit to deploy without PIT and wire later via
///                               FlatAMMVault.setPIT / ActivationManager.setPIT
///                               / LoanVault.setPIT after Pons graduation)
///           TREASURY          — fee sink (defaults to deployer)
///           PROTOCOL_RESERVE  — fee split receiver (defaults to deployer)
///           ROYALTY_RECEIVER  — ERC-2981 receiver (defaults to deployer)
///           ORACLE            — ChainlinkOracleAdapter from DeployIntegrations
///           SWAP_ROUTER       — UniV3RouterAdapter from DeployIntegrations
///           POOL_DEPLOYER     — V3PoolDeployerAdapter from DeployIntegrations
///           STOCK_SAMPLE      — a real tokenized-stock address (first machine)
///           VRF_SERVICE       — Robinhood Chain IVRFService address
///           VRF_COORDINATOR   — Chainlink VRF v2.5 coordinator (Base chain only)
///
///         Local dev (USE_MOCKS=true or chainId 31337):
///           All infra is auto-mocked; PIT.sol is deployed locally.
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
        address treasury        = _envOr("TREASURY", msg.sender);
        address protocolReserve = _envOr("PROTOCOL_RESERVE", msg.sender);
        address royalty         = _envOr("ROYALTY_RECEIVER", msg.sender);
        bool    useMocks        = _envBool("USE_MOCKS", block.chainid == 31337);

        vm.startBroadcast();
        Addrs memory a;

        // ── external deps ────────────────────────────────────────────────────────
        if (useMocks) {
            MockOracle o    = new MockOracle();
            MockSwapRouter r = new MockSwapRouter(address(o));
            MockStockToken s = new MockStockToken("Tokenized NVDA", "tNVDA", 18);
            o.setEthPerToken(address(s), 1e15);
            o.setUsdPerEth(3000e8);
            a.oracle      = address(o);
            a.router      = address(r);
            a.stockSample = address(s);
            a.conductor   = address(new MockEntropyConductor());
            a.poolDeployer = address(new MockPoolDeployer());
        } else {
            a.oracle      = vm.envAddress("ORACLE");
            a.router      = vm.envAddress("SWAP_ROUTER");
            a.stockSample = vm.envAddress("STOCK_SAMPLE");
            a.poolDeployer = vm.envAddress("POOL_DEPLOYER");
            Chains.EntropyKind ek = Chains.entropyKind(block.chainid);
            if (ek == Chains.EntropyKind.VRFService) {
                // Robinhood Chain: managed IVRFService. After deploy: the service
                // owner must setSpinEngine(conductor) and fund it with ETH for fees.
                a.conductor = address(new VRFServiceConductor(vm.envAddress("VRF_SERVICE"), msg.sender));
            } else if (ek == Chains.EntropyKind.Miner) {
                a.conductor = address(new MinerEntropyConductor(Chains.blockTimeMs(block.chainid)));
            } else {
                a.conductor = address(new VRFEntropyConductor(vm.envAddress("VRF_COORDINATOR")));
            }
        }

        // ── $PIT token ───────────────────────────────────────────────────────────
        // Mocks: deploy PIT.sol locally (treasury receives full supply).
        // Mainnet: PIT_TOKEN is optional — omit to deploy platform without PIT now
        //          and wire the Pons-graduated address later via setPIT().
        if (useMocks) {
            a.pit = address(new PIT(treasury));
        } else {
            a.pit = _envOr("PIT_TOKEN", address(0)); // address(0) → deferred via setPIT()
        }

        // ── token-bound accounts + collection ────────────────────────────────────
        a.account  = address(new PitBossAccount());
        a.registry = address(new InitializingRegistry(a.account));
        a.boss     = address(new PitBoss(a.registry, royalty));

        // ── floor + book ─────────────────────────────────────────────────────────
        FloorPosition floor = new FloorPosition();
        a.floor = address(floor);
        HouseBook book = new HouseBook(a.boss, a.floor, a.router);
        a.book = address(book);
        floor.setRewardSink(a.book);

        // ── amm ──────────────────────────────────────────────────────────────────
        FlatAMMVault amm = new FlatAMMVault(a.boss, a.pit, a.book);
        a.amm = address(amm);
        PitBoss(a.boss).setMinter(a.amm, true);

        // ── activation ───────────────────────────────────────────────────────────
        ActivationManager activation = new ActivationManager(a.boss, a.pit, a.floor, a.book);
        a.activation = address(activation);
        floor.setBumper(a.activation, true);

        // ── certificates ─────────────────────────────────────────────────────────
        BearerCertificate cert = new BearerCertificate(a.registry, royalty);
        a.certificate = address(cert);
        CertificateCounter counter = new CertificateCounter(a.certificate, a.book, a.oracle, protocolReserve);
        a.counter = address(counter);
        cert.setIssuer(a.counter, true);
        if (useMocks) counter.setRouted(a.stockSample, true);

        // ── degen roll factory + sample machine (mocks only) ─────────────────────
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

        // ── roulette factory + sample wheel (mocks only) ─────────────────────────
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

        // ── locker + loans ───────────────────────────────────────────────────────
        a.locker = address(new LiquidityLocker(a.book));
        LoanVault loans = new LoanVault(a.boss, a.pit, a.amm, a.book, a.oracle, protocolReserve);
        a.loans = address(loans);
        amm.setLiquidator(a.loans, true);

        // ── launcher + bell ──────────────────────────────────────────────────────
        OpeningBell bell = new OpeningBell(a.conductor);
        a.bell = address(bell);
        LauncherFactory launcher = new LauncherFactory(a.book, a.bell, a.locker, a.poolDeployer);
        a.launcher = address(launcher);
        bell.setLauncher(a.launcher);

        // ── seasons ──────────────────────────────────────────────────────────────
        SeasonEngine season = new SeasonEngine(a.floor);
        a.season = address(season);
        floor.setBumper(a.season, true);

        vm.stopBroadcast();

        _write(a);
        console2.log("Deployed PitBosses to chain", block.chainid);
        if (!useMocks) {
            console2.log("FlatAMMVault:           ", a.amm);
            console2.log("ActivationManager:      ", a.activation);
            console2.log("LoanVault:              ", a.loans);
            if (a.pit == address(0)) {
                console2.log("PIT token:              not set -- call setPIT() on the three contracts above after Pons graduation");
            } else {
                console2.log("PIT token (Pons):       ", a.pit);
                console2.log("NEXT: transfer PIT allowance to FlatAMMVault for buyer pull-transfers");
            }
            console2.log("      fund DegenRoll/RouletteWheel bankrolls via restock()");
            console2.log("      transfer contract ownership to timelock");
        }
    }

    // ── json output ─────────────────────────────────────────────────────────────

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

    // ── env helpers ─────────────────────────────────────────────────────────────

    function _envOr(string memory key, address dflt) internal view returns (address) {
        try vm.envAddress(key) returns (address v) { return v; }
        catch { return dflt; }
    }

    function _envBool(string memory key, bool dflt) internal view returns (bool) {
        try vm.envBool(key) returns (bool v) { return v; }
        catch { return dflt; }
    }

}
