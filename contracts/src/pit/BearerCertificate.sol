// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {InitializingRegistry} from "../tba/InitializingRegistry.sol";
import {Errors} from "../lib/Errors.sol";

/// @title BearerCertificate
/// @notice Numbered bearer deeds. Each certificate vaults an exact amount of a
///         single stock token; `redeem()` burns the deed and releases the stock in
///         the same transaction, so a spent certificate can never exist. Artwork
///         is contract-drawn onchain SVG (no servers). Each deed also gets its own
///         ERC-6551 TBA for parity with the collection.
/// @dev    Backing is custodied in-contract and accounted per deed, which makes
///         invariant #1 (supply == vaulted deeds) hold by construction and makes
///         redeem trivially atomic. Redeem/transfer are never pausable — only new
///         issuance can be gated (upstream, by the machine/counter). Audit-scoped.
contract BearerCertificate is ERC721, ERC2981, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Strings for uint256;
    using Strings for address;

    struct Deed {
        address token;
        uint256 amount;
    }

    InitializingRegistry public immutable registry;

    uint256 private _nextId = 1;
    mapping(uint256 => Deed) public deedOf;
    mapping(address => uint256) public totalBackedOf; // Σ live deed amounts per token
    mapping(address => bool) public isIssuer; // Certificate Counter + Degen Roll machines

    event IssuerSet(address indexed issuer, bool allowed);
    event Issued(uint256 indexed certId, address indexed to, address token, uint256 amount, address tba);
    event Redeemed(uint256 indexed certId, address indexed to, address token, uint256 amount);

    constructor(address registry_, address royaltyReceiver)
        ERC721("PitBosses Bearer Certificate", "CERT")
        Ownable(msg.sender)
    {
        if (registry_ == address(0)) revert Errors.ZeroAddress();
        registry = InitializingRegistry(registry_);
        _setDefaultRoyalty(royaltyReceiver, 333); // 3.33%, never above the 5% cap
    }

    // -------- issuance control (never gates redeem) --------

    function setIssuer(address issuer, bool allowed) external onlyOwner {
        isIssuer[issuer] = allowed;
        emit IssuerSet(issuer, allowed);
    }

    function setRoyaltyReceiver(address receiver) external onlyOwner {
        _setDefaultRoyalty(receiver, 333);
    }

    /// @notice Issue a deed backed by `amount` of `token`, pulled from the caller
    ///         (an authorized issuer that already holds the stock). Mints the deed
    ///         to `to` and creates its TBA.
    function issue(address to, address token, uint256 amount)
        external
        nonReentrant
        returns (uint256 certId)
    {
        if (!isIssuer[msg.sender]) revert Errors.NotAuthorized();
        if (amount == 0) revert Errors.ZeroAmount();

        uint256 balBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - balBefore;
        // Credit exactly what was received (fee-on-transfer safe).

        certId = _nextId++;
        deedOf[certId] = Deed(token, received);
        totalBackedOf[token] += received;
        _safeMint(to, certId);
        address tba = registry.createAccount(address(this), certId);
        emit Issued(certId, to, token, received, tba);
    }

    /// @notice Burn the deed and release its stock to the holder, atomically.
    ///         Always available — never pausable.
    function redeem(uint256 certId) external nonReentrant {
        address holder = ownerOf(certId);
        if (holder != msg.sender) revert Errors.NotOwner();
        Deed memory d = deedOf[certId];
        delete deedOf[certId];
        totalBackedOf[d.token] -= d.amount;
        _burn(certId);
        IERC20(d.token).safeTransfer(holder, d.amount);
        emit Redeemed(certId, holder, d.token, d.amount);
    }

    function accountOf(uint256 certId) external view returns (address) {
        return registry.accountOf(address(this), certId);
    }

    function totalSupply() external view returns (uint256) {
        return _nextId - 1;
    }

    // -------- onchain SVG --------

    function tokenURI(uint256 certId) public view override returns (string memory) {
        _requireOwned(certId);
        Deed memory d = deedOf[certId];
        string memory sym = _symbol(d.token);
        string memory amt = _fixed(d.amount, _dec(d.token));
        string memory svg = _svg(certId, sym, amt);
        string memory json = string.concat(
            '{"name":"Bearer Certificate #',
            certId.toString(),
            '","description":"A PitBosses bearer certificate. Redeem to release ',
            amt,
            " ",
            sym,
            ' held in vault.","attributes":[{"trait_type":"Stock","value":"',
            sym,
            '"},{"trait_type":"Amount","value":"',
            amt,
            '"}],"image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)),
            '"}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _svg(uint256 certId, string memory sym, string memory amt)
        internal
        pure
        returns (string memory)
    {
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380">',
            '<rect width="600" height="380" fill="#0A0A0A"/>',
            '<rect x="16" y="16" width="568" height="348" fill="none" stroke="#C6FF00" stroke-width="1.5"/>',
            '<text x="40" y="70" fill="#F5F3EE" font-family="Georgia,serif" font-size="34" font-style="italic">PitBosses</text>',
            '<text x="40" y="104" fill="#8A8A84" font-family="monospace" font-size="13" letter-spacing="3">BEARER CERTIFICATE</text>',
            '<text x="40" y="240" fill="#C6FF00" font-family="monospace" font-size="60">',
            amt,
            '</text><text x="40" y="285" fill="#F5F3EE" font-family="monospace" font-size="26" letter-spacing="4">',
            sym,
            '</text><text x="40" y="344" fill="#8A8A84" font-family="monospace" font-size="15">No. ',
            certId.toString(),
            "  \xC2\xB7  redeem burns this note</text>",
            "</svg>"
        );
    }

    // -------- metadata helpers --------

    function _symbol(address token) internal view returns (string memory) {
        try IERC20Metadata(token).symbol() returns (string memory s) {
            return s;
        } catch {
            return "STOCK";
        }
    }

    function _dec(address token) internal view returns (uint8) {
        try IERC20Metadata(token).decimals() returns (uint8 d) {
            return d;
        } catch {
            return 18;
        }
    }

    /// @dev Render a fixed-point amount with up to 4 fractional digits.
    function _fixed(uint256 amount, uint8 decimals) internal pure returns (string memory) {
        uint256 unit = 10 ** decimals;
        uint256 whole = amount / unit;
        uint256 frac = ((amount % unit) * 10_000) / unit; // 4 dp
        if (frac == 0) return whole.toString();
        bytes memory f = bytes(frac.toString());
        // left-pad to 4 digits
        string memory pad = "";
        for (uint256 i = f.length; i < 4; ++i) pad = string.concat(pad, "0");
        return string.concat(whole.toString(), ".", pad, string(f));
    }

    function supportsInterface(bytes4 id) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(id);
    }
}
