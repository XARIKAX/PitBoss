// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {InitializingRegistry} from "../tba/InitializingRegistry.sol";
import {IPitBoss} from "../interfaces/Support.sol";

/// @title PitBoss
/// @notice The fixed-supply collection at the heart of the floor. Every token
///         gets an ERC-6551 token-bound account (TBA) created and initialized
///         atomically at mint via the InitializingRegistry.
/// @dev    [CONFIG: MAX_SUPPLY = 4,200]. Owner surface is limited to metadata and
///         the mint minter role; it can never touch a TBA's balance. Activation
///         state (held elsewhere) is cleared on true ownership transfer, which is
///         detected via the `transferEpoch` counter bumped in `_update`.
contract PitBoss is ERC721, ERC2981, Ownable, IPitBoss {
    using Strings for uint256;

    /// @notice Hard cap on Bosses. [CONFIG]
    uint256 public constant MAX_SUPPLY = 4200;

    InitializingRegistry public immutable registry;

    uint256 private _minted;
    string private _baseTokenURI;

    /// @inheritdoc IPitBoss
    mapping(uint256 => uint256) public transferEpoch;

    /// @notice Addresses allowed to mint (the AMM vault). Set once by owner.
    mapping(address => bool) public isMinter;

    event MinterSet(address indexed minter, bool allowed);
    event BossMinted(uint256 indexed tokenId, address indexed to, address tba);

    error NotMinter();
    error SupplyExhausted();

    constructor(address registry_, address royaltyReceiver)
        ERC721("PitBosses", "BOSS")
        Ownable(msg.sender)
    {
        require(registry_ != address(0), "registry=0");
        registry = InitializingRegistry(registry_);
        // Royalty 3.33%, hard cap 5% enforced by never setting above 500 bps.
        _setDefaultRoyalty(royaltyReceiver, 333);
    }

    // -------- minting --------

    function setMinter(address minter, bool allowed) external onlyOwner {
        isMinter[minter] = allowed;
        emit MinterSet(minter, allowed);
    }

    /// @notice Mint the next Boss to `to` and create its TBA atomically.
    /// @dev    Sequential token ids [1 .. MAX_SUPPLY]. Only a registered minter
    ///         (the AMM vault) may call.
    function mint(address to) external returns (uint256 tokenId) {
        if (!isMinter[msg.sender]) revert NotMinter();
        if (_minted >= MAX_SUPPLY) revert SupplyExhausted();
        tokenId = ++_minted;
        _safeMint(to, tokenId);
        address tba = registry.createAccount(address(this), tokenId);
        emit BossMinted(tokenId, to, tba);
    }

    // -------- views --------

    /// @inheritdoc IPitBoss
    function accountOf(uint256 tokenId) public view returns (address) {
        return registry.accountOf(address(this), tokenId);
    }

    /// @inheritdoc IPitBoss
    function totalMinted() external view returns (uint256) {
        return _minted;
    }

    function ownerOf(uint256 tokenId) public view override(ERC721, IPitBoss) returns (address) {
        return super.ownerOf(tokenId);
    }

    // -------- metadata --------

    function setBaseURI(string calldata uri) external onlyOwner {
        _baseTokenURI = uri;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    /// @notice Update royalty receiver only. Bps fixed at 333 (never above the 500
    ///         hard cap), so the admin cannot inflate royalties.
    function setRoyaltyReceiver(address receiver) external onlyOwner {
        _setDefaultRoyalty(receiver, 333);
    }

    // -------- transfer-epoch tracking --------

    /// @dev Bump the transfer epoch on every real transfer (mint excluded: from==0).
    ///      Used by ActivationManager to clear activation on true ownership change.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address from)
    {
        from = super._update(to, tokenId, auth);
        if (from != address(0)) {
            unchecked {
                ++transferEpoch[tokenId];
            }
        }
    }

    function supportsInterface(bytes4 id) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(id);
    }
}
