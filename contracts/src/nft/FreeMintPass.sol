// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IPitBossNFT {
    function mint(address to) external returns (uint256 tokenId);
}

/// @notice Open free mint — caller pays gas only. No per-wallet cap; supply
///         cap (888) is enforced by PitBoss.SupplyExhausted.
///         Deploy → PitBoss.setMinter(address(this), true).
///         When $PIT launches: setOpen(false), hand minting back to FlatAMMVault.
contract FreeMintPass is Ownable {
    uint256 public constant MAX_BATCH = 10;

    IPitBossNFT public immutable pitBoss;
    bool public open;

    event Minted(address indexed to, uint256 indexed tokenId);

    error MintClosed();
    error BatchTooLarge();
    error BatchZero();

    constructor(address pitBoss_) Ownable(msg.sender) {
        pitBoss = IPitBossNFT(pitBoss_);
        open = true;
    }

    function mint() external {
        if (!open) revert MintClosed();
        uint256 id = pitBoss.mint(msg.sender);
        emit Minted(msg.sender, id);
    }

    function mintMany(uint256 count) external {
        if (!open) revert MintClosed();
        if (count == 0) revert BatchZero();
        if (count > MAX_BATCH) revert BatchTooLarge();
        for (uint256 i = 0; i < count; i++) {
            uint256 id = pitBoss.mint(msg.sender);
            emit Minted(msg.sender, id);
        }
    }

    function setOpen(bool open_) external onlyOwner {
        open = open_;
    }
}
