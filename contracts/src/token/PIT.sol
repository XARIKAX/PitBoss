// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title $PIT
/// @notice The floor's unit of account. Fixed supply minted once at construction
///         to the treasury; there is no mint function, so supply can only fall
///         (activation fees burn 50%). Utility: AMM pricing unit, activation
///         fees, launcher pairing.
/// @dev    [CONFIG: PIT_TOTAL_SUPPLY] fixed at 42,000,000 * 1e18. Burnable so the
///         Activation Manager can destroy the burn share; no privileged mint.
contract PIT is ERC20, ERC20Burnable, ERC20Permit {
    /// @notice Total supply, fixed forever at deployment. [CONFIG]
    uint256 public constant INITIAL_SUPPLY = 42_000_000 ether;

    constructor(address treasury) ERC20("PitBosses", "PIT") ERC20Permit("PitBosses") {
        require(treasury != address(0), "treasury=0");
        _mint(treasury, INITIAL_SUPPLY);
    }
}
