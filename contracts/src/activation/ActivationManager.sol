// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {IPitBoss, IActivationManager} from "../interfaces/Support.sol";
import {FloorPosition} from "../floor/FloorPosition.sol";
import {Errors} from "../lib/Errors.sol";

/// @title ActivationManager
/// @notice Puts a Boss on the payroll. Activation costs $PIT: 50% burned, 50% to
///         the House Book (parked as $PIT). Activation clears automatically on a
///         true ownership transfer — detected via the NFT's `transferEpoch` — so a
///         sold Boss falls off the payroll without any admin action.
/// @dev    Streak scoring: while a Boss stays activated, anyone may `pokeStreak`
///         to convert elapsed epochs into FloorPosition score (bounded per poke).
contract ActivationManager is IActivationManager, Ownable {
    using SafeERC20 for IERC20;

    IPitBoss public immutable pitBoss;
    ERC20Burnable public immutable pit;
    FloorPosition public immutable floor;
    address public houseBook; // parks the non-burned $PIT share

    /// @notice Activation fee in $PIT. [CONFIG]
    uint256 public activationFee = 500 ether;
    /// @notice FloorPosition score granted per epoch of continuous activation.
    uint256 public constant STREAK_POINTS_PER_EPOCH = 25;

    struct State {
        bool activated;
        uint256 epochAtActivation; // pitBoss.transferEpoch snapshot
        uint64 lastStreakPoke;
    }

    mapping(uint256 => State) private _state;

    event Activated(uint256 indexed tokenId, address indexed owner, uint256 feePaid);
    event Deactivated(uint256 indexed tokenId);
    event ActivationFeeSet(uint256 fee);
    event HouseBookSet(address houseBook);

    constructor(address pitBoss_, address pit_, address floor_, address houseBook_) Ownable(msg.sender) {
        if (pitBoss_ == address(0) || pit_ == address(0) || floor_ == address(0)) revert Errors.ZeroAddress();
        pitBoss = IPitBoss(pitBoss_);
        pit = ERC20Burnable(pit_);
        floor = FloorPosition(floor_);
        houseBook = houseBook_;
    }

    // -------- admin (fee/recipient only; never touches funds) --------

    function setActivationFee(uint256 fee) external onlyOwner {
        activationFee = fee;
        emit ActivationFeeSet(fee);
    }

    function setHouseBook(address houseBook_) external onlyOwner {
        if (houseBook_ == address(0)) revert Errors.ZeroAddress();
        houseBook = houseBook_;
        emit HouseBookSet(houseBook_);
    }

    // -------- activation --------

    /// @notice Activate a Boss. Caller must own it and have approved `activationFee`
    ///         of $PIT. 50% is burned, 50% parked at the House Book.
    function activate(uint256 tokenId) external {
        if (pitBoss.ownerOf(tokenId) != msg.sender) revert Errors.NotOwner();
        State storage s = _state[tokenId];
        if (_isFresh(tokenId, s)) revert Errors.AlreadyActivated();

        uint256 fee = activationFee;
        uint256 burnShare = fee / 2;
        uint256 bookShare = fee - burnShare;
        // Pull full fee, burn half, park half.
        IERC20(address(pit)).safeTransferFrom(msg.sender, address(this), fee);
        pit.burn(burnShare);
        IERC20(address(pit)).safeTransfer(houseBook, bookShare);

        s.activated = true;
        s.epochAtActivation = pitBoss.transferEpoch(tokenId);
        s.lastStreakPoke = uint64(block.timestamp);

        floor.activate(tokenId);
        emit Activated(tokenId, msg.sender, fee);
    }

    /// @notice Convert elapsed active epochs into FloorPosition score. Permissionless
    ///         (keepers run it); only rewards a genuinely-active Boss.
    function pokeStreak(uint256 tokenId) external {
        State storage s = _state[tokenId];
        if (!_isFresh(tokenId, s)) revert Errors.NotActivated();
        uint256 epochs = (block.timestamp - s.lastStreakPoke) / floor.EPOCH();
        if (epochs == 0) return;
        s.lastStreakPoke = uint64(block.timestamp);
        floor.bump(tokenId, epochs * STREAK_POINTS_PER_EPOCH);
    }

    /// @notice Sync a Boss that was sold while activated off the FloorPosition
    ///         payroll. Permissionless; only acts on a stale (transferred) Boss.
    function syncDeactivate(uint256 tokenId) external {
        State storage s = _state[tokenId];
        if (s.activated && !_isFresh(tokenId, s)) {
            s.activated = false;
            floor.deactivate(tokenId);
            emit Deactivated(tokenId);
        }
    }

    /// @notice Voluntary deactivation by the current owner.
    function deactivate(uint256 tokenId) external {
        if (pitBoss.ownerOf(tokenId) != msg.sender) revert Errors.NotOwner();
        State storage s = _state[tokenId];
        if (!s.activated) revert Errors.NotActivated();
        s.activated = false;
        floor.deactivate(tokenId);
        emit Deactivated(tokenId);
    }

    // -------- views --------

    /// @inheritdoc IActivationManager
    function isActivated(uint256 tokenId) public view returns (bool) {
        return _isFresh(tokenId, _state[tokenId]);
    }

    /// @inheritdoc IActivationManager
    function requireActivated(uint256 tokenId) external view {
        if (!isActivated(tokenId)) revert Errors.NotActivated();
    }

    /// @dev Activation is "fresh" only if it hasn't been invalidated by a transfer.
    function _isFresh(uint256 tokenId, State storage s) internal view returns (bool) {
        return s.activated && s.epochAtActivation == pitBoss.transferEpoch(tokenId);
    }
}
