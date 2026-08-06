// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/// @title LaunchToken
/// @notice ERC-20 minted by a launch on the Launcher. The launcher is the sole
///         minter (up to `maxSupply`); anyone can burn (buybacks burn supply).
contract LaunchToken is ERC20, ERC20Burnable {
    address public immutable launcher;
    uint256 public immutable maxSupply;

    error NotLauncher();
    error MaxSupply();

    constructor(string memory name_, string memory symbol_, uint256 maxSupply_, address launcher_)
        ERC20(name_, symbol_)
    {
        launcher = launcher_;
        maxSupply = maxSupply_;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != launcher) revert NotLauncher();
        if (totalSupply() + amount > maxSupply) revert MaxSupply();
        _mint(to, amount);
    }
}
