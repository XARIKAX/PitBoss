// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {INonfungiblePositionManager as INPM} from "../interfaces/INonfungiblePositionManager.sol";
import {IHouseBook} from "../interfaces/IHouseBook.sol";
import {Errors} from "../lib/Errors.sol";

/// @title LiquidityLocker
/// @notice Escrows Uniswap-V3-style LP positions under one of three styles: hard
///         lock (released at a fixed time), linear vest (liquidity releasable
///         linearly to an end time), or permanent (never releasable — unlock window
///         is uint64-max). Ownership of a lock is itself a transferable NFT; only
///         the current lock holder can collect fees, withdraw vested liquidity, or
///         release. There is NO admin path to locked principal — ever. Protocol fee
///         share streams to the House Book.
/// @dev    Fee mode is fixed at lock creation: an upfront ETH fee (with 0% ongoing
///         share) OR 0 upfront with a 20% share of every fee collect. Permanent
///         locks set unlockTime = type(uint64).max, so `release` can never succeed
///         and `withdrawVested` never applies. Audit-scoped.
contract LiquidityLocker is ERC721, IERC721Receiver, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    enum Style {
        Hard,
        LinearVest,
        Permanent
    }

    enum FeeMode {
        Upfront, // pay ETH upfront, keep 100% of fee collects
        FeeShare // no upfront, protocol takes 20% of fee collects
    }

    struct Lock {
        address positionManager;
        uint256 positionId;
        Style style;
        FeeMode feeMode;
        uint64 start;
        uint64 unlockTime; // type(uint64).max for permanent
        uint128 initialLiquidity;
        uint128 withdrawnLiquidity;
    }

    IHouseBook public houseBook;
    /// @notice Ongoing protocol fee share in FeeShare mode. [CONFIG: 20%]
    uint16 public constant FEE_SHARE_BPS = 2000;
    /// @notice Upfront ETH fee for Upfront mode. [CONFIG: ~0.5% of position value]
    uint256 public upfrontFee = 0.005 ether;

    uint256 private _nextId = 1;
    mapping(uint256 => Lock) public locks;

    event Locked(uint256 indexed lockId, address indexed owner, uint256 positionId, Style style, FeeMode feeMode, uint64 unlockTime);
    event FeesCollected(uint256 indexed lockId, uint256 amt0, uint256 amt1, uint256 protocol0, uint256 protocol1);
    event VestedWithdrawn(uint256 indexed lockId, uint128 liquidity);
    event Released(uint256 indexed lockId, address indexed to, uint256 positionId);
    event UpfrontFeeSet(uint256 fee);

    constructor(address houseBook_) ERC721("PitBosses Lock", "LOCK") Ownable(msg.sender) {
        if (houseBook_ == address(0)) revert Errors.ZeroAddress();
        houseBook = IHouseBook(houseBook_);
    }

    // -------- admin: fee config + recipient only; never touches locked positions --------

    function setHouseBook(address houseBook_) external onlyOwner {
        if (houseBook_ == address(0)) revert Errors.ZeroAddress();
        houseBook = IHouseBook(houseBook_);
    }

    function setUpfrontFee(uint256 fee) external onlyOwner {
        upfrontFee = fee;
        emit UpfrontFeeSet(fee);
    }

    // -------- lock --------

    /// @notice Lock a position. Caller must own the position NFT and have approved
    ///         this contract to transfer it. `duration` sets the hard-unlock or
    ///         vest-end offset; ignored for Permanent.
    function lock(address positionManager, uint256 positionId, Style style, FeeMode feeMode, uint64 duration)
        external
        payable
        nonReentrant
        returns (uint256 lockId)
    {
        if (feeMode == FeeMode.Upfront) {
            if (msg.value < upfrontFee) revert Errors.InsufficientPayment();
            houseBook.payFee{value: msg.value}(IHouseBook.Source.LockerFees);
        }

        (,,,,,,, uint128 liquidity,,,,) = INPM(positionManager).positions(positionId);
        if (liquidity == 0) revert Errors.ZeroAmount();

        INPM(positionManager).safeTransferFrom(msg.sender, address(this), positionId);

        uint64 unlockTime = style == Style.Permanent ? type(uint64).max : uint64(block.timestamp) + duration;
        lockId = _nextId++;
        locks[lockId] = Lock({
            positionManager: positionManager,
            positionId: positionId,
            style: style,
            feeMode: feeMode,
            start: uint64(block.timestamp),
            unlockTime: unlockTime,
            initialLiquidity: liquidity,
            withdrawnLiquidity: 0
        });
        _safeMint(msg.sender, lockId);
        emit Locked(lockId, msg.sender, positionId, style, feeMode, unlockTime);
    }

    // -------- collect fees --------

    /// @notice Collect trading fees from the locked position to the lock holder,
    ///         applying the protocol fee share (FeeShare mode). Always available to
    ///         the holder, regardless of lock timing.
    function collectFees(uint256 lockId) external nonReentrant returns (uint256 amt0, uint256 amt1) {
        address holder = ownerOf(lockId);
        if (holder != msg.sender) revert Errors.NotOwner();
        Lock storage l = locks[lockId];

        (,, address token0, address token1,,,,,,,,) = INPM(l.positionManager).positions(l.positionId);
        (amt0, amt1) = INPM(l.positionManager).collect(
            INPM.CollectParams({
                tokenId: l.positionId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        uint256 p0;
        uint256 p1;
        if (l.feeMode == FeeMode.FeeShare) {
            p0 = (amt0 * FEE_SHARE_BPS) / 10_000;
            p1 = (amt1 * FEE_SHARE_BPS) / 10_000;
        }
        _payout(token0, holder, amt0 - p0, p0);
        _payout(token1, holder, amt1 - p1, p1);
        emit FeesCollected(lockId, amt0, amt1, p0, p1);
    }

    // -------- vest --------

    /// @notice Liquidity vested (and thus withdrawable) so far under a LinearVest.
    function vestedLiquidity(uint256 lockId) public view returns (uint128) {
        Lock storage l = locks[lockId];
        if (l.style != Style.LinearVest) return 0;
        if (block.timestamp >= l.unlockTime) return l.initialLiquidity;
        uint256 elapsed = block.timestamp - l.start;
        uint256 duration = l.unlockTime - l.start;
        return uint128((uint256(l.initialLiquidity) * elapsed) / duration);
    }

    /// @notice Withdraw the newly-vested liquidity of a LinearVest lock to the
    ///         holder (decreases the position and collects the released tokens).
    function withdrawVested(uint256 lockId) external nonReentrant returns (uint128 delta) {
        address holder = ownerOf(lockId);
        if (holder != msg.sender) revert Errors.NotOwner();
        Lock storage l = locks[lockId];
        if (l.style != Style.LinearVest) revert Errors.InvalidConfig();

        uint128 vested = vestedLiquidity(lockId);
        delta = vested - l.withdrawnLiquidity;
        if (delta == 0) revert Errors.NothingToClaim();
        l.withdrawnLiquidity = vested;

        (,, address token0, address token1,,,,,,,,) = INPM(l.positionManager).positions(l.positionId);
        INPM(l.positionManager).decreaseLiquidity(
            INPM.DecreaseLiquidityParams({
                tokenId: l.positionId,
                liquidity: delta,
                amount0Min: 0,
                amount1Min: 0,
                deadline: block.timestamp
            })
        );
        // Collect the just-released principal to the holder (no protocol share on
        // principal — only on trading fees).
        INPM(l.positionManager).collect(
            INPM.CollectParams({
                tokenId: l.positionId,
                recipient: holder,
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );
        token0;
        token1;
        emit VestedWithdrawn(lockId, delta);
    }

    // -------- release --------

    /// @notice Release the whole position NFT back to the holder. Reverts for
    ///         permanent locks (unlockTime == max) and before the unlock time.
    function release(uint256 lockId) external nonReentrant {
        address holder = ownerOf(lockId);
        if (holder != msg.sender) revert Errors.NotOwner();
        Lock storage l = locks[lockId];
        if (l.unlockTime == type(uint64).max) revert Errors.PermanentLock();
        if (block.timestamp < l.unlockTime) revert Errors.WindowNotElapsed();

        uint256 positionId = l.positionId;
        address pm = l.positionManager;
        _burn(lockId);
        delete locks[lockId];
        INPM(pm).safeTransferFrom(address(this), holder, positionId);
        emit Released(lockId, holder, positionId);
    }

    // -------- internal --------

    function _payout(address token, address holder, uint256 toHolder, uint256 toProtocol) internal {
        if (toHolder > 0) IERC20(token).safeTransfer(holder, toHolder);
        if (toProtocol > 0) {
            // Protocol fee share is delivered to the House Book treasury address as
            // the fee token; ETH-denominated accounting stays with ETH inflows.
            IERC20(token).safeTransfer(address(houseBook), toProtocol);
        }
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
