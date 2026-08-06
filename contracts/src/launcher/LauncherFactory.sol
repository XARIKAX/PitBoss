// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {LaunchToken} from "./LaunchToken.sol";
import {ILauncher, IPoolDeployer} from "./interfaces.sol";
import {OpeningBell} from "./OpeningBell.sol";
import {LiquidityLocker} from "../locker/LiquidityLocker.sol";
import {IHouseBook} from "../interfaces/IHouseBook.sol";
import {Errors} from "../lib/Errors.sol";

/// @title LauncherFactory
/// @notice Creates token launches (fixed-price or bonding-curve) paired with ETH.
///         Each buy charges a curve fee: 30% charges the Opening Bell buyback bar,
///         the rest goes to the House Book (LauncherFees). On reaching the pair's
///         graduation threshold, the launch finalizes: a V3 pool + LP is created and
///         the LP is permanently locked in our Liquidity Locker (fees stream to the
///         House Book).
/// @dev    v1 pairs against ETH; $PIT/stock pairs are a marked extension. The
///         bonding curve is a linear spot model (documented). Audit-scoped (holds
///         raised ETH until graduation).
contract LauncherFactory is ILauncher, ReentrancyGuard, Ownable {
    enum Curve {
        FixedPrice,
        Bonding
    }

    struct Launch {
        address token;
        Curve curve;
        uint256 spotPrice; // ETH-wei per 1e18 token
        uint256 slope; // price increase per 1e18 token sold (Bonding only)
        uint256 sold; // tokens sold
        uint256 raised; // net ETH in the curve
        uint256 graduationThreshold; // raised ETH needed to graduate
        bool graduated;
        address creator;
    }

    IHouseBook public houseBook;
    OpeningBell public openingBell;
    LiquidityLocker public locker;
    IPoolDeployer public poolDeployer;

    // -------- config [CONFIG] --------
    uint256 public launchFee = 0.00042 ether;
    uint16 public constant CURVE_FEE_BPS = 100; // 1% curve fee
    uint16 public constant BELL_SLICE_BPS = 3000; // 30% of curve fee -> bell
    uint256 public constant GRAD_TOKENS_TO_POOL_BPS = 2000; // 20% supply seeds the pool

    uint256 public nextLaunchId = 1;
    mapping(uint256 => Launch) public launches;

    event LaunchCreated(uint256 indexed launchId, address indexed token, address indexed creator, Curve curve);
    event Bought(uint256 indexed launchId, address indexed buyer, uint256 ethIn, uint256 tokensOut, uint256 fee);
    event Graduated(uint256 indexed launchId, address positionManager, uint256 positionId, uint256 lockId);
    event Buyback(uint256 indexed launchId, uint256 ethIn, uint256 tokensBurned);

    constructor(address houseBook_, address openingBell_, address locker_, address poolDeployer_) Ownable(msg.sender) {
        houseBook = IHouseBook(houseBook_);
        openingBell = OpeningBell(payable(openingBell_));
        locker = LiquidityLocker(locker_);
        poolDeployer = IPoolDeployer(poolDeployer_);
    }

    // -------- admin: config only --------

    function setConfig(address houseBook_, address openingBell_, address locker_, address poolDeployer_) external onlyOwner {
        houseBook = IHouseBook(houseBook_);
        openingBell = OpeningBell(payable(openingBell_));
        locker = LiquidityLocker(locker_);
        poolDeployer = IPoolDeployer(poolDeployer_);
    }

    function setLaunchFee(uint256 fee) external onlyOwner {
        launchFee = fee;
    }

    // -------- create --------

    function createLaunch(
        string calldata name,
        string calldata symbol,
        uint256 maxSupply,
        Curve curve,
        uint256 spotPrice,
        uint256 slope,
        uint256 graduationThreshold
    ) external payable nonReentrant returns (uint256 launchId, address token) {
        if (msg.value < launchFee) revert Errors.InsufficientPayment();
        if (spotPrice == 0 || maxSupply == 0) revert Errors.InvalidConfig();

        token = address(new LaunchToken(name, symbol, maxSupply, address(this)));
        launchId = nextLaunchId++;
        launches[launchId] = Launch({
            token: token,
            curve: curve,
            spotPrice: spotPrice,
            slope: curve == Curve.Bonding ? slope : 0,
            sold: 0,
            raised: 0,
            graduationThreshold: graduationThreshold,
            graduated: false,
            creator: msg.sender
        });

        houseBook.payFee{value: msg.value}(IHouseBook.Source.LauncherFees);
        emit LaunchCreated(launchId, token, msg.sender, curve);
    }

    // -------- buy --------

    function buy(uint256 launchId, uint256 minTokensOut) external payable nonReentrant returns (uint256 tokensOut) {
        Launch storage l = launches[launchId];
        if (l.token == address(0) || l.graduated) revert Errors.NotAuthorized();
        if (msg.value == 0) revert Errors.ZeroAmount();

        uint256 fee = (msg.value * CURVE_FEE_BPS) / 10_000;
        uint256 net = msg.value - fee;
        tokensOut = (net * 1e18) / l.spotPrice;
        if (tokensOut < minTokensOut) revert Errors.SlippageExceeded();

        l.sold += tokensOut;
        l.raised += net;
        if (l.curve == Curve.Bonding) {
            l.spotPrice += (l.slope * tokensOut) / 1e18;
        }
        LaunchToken(l.token).mint(msg.sender, tokensOut);

        _routeFee(launchId, fee);
        emit Bought(launchId, msg.sender, msg.value, tokensOut, fee);

        if (l.raised >= l.graduationThreshold) _finalize(launchId);
    }

    /// @inheritdoc ILauncher
    function buybackInto(uint256 launchId) external payable {
        if (msg.sender != address(openingBell)) revert Errors.NotAuthorized();
        Launch storage l = launches[launchId];
        if (l.graduated || l.token == address(0)) revert Errors.NotAuthorized();
        uint256 tokens = (msg.value * 1e18) / l.spotPrice;
        l.raised += msg.value;
        // Buy-and-burn into the curve: supply falls, backing rises.
        LaunchToken(l.token).mint(address(this), tokens);
        LaunchToken(l.token).burn(tokens);
        emit Buyback(launchId, msg.value, tokens);
    }

    // -------- graduation --------

    function _finalize(uint256 launchId) internal {
        Launch storage l = launches[launchId];
        l.graduated = true;

        uint256 poolTokens = (LaunchToken(l.token).maxSupply() * GRAD_TOKENS_TO_POOL_BPS) / 10_000;
        LaunchToken(l.token).mint(address(this), poolTokens);
        LaunchToken(l.token).approve(address(poolDeployer), poolTokens);

        uint256 pairEth = l.raised;
        (address pm, uint256 positionId) =
            poolDeployer.deployPoolAndMint{value: pairEth}(l.token, address(0), poolTokens);

        // Auto-lock the LP permanently; fee share streams to the House Book.
        IERC721(pm).approve(address(locker), positionId);
        uint256 lockId = locker.lock(pm, positionId, LiquidityLocker.Style.Permanent, LiquidityLocker.FeeMode.FeeShare, 0);
        emit Graduated(launchId, pm, positionId, lockId);
    }

    // -------- ILauncher views --------

    function marketCapOf(uint256 launchId) external view returns (uint256) {
        Launch storage l = launches[launchId];
        return (l.sold * l.spotPrice) / 1e18;
    }

    function isLive(uint256 launchId) external view returns (bool) {
        Launch storage l = launches[launchId];
        return l.token != address(0) && !l.graduated;
    }

    // -------- internal --------

    function _routeFee(uint256 launchId, uint256 fee) internal {
        if (fee == 0) return;
        uint256 toBell = (fee * BELL_SLICE_BPS) / 10_000;
        uint256 toBook = fee - toBell;
        if (toBell > 0) openingBell.chargeBar{value: toBell}(launchId);
        if (toBook > 0) houseBook.payFee{value: toBook}(IHouseBook.Source.LauncherFees);
    }
}
