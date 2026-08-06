// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC6551Account} from "erc6551/interfaces/IERC6551Account.sol";
import {IERC6551Executable} from "erc6551/interfaces/IERC6551Executable.sol";

/// @title PitBossAccount
/// @notice Token-bound account (ERC-6551) for a PitBoss NFT. Deployed as an
///         ERC-1167 clone and initialized atomically by the InitializingRegistry
///         so an uninitialized account can never be observed on-chain.
/// @dev    The binding (chainId, tokenContract, tokenId) is written once in
///         `initialize` and thereafter immutable. Only the current NFT holder may
///         execute. Stock rewards (ERC-20) simply accumulate at this address and
///         travel with the NFT on sale, exactly as the product promises.
contract PitBossAccount is IERC165, IERC1271, IERC6551Account, IERC6551Executable, ReentrancyGuard {
    uint256 private _chainId;
    address private _tokenContract;
    uint256 private _tokenId;
    uint256 private _state;
    bool private _initialized;

    error AlreadyInitialized();
    error NotAuthorized();
    error OnlyCallOperations();

    receive() external payable {}

    /// @notice One-time binding. Called by the InitializingRegistry in the same
    ///         transaction as clone deployment.
    function initialize(uint256 chainId_, address tokenContract_, uint256 tokenId_) external {
        if (_initialized) revert AlreadyInitialized();
        _initialized = true;
        _chainId = chainId_;
        _tokenContract = tokenContract_;
        _tokenId = tokenId_;
    }

    /// @inheritdoc IERC6551Executable
    /// @dev Only CALL (operation 0) is supported; delegatecall/create are refused
    ///      so a compromised holder cannot mutate account code or storage layout.
    function execute(address to, uint256 value, bytes calldata data, uint8 operation)
        external
        payable
        nonReentrant
        returns (bytes memory result)
    {
        if (!_isValidSigner(msg.sender)) revert NotAuthorized();
        if (operation != 0) revert OnlyCallOperations();
        ++_state;
        bool ok;
        (ok, result) = to.call{value: value}(data);
        if (!ok) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }

    /// @inheritdoc IERC6551Account
    function token() public view returns (uint256, address, uint256) {
        return (_chainId, _tokenContract, _tokenId);
    }

    /// @notice Current NFT holder — the sole authorized signer.
    function owner() public view returns (address) {
        if (_chainId != block.chainid) return address(0);
        return IERC721(_tokenContract).ownerOf(_tokenId);
    }

    /// @inheritdoc IERC6551Account
    function state() external view returns (uint256) {
        return _state;
    }

    /// @inheritdoc IERC6551Account
    function isValidSigner(address signer, bytes calldata) external view returns (bytes4) {
        return _isValidSigner(signer) ? IERC6551Account.isValidSigner.selector : bytes4(0);
    }

    /// @inheritdoc IERC1271
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        bool ok = SignatureChecker.isValidSignatureNow(owner(), hash, signature);
        return ok ? IERC1271.isValidSignature.selector : bytes4(0);
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == type(IERC165).interfaceId || id == type(IERC6551Account).interfaceId
            || id == type(IERC6551Executable).interfaceId;
    }

    function _isValidSigner(address signer) internal view returns (bool) {
        return signer == owner();
    }
}
