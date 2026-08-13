// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {MinerEntropyConductor} from "../src/pit/entropy/MinerEntropyConductor.sol";
import {DegenRollFactory} from "../src/pit/DegenRollFactory.sol";
import {RouletteWheelFactory} from "../src/pit/RouletteWheelFactory.sol";
import {BearerCertificate} from "../src/pit/BearerCertificate.sol";
import {FloorPosition} from "../src/floor/FloorPosition.sol";

/// @notice Replaces the VRFServiceConductor-based game contracts with ones backed
///         by MinerEntropyConductor — zero external dependencies, fully self-sufficient.
///
///         Deploys:
///           1. MinerEntropyConductor(12_000)  — blockhash commit-reveal, L1-synced
///           2. DegenRollFactory  (new wiring)
///           3. RouletteWheelFactory (new wiring)
///           4. createMachine + createWheel for NVDA/TSLA/AAPL
///           5. Registers each as certificate issuer + floor bumper
///           6. Patches deployments/deployments.4663.json (only 3 changed keys)
///
///         Run:
///           cd contracts
///           forge script script/RedeployWithMinerEntropy.s.sol \
///             --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast \
///             --verifier blockscout \
///             --verifier-url https://robinhoodchain.blockscout.com/api/
contract RedeployWithMinerEntropy is Script {

    // ── Already-deployed contracts (deployments.4663.json) ──────────────────────
    address constant CERTIFICATE      = 0x920598e4962cE1FeEa453Ea824273809840Df6c2;
    address constant FLOOR            = 0xcD9F1A5C49D935A7B1c251feB7d730667938B813;
    address constant HOUSE_BOOK       = 0x008718A207e78fc0f83f6454982063A99DdB41Ef;
    address constant ORACLE           = 0x0B6CdED92c881B2e879d8105a2b9236f3121289B;
    address constant ROUTER           = 0x0B09a1E136c6096f8C9E8478fe7705C5CE9Be3f9;
    address constant BOSS             = 0xaFC1acC4a5ABf7C317eE8D3D212C9c9331C9cc6E;
    address constant ACTIVATION       = 0x5807f5Bf9C18aF6D27DdA20b90e2810877672C4b;
    address constant PROTOCOL_RESERVE = 0x5Ce7FFce7c0cFb5210ADC4D23080f02B4379C61E;

    // ── Stocks with proven liquidity ─────────────────────────────────────────────
    address constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
    address constant TSLA = 0x322F0929c4625eD5bAd873c95208D54E1c003b2d;
    address constant AAPL = 0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9;

    /// @notice The wallet that deployed $PITBOSS. The machines and wheels created
    ///         here SELL $PITBOSS via restockPit(), so neither the deployer of this
    ///         script nor the creator may be this address: chart UIs attribute sells
    ///         from a token's deployer — and from contracts clustered to it — as a
    ///         dev sell and flag the pair. Use a second wallet you control.
    address constant PIT_DEPLOYER = 0x2fA1E9372c128e2A756f5BdD096d398eAEa0B659;

    // ── $PITBOSS, for PIT-staked bets on the machines and wheels ────────────────
    address constant PIT_TOKEN = 0xd6f542cAdD79F1ec824883a0fdb90cB8c980A7aD;

    // ── Robinhood Chain: block.number == L1 block (~12 s cadence) ───────────────
    uint256 constant BLOCK_TIME_MS = 12_000;

    function run() external {
        // Creator receives the per-game creator rake. Must not be the $PITBOSS
        // deployer — see PIT_DEPLOYER above.
        address creator = vm.envAddress("GAME_CREATOR");
        require(creator != address(0), "GAME_CREATOR not set");
        require(creator != PIT_DEPLOYER, "GAME_CREATOR must not be the $PITBOSS deployer");

        vm.startBroadcast();
        require(msg.sender != PIT_DEPLOYER, "broadcast from a wallet other than the $PITBOSS deployer");

        // 1. Self-sufficient entropy — blockhash commit-reveal, no third party needed
        MinerEntropyConductor conductor = new MinerEntropyConductor(BLOCK_TIME_MS);
        console2.log("MinerEntropyConductor:", address(conductor));

        DegenRollFactory.Wiring memory wiring = DegenRollFactory.Wiring({
            conductor:       address(conductor),
            houseBook:       HOUSE_BOOK,
            oracle:          ORACLE,
            router:          ROUTER,
            certificate:     CERTIFICATE,
            boss:            BOSS,
            activation:      ACTIVATION,
            floor:           FLOOR,
            protocolReserve: PROTOCOL_RESERVE,
            pit:             PIT_TOKEN
        });

        // 2. New factories (fresh machineOf / wheelOf mappings — no collision with old factories)
        DegenRollFactory rollFactory = new DegenRollFactory(wiring);
        console2.log("DegenRollFactory:     ", address(rollFactory));

        RouletteWheelFactory rouletteFactory = new RouletteWheelFactory(
            RouletteWheelFactory.Wiring({
                conductor:       address(conductor),
                houseBook:       HOUSE_BOOK,
                oracle:          ORACLE,
                router:          ROUTER,
                certificate:     CERTIFICATE,
                boss:            BOSS,
                activation:      ACTIVATION,
                floor:           FLOOR,
                protocolReserve: PROTOCOL_RESERVE,
                pit:             PIT_TOKEN
            })
        );
        console2.log("RouletteWheelFactory: ", address(rouletteFactory));

        // 3. Create machines + wheels, register permissions
        address[3] memory stocks = [NVDA, TSLA, AAPL];
        string[3] memory syms    = ["NVDA", "TSLA", "AAPL"];

        // NOTE: setIssuer/setBumper are deliberately NOT called here. They are
        // onlyOwner on BearerCertificate and FloorPosition, which are owned by the
        // $PITBOSS deployer — the one wallet this script must not broadcast from.
        // They are printed below for that wallet to run as a second step.
        address[6] memory created;
        for (uint256 i = 0; i < 3; i++) {
            address machine = rollFactory.createMachine(stocks[i], creator);
            console2.log(string.concat(syms[i], " machine:"), machine);
            created[i * 2] = machine;

            address wheel = rouletteFactory.createWheel(stocks[i], creator);
            console2.log(string.concat(syms[i], " wheel:  "), wheel);
            created[i * 2 + 1] = wheel;
        }

        vm.stopBroadcast();

        console2.log("");
        console2.log("NEXT - run these from the protocol owner wallet (the $PITBOSS");
        console2.log("deployer), which owns BearerCertificate and FloorPosition.");
        console2.log("Until they are run, wins cannot be sealed into certificates and");
        console2.log("bankroll staking will not award floor points.");
        console2.log("  certificate:", CERTIFICATE);
        console2.log("  floor:      ", FLOOR);
        for (uint256 i = 0; i < 6; i++) {
            console2.log("    setIssuer/setBumper ->", created[i]);
        }

        // 4. Patch only the three changed keys — everything else in the JSON is untouched
        string memory path = "deployments/deployments.4663.json";
        vm.writeJson(vm.toString(address(conductor)),      path, ".EntropyConductor");
        vm.writeJson(vm.toString(address(rollFactory)),    path, ".DegenRollFactory");
        vm.writeJson(vm.toString(address(rouletteFactory)), path, ".RouletteWheelFactory");
        console2.log("Patched", path);
    }
}
