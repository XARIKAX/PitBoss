// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockTaxToken
/// @notice A fee-on-transfer ERC-20 that stands in for a launchpad token
///         ($PITBOSS on Pons) with a 1–2% creator tax. Every transfer routes
///         `taxBps` to `taxSink`; mints and burns (to/from the zero address) are
///         untaxed. Used to prove the protocol's token paths are fee-on-transfer
///         safe. Exposes no `burn()` — matching a typical launchpad token.
contract MockTaxToken is ERC20 {
    uint256 public taxBps; // e.g. 200 = 2%
    address public taxSink;

    constructor(string memory name_, string memory symbol_, uint256 taxBps_, address taxSink_)
        ERC20(name_, symbol_)
    {
        taxBps = taxBps_;
        taxSink = taxSink_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        // No tax on mint (from==0) or burn (to==0), or when tax is disabled.
        if (from == address(0) || to == address(0) || taxBps == 0) {
            super._update(from, to, value);
            return;
        }
        uint256 tax = (value * taxBps) / 10_000;
        if (tax > 0) super._update(from, taxSink, tax);
        super._update(from, to, value - tax);
    }
}
