// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PitBoss} from "../nft/PitBoss.sol";
import {IHouseBook} from "../interfaces/IHouseBook.sol";
import {Errors} from "../lib/Errors.sol";

/// @title FlatAMMVault
/// @notice Flat-price primary market for Bosses. Every Boss costs a fixed
///         PRICE_PIT in $PIT plus an ETH fee. Buy the next Boss out of the vault
///         (mints a fresh one if inventory is empty and supply remains), or snipe
///         a specific in-vault id for a higher ETH fee. All ETH fees → House Book.
/// @dev    The vault's $PIT balance is the flat "AMM principal" that the Loan Vault
///         lends against and that defaulted Bosses are liquidated into. This
///         contract holds money ($PIT + transient ETH) — audit-scoped.
contract FlatAMMVault is IERC721Receiver, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    PitBoss public immutable boss;
    IERC20 public immutable pit;
    IHouseBook public houseBook;

    /// @notice Flat $PIT price per Boss. Settable so it can be tuned to the token's
    ///         total supply — e.g. a launchpad ($PITBOSS on Pons) token whose supply
    ///         differs from the reference 42M. [CONFIG: default 500,000]
    uint256 public PRICE_PIT = 500_000 ether;
    /// @notice ETH fee to buy the next Boss. [CONFIG]
    uint256 public buyFee = 0.002 ether;
    /// @notice ETH fee to snipe a specific in-vault Boss (higher). [CONFIG]
    uint256 public snipeFee = 0.006 ether;

    /// @notice FIFO inventory of Bosses the vault holds (from returns/liquidations).
    uint256[] private _inventory;
    uint256 private _invHead; // index of next-to-dispense

    /// @notice Authorized to deposit liquidated Bosses into inventory (LoanVault).
    mapping(address => bool) public isLiquidator;

    event BoughtNext(address indexed buyer, uint256 indexed tokenId, bool minted, uint256 ethFee);
    event Sniped(address indexed buyer, uint256 indexed tokenId, uint256 ethFee);
    event LiquidatorSet(address indexed who, bool allowed);
    event FeesSet(uint256 buyFee, uint256 snipeFee);
    event PriceSet(uint256 price);
    event HouseBookSet(address houseBook);

    constructor(address boss_, address pit_, address houseBook_) Ownable(msg.sender) {
        if (boss_ == address(0) || pit_ == address(0) || houseBook_ == address(0)) revert Errors.ZeroAddress();
        boss = PitBoss(boss_);
        pit = IERC20(pit_);
        houseBook = IHouseBook(houseBook_);
    }

    // -------- admin: fee + recipient only --------

    function setFees(uint256 buyFee_, uint256 snipeFee_) external onlyOwner {
        buyFee = buyFee_;
        snipeFee = snipeFee_;
        emit FeesSet(buyFee_, snipeFee_);
    }

    /// @notice Set the flat $PIT price per Boss (tune to the token supply).
    function setPrice(uint256 price) external onlyOwner {
        if (price == 0) revert Errors.InvalidConfig();
        PRICE_PIT = price;
        emit PriceSet(price);
    }

    function setHouseBook(address houseBook_) external onlyOwner {
        if (houseBook_ == address(0)) revert Errors.ZeroAddress();
        houseBook = IHouseBook(houseBook_);
        emit HouseBookSet(houseBook_);
    }

    function setLiquidator(address who, bool allowed) external onlyOwner {
        isLiquidator[who] = allowed;
        emit LiquidatorSet(who, allowed);
    }

    // -------- buy --------

    /// @notice Buy the next Boss: dispense oldest inventory, else mint a fresh one.
    ///         Costs PRICE_PIT $PIT (approve first) + `buyFee` ETH.
    function buyNext() external payable nonReentrant returns (uint256 tokenId) {
        if (msg.value < buyFee) revert Errors.InsufficientPayment();
        pit.safeTransferFrom(msg.sender, address(this), PRICE_PIT);

        bool minted;
        if (_invHead < _inventory.length) {
            tokenId = _inventory[_invHead++];
            boss.safeTransferFrom(address(this), msg.sender, tokenId);
        } else {
            tokenId = boss.mint(msg.sender);
            minted = true;
        }
        _forwardFee(msg.value);
        emit BoughtNext(msg.sender, tokenId, minted, msg.value);
    }

    /// @notice Snipe a specific in-vault Boss. Costs PRICE_PIT $PIT + `snipeFee` ETH.
    function snipe(uint256 tokenId) external payable nonReentrant {
        if (msg.value < snipeFee) revert Errors.InsufficientPayment();
        if (boss.ownerOf(tokenId) != address(this)) revert Errors.NotOwner();
        pit.safeTransferFrom(msg.sender, address(this), PRICE_PIT);
        _removeFromInventory(tokenId);
        boss.safeTransferFrom(address(this), msg.sender, tokenId);
        _forwardFee(msg.value);
        emit Sniped(msg.sender, tokenId, msg.value);
    }

    // -------- liquidation intake --------

    /// @notice Called by the Loan Vault when a defaulted Boss is liquidated into
    ///         the AMM. The Boss becomes fresh inventory.
    function depositLiquidated(uint256 tokenId) external {
        if (!isLiquidator[msg.sender]) revert Errors.NotAuthorized();
        boss.safeTransferFrom(msg.sender, address(this), tokenId);
        // ownerOf now == this; recorded in onERC721Received.
    }

    // -------- views --------

    function inventoryLength() external view returns (uint256) {
        return _inventory.length - _invHead;
    }

    function peekNext() external view returns (bool willMint, uint256 tokenId) {
        if (_invHead < _inventory.length) return (false, _inventory[_invHead]);
        return (true, boss.totalMinted() + 1);
    }

    // -------- internal --------

    function _forwardFee(uint256 amount) internal {
        houseBook.payFee{value: amount}(IHouseBook.Source.AmmFees);
    }

    function _removeFromInventory(uint256 tokenId) internal {
        uint256 n = _inventory.length;
        for (uint256 i = _invHead; i < n; ++i) {
            if (_inventory[i] == tokenId) {
                _inventory[i] = _inventory[_invHead];
                ++_invHead;
                return;
            }
        }
        // Not tracked (e.g. transferred in directly); allow snipe anyway.
    }

    function onERC721Received(address, address, uint256 tokenId, bytes calldata)
        external
        returns (bytes4)
    {
        if (msg.sender == address(boss)) {
            _inventory.push(tokenId);
        }
        return IERC721Receiver.onERC721Received.selector;
    }
}
