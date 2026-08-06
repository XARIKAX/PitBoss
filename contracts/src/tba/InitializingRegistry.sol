// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {PitBossAccount} from "./PitBossAccount.sol";

/// @title InitializingRegistry
/// @notice Deploys a token-bound account for a PitBoss NFT as an ERC-1167 clone
///         and initializes it atomically in the same call. The project brief
///         forbids using the canonical ERC-6551 registry alone (which leaves a
///         window where an account exists but is uninitialized / front-runnable);
///         this registry closes that window by construction.
/// @dev    Address is deterministic in (chainId, tokenContract, tokenId), so the
///         account can be referenced before it is created.
contract InitializingRegistry {
    /// @notice The account implementation cloned for every Boss.
    address public immutable implementation;

    event AccountCreated(address indexed account, address indexed tokenContract, uint256 indexed tokenId);

    constructor(address implementation_) {
        require(implementation_ != address(0), "impl=0");
        implementation = implementation_;
    }

    /// @notice Create (idempotently) and initialize the TBA for a given NFT.
    /// @return account The token-bound account address (existing or freshly created).
    function createAccount(address tokenContract, uint256 tokenId) external returns (address account) {
        bytes32 salt = _salt(tokenContract, tokenId);
        account = Clones.predictDeterministicAddress(implementation, salt);
        if (account.code.length == 0) {
            address deployed = Clones.cloneDeterministic(implementation, salt);
            // deployed == account by CREATE2 determinism.
            PitBossAccount(payable(deployed)).initialize(block.chainid, tokenContract, tokenId);
            emit AccountCreated(deployed, tokenContract, tokenId);
        }
    }

    /// @notice Deterministic address of a Boss's TBA, whether or not it exists yet.
    function accountOf(address tokenContract, uint256 tokenId) external view returns (address) {
        return Clones.predictDeterministicAddress(implementation, _salt(tokenContract, tokenId));
    }

    function _salt(address tokenContract, uint256 tokenId) internal view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, tokenContract, tokenId));
    }
}
