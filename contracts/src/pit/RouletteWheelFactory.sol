// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {RouletteWheel} from "./RouletteWheel.sol";
import {Errors} from "../lib/Errors.sol";

/// @title RouletteWheelFactory
/// @notice Deploys one Roulette wheel per stock token and records the mapping —
///         the roulette counterpart of DegenRollFactory, so both Pit games are
///         provisioned the same way (a table per payout stock). Wheels are
///         ownerless after deploy; the factory only holds the shared wiring.
/// @dev    After a wheel is created it must be registered as a certificate issuer
///         (BearerCertificate.setIssuer) and a floor bumper (FloorPosition.setBumper)
///         by the protocol owner — see script/Deploy.s.sol. Each wheel needs its own
///         seeded bankroll before play. The factory does not custody funds.
contract RouletteWheelFactory is Ownable {
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
        /// @notice $PITBOSS. Zero leaves PIT betting disabled on new wheels.
        address pit;
    }

    Wiring public wiring;
    mapping(address => address) public wheelOf; // stock token => wheel
    address[] public allWheels;

    event WheelCreated(address indexed stock, address indexed wheel, address indexed creator);
    event WiringUpdated();

    constructor(Wiring memory w) Ownable(msg.sender) {
        wiring = w;
        emit WiringUpdated();
    }

    /// @notice Update the shared wiring for wheels deployed hereafter. Does not
    ///         affect already-deployed wheels (their wiring is immutable).
    function setWiring(Wiring calldata w) external onlyOwner {
        wiring = w;
        emit WiringUpdated();
    }

    /// @notice Deploy the roulette wheel for `stock`. One per token. `creator`
    ///         receives the creator rake share.
    function createWheel(address stock, address creator) external onlyOwner returns (address wheel) {
        if (wheelOf[stock] != address(0)) revert Errors.InvalidConfig();
        Wiring memory w = wiring;
        wheel = address(
            new RouletteWheel(
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
                w.protocolReserve,
                w.pit
            )
        );
        wheelOf[stock] = wheel;
        allWheels.push(wheel);
        emit WheelCreated(stock, wheel, creator);
    }

    function wheelCount() external view returns (uint256) {
        return allWheels.length;
    }
}
