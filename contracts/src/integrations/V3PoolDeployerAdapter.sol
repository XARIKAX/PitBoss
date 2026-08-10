// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPoolDeployer} from "../launcher/interfaces.sol";
import {IWETH9, IUniV3Factory, IUniV3PositionManager} from "./external.sol";
import {Errors} from "../lib/Errors.sol";

/// @title V3PoolDeployerAdapter
/// @notice Production IPoolDeployer. On launcher graduation it creates a Uniswap V3
///         pool seeded with a full-range LP position and returns the NonfungiblePositionManager
///         address + tokenId so LauncherFactory can permanently lock the position.
/// @dev    pairAsset == address(0) means the launch paired with ETH; the adapter
///         wraps ETH → WETH automatically. Token ordering follows Uniswap's
///         token0 < token1 rule. Initial price is set from the supplied amounts;
///         arb will tighten it to the live market price immediately after graduation.
///         Owner (timelock) can update poolFee between launches; no upgrade path for
///         positionManager or factory (immutable, reducing attack surface).
contract V3PoolDeployerAdapter is IPoolDeployer, Ownable {
    using SafeERC20 for IERC20;

    IUniV3PositionManager public immutable positionManager;
    IUniV3Factory         public immutable v3Factory;
    IWETH9                public immutable weth;

    /// @notice Fee tier used when creating new pools. [CONFIG: 3000 = 0.3%]
    uint24 public poolFee;

    // Tick magnitude used to derive full-range bounds per fee tier.
    // Rounds down from TickMath.MAX_TICK (887272) to the nearest multiple of any
    // supported tickSpacing (10 → -887270/887270, 60 → -887220/887220, 200 → -887200/887200).
    int24 private constant TICK_MAGNITUDE = 887200;

    event PoolDeployed(address indexed launchToken, address pool, uint256 positionId);
    event PoolFeeUpdated(uint24 fee);

    constructor(
        address positionManager_,
        address factory_,
        address weth_,
        uint24  poolFee_,
        address owner_
    ) Ownable(owner_) {
        if (positionManager_ == address(0) || factory_ == address(0) || weth_ == address(0))
            revert Errors.ZeroAddress();
        if (poolFee_ == 0) revert Errors.InvalidConfig();
        positionManager = IUniV3PositionManager(positionManager_);
        v3Factory        = IUniV3Factory(factory_);
        weth             = IWETH9(weth_);
        poolFee          = poolFee_;
    }

    /// @notice Owner (timelock) may update the fee tier for future pool creations.
    function setPoolFee(uint24 fee_) external onlyOwner {
        if (fee_ == 0) revert Errors.InvalidConfig();
        poolFee = fee_;
        emit PoolFeeUpdated(fee_);
    }

    /// @inheritdoc IPoolDeployer
    /// @param launchToken  The newly graduated ERC-20 launch token.
    /// @param pairAsset    Pair token address, or address(0) for ETH (auto-wrapped).
    /// @param tokenAmount  Launch tokens to seed as LP; must be pre-approved by caller.
    function deployPoolAndMint(address launchToken, address pairAsset, uint256 tokenAmount)
        external
        payable
        override
        returns (address pm, uint256 positionId)
    {
        if (tokenAmount == 0 || msg.value == 0) revert Errors.ZeroAmount();

        address pair = pairAsset == address(0) ? address(weth) : pairAsset;
        uint256 pairAmount = msg.value;

        // Pull launch tokens from LauncherFactory and wrap ETH.
        IERC20(launchToken).safeTransferFrom(msg.sender, address(this), tokenAmount);
        weth.deposit{value: pairAmount}();

        // Uniswap V3 requires token0 < token1 by address.
        bool launchIsToken0 = launchToken < pair;
        (address token0, address token1) = launchIsToken0
            ? (launchToken, pair) : (pair, launchToken);
        (uint256 amount0, uint256 amount1) = launchIsToken0
            ? (tokenAmount, pairAmount) : (pairAmount, tokenAmount);

        // Create pool and set initial price; no-op if pool already exists.
        uint160 sqrtPrice = _sqrtPriceX96(amount0, amount1);
        address pool = positionManager.createAndInitializePoolIfNecessary(
            token0, token1, poolFee, sqrtPrice
        );

        // Full-range tick bounds: nearest multiple of tickSpacing within ±TICK_MAGNITUDE.
        int24 ts = v3Factory.feeAmountTickSpacing(poolFee);
        int24 tickLower = -(TICK_MAGNITUDE / ts) * ts;
        int24 tickUpper =  (TICK_MAGNITUDE / ts) * ts;

        // Approve position manager and mint LP; recipient is LauncherFactory (ERC721Holder).
        IERC20(token0).approve(address(positionManager), amount0);
        IERC20(token1).approve(address(positionManager), amount1);

        (positionId,,,) = positionManager.mint(
            IUniV3PositionManager.MintParams({
                token0: token0,
                token1: token1,
                fee: poolFee,
                tickLower: tickLower,
                tickUpper: tickUpper,
                amount0Desired: amount0,
                amount1Desired: amount1,
                amount0Min: 0,
                amount1Min: 0,
                recipient: msg.sender,
                deadline: block.timestamp + 1800
            })
        );

        emit PoolDeployed(launchToken, pool, positionId);
        return (address(positionManager), positionId);
    }

    // ─── internal ───────────────────────────────────────────────────────────────

    /// @dev sqrtPriceX96 = sqrt(amount1 / amount0) × 2^96
    ///      Computed as (sqrt(amount1) × 2^96) / sqrt(amount0) using integer square
    ///      roots. Precision is sufficient to set the initial pool price; the live
    ///      market will tighten it within one arbitrage block.
    function _sqrtPriceX96(uint256 amount0, uint256 amount1) internal pure returns (uint160) {
        uint256 sa1 = _isqrt(amount1);
        uint256 sa0 = _isqrt(amount0);
        // sa1 ≤ 2^128; sa1 << 96 ≤ 2^224 — safe inside uint256.
        return uint160((sa1 << 96) / sa0);
    }

    /// @dev Babylonian integer square root (rounds down).
    function _isqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) { y = z; z = (x / z + z) / 2; }
    }

    receive() external payable {}
}
