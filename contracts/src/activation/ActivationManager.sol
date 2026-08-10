// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
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
    IERC20 public pit;
    FloorPosition public immutable floor;
    address public houseBook; // parks the non-burned $PIT share

    /// @notice Activation fee in $PIT. [CONFIG]
    uint256 public activationFee = 500 ether;
    /// @notice FloorPosition score granted per epoch of continuous activation.
    uint256 public constant STREAK_POINTS_PER_EPOCH = 25;
    /// @notice Burn sink. The protocol token ($PITBOSS on Pons) exposes no `burn()`,
    ///         so "burning" is a transfer to the dead address — removes supply for
    ///         any ERC-20, launchpad token included.
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;

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
    event PITSet(address indexed pit);

    constructor(address pitBoss_, address pit_, address floor_, address houseBook_) Ownable(msg.sender) {
        if (pitBoss_ == address(0) || floor_ == address(0)) revert Errors.ZeroAddress();
        pitBoss = IPitBoss(pitBoss_);
        if (pit_ != address(0)) pit = IERC20(pit_);
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

    /// @notice Wire the $PIT token after Pons graduation. One-time; reverts if already set.
    function setPIT(address pit_) external onlyOwner {
        if (address(pit) != address(0)) revert Errors.InvalidConfig();
        if (pit_ == address(0)) revert Errors.ZeroAddress();
        pit = IERC20(pit_);
        emit PITSet(pit_);
    }

    // -------- activation --------

    /// @notice Activate a Boss. Caller must own it and have approved `activationFee`
    ///         of $PIT. ~50% is burned (to the dead address), ~50% parked at the
    ///         House Book.
    /// @dev    Fee-on-transfer-safe: the protocol token may take a transfer tax, so
    ///         the split is computed from the amount ACTUALLY received (balance
    ///         diff), never the nominal fee — otherwise the two out-transfers would
    ///         exceed the balance and revert.
    function activate(uint256 tokenId) external {
        if (address(pit) == address(0)) revert Errors.NotInitialized();
        if (pitBoss.ownerOf(tokenId) != msg.sender) revert Errors.NotOwner();
        State storage s = _state[tokenId];
        if (_isFresh(tokenId, s)) revert Errors.AlreadyActivated();

        uint256 before = pit.balanceOf(address(this));
        pit.safeTransferFrom(msg.sender, address(this), activationFee);
        uint256 received = pit.balanceOf(address(this)) - before;
        if (received == 0) revert Errors.ZeroAmount();

        uint256 burnShare = received / 2;
        uint256 bookShare = received - burnShare;
        pit.safeTransfer(DEAD, burnShare); // dead-address "burn"
        pit.safeTransfer(houseBook, bookShare); // parked as $PIT at the book

        s.activated = true;
        s.epochAtActivation = pitBoss.transferEpoch(tokenId);
        s.lastStreakPoke = uint64(block.timestamp);

        floor.activate(tokenId);
        emit Activated(tokenId, msg.sender, received);
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
