// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockStockToken
/// @notice Stand-in for a tokenized stock (e.g. tokenized NVDA) on testnet/anvil.
///         Freely mintable so tests and local forks can seed inventory. On
///         mainnet these are replaced by the real routed stock-token addresses in
///         Chains config.
contract MockStockToken is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 dec_) ERC20(name_, symbol_) {
        _decimals = dec_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
