// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {DegenRoll} from "./DegenRoll.sol";
import {Errors} from "../lib/Errors.sol";

/// @title DegenRollFactory
/// @notice Deploys one Degen Roll machine per stock token and records the mapping.
///         Machines are ownerless after deploy; the factory only holds the shared
///         wiring addresses (entropy conductor, House Book, oracle, router,
///         certificate, collection, activation, floor, protocol reserve) so every
///         machine is configured identically.
/// @dev    After a machine is created it must be registered as a certificate issuer
///         (BearerCertificate.setIssuer) and a floor bumper (FloorPosition.setBumper)
///         by the protocol owner — see script/Deploy.s.sol. The factory intentionally
///         does not custody funds.
contract DegenRollFactory is Ownable {
    struct Wiring {
        address conductor;
        address houseBook;
        address oracle;
        address router;
        address certificate;
        address boss;
        address activation;
        address floor;
        address protocolReserve;
    }

    Wiring public wiring;
    mapping(address => address) public machineOf; // stock token => machine
    address[] public allMachines;

    event MachineCreated(address indexed stock, address indexed machine, address indexed creator);
    event WiringUpdated();

    constructor(Wiring memory w) Ownable(msg.sender) {
        wiring = w;
        emit WiringUpdated();
    }

    /// @notice Update the shared wiring for machines deployed hereafter. Does not
    ///         affect already-deployed machines (their wiring is immutable).
    function setWiring(Wiring calldata w) external onlyOwner {
        wiring = w;
        emit WiringUpdated();
    }

    /// @notice Deploy the machine for `stock`. One per token. `creator` receives the
    ///         2.5% creator edge share.
    function createMachine(address stock, address creator) external onlyOwner returns (address machine) {
        if (machineOf[stock] != address(0)) revert Errors.InvalidConfig();
        Wiring memory w = wiring;
        machine = address(
            new DegenRoll(
                stock,
                w.conductor,
                w.houseBook,
                w.oracle,
                w.router,
                w.certificate,
                w.boss,
                w.activation,
                w.floor,
                creator,
                w.protocolReserve
            )
        );
        machineOf[stock] = machine;
        allMachines.push(machine);
        emit MachineCreated(stock, machine, creator);
    }

    function machineCount() external view returns (uint256) {
        return allMachines.length;
    }
}
