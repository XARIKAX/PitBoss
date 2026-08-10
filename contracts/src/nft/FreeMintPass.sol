// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IPitBossNFT {
    function mint(address to) external returns (uint256 tokenId);
}

/// @notice Open free mint — caller pays gas only. Up to MAX_PER_WALLET Bosses
///         per wallet, batchable in one transaction; the 888 supply cap is
///         enforced by PitBoss.SupplyExhausted.
///         Deploy → PitBoss.setMinter(address(this), true) (and revoke any
///         previous pass).
///         When $PIT launches: setOpen(false), hand minting back to FlatAMMVault.
contract FreeMintPass is Ownable {
    /// @notice Free-mint allowance per wallet, batchable in one tx. [CONFIG: 10]
    uint256 public constant MAX_PER_WALLET = 10;
    /// @notice Free mints already taken per wallet.
    mapping(address => uint256) public mintedBy;

    IPitBossNFT public immutable pitBoss;
    bool public open;

    event Minted(address indexed to, uint256 indexed tokenId);

    error MintClosed();
    error InvalidCount();
    error WalletLimit();

    constructor(address pitBoss_) Ownable(msg.sender) {
        pitBoss = IPitBossNFT(pitBoss_);
        open = true;
    }

    /// @notice Mint one Boss (single-mint UI compatibility).
    function mint() external {
        _mintMany(msg.sender, 1);
    }

    /// @notice Mint up to MAX_PER_WALLET Bosses in one transaction, bounded by
    ///         the caller's remaining wallet allowance.
    function mint(uint256 count) external {
        _mintMany(msg.sender, count);
    }

    /// @notice Remaining free-mint allowance for `who`.
    function remainingOf(address who) external view returns (uint256) {
        uint256 used = mintedBy[who];
        return used >= MAX_PER_WALLET ? 0 : MAX_PER_WALLET - used;
    }

    function _mintMany(address to, uint256 count) internal {
        if (!open) revert MintClosed();
        if (count == 0 || count > MAX_PER_WALLET) revert InvalidCount();
        uint256 used = mintedBy[to];
        if (used + count > MAX_PER_WALLET) revert WalletLimit();
        mintedBy[to] = used + count;
        for (uint256 i; i < count; ++i) {
            uint256 id = pitBoss.mint(to);
            emit Minted(to, id);
        }
    }

    function setOpen(bool open_) external onlyOwner {
        open = open_;
    }
}
