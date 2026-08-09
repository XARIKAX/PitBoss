// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IEntropyConductor} from "../interfaces/IEntropyConductor.sol";
import {IHouseBook} from "../interfaces/IHouseBook.sol";
import {ISwapRouter, IOracle, IPitBoss, IActivationManager} from "../interfaces/Support.sol";
import {BearerCertificate} from "./BearerCertificate.sol";
import {Roulette} from "./Roulette.sol";
import {Errors} from "../lib/Errors.sol";

/// @notice Bumper surface of FloorPosition used to reward bankroll participation.
interface IFloorBump {
    function bump(uint256 tokenId, uint256 points) external;
}

/// @title RouletteWheel
/// @notice A European single-zero roulette wheel, built on the exact bankroll /
///         entropy / settlement machinery of DegenRoll so it inherits the same
///         guarantees. One bet per spin (v1): stake ETH on a bet, a future
///         entropy word lands the pocket (`word % 37`), and a win settles as stock
///         from a player-owned bankroll. Every open spin reserves that bet's
///         worst-case payout from free inventory, so the wheel can always pay.
///         Fails closed on entropy stall: new spins stop, but settles, seals,
///         cash-outs, and refunds always work; unfulfilled spins refund after 48h.
/// @dev    Economic model (mirrors DegenRoll, documented in docs/PIT.md): the
///         stake is escrowed until resolution; at settle a 2% rake is split
///         0.5% creator / 0.5% House Book / 1% protocol, and the 98% net feeds an
///         ETH float the `restock` keeper converts to bankroll stock. Prize is the
///         bet's total-return multiple of the staked notional in stock; the wheel's
///         single zero gives a uniform 2.70% structural edge that accrues to the
///         bankroll, and stakers additionally earn the 5% sell-back spread. Reserve
///         invariant maintained everywhere: totalBankrollStock >= totalReserved.
///         The House Book fee is tagged `PitEdge` — roulette is a Pit game.
///         Audit-scoped: custodies ETH float + stock bankroll + open reserves.
contract RouletteWheel is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Lane {
        Instant,
        Vault
    }
    enum Status {
        Open,
        Settled,
        Refunded
    }

    struct Spin {
        address player;
        uint256 escrowEth; // full stake, held until settle/refund
        uint256 notional; // stake value in stock at spin time
        uint256 reserved; // bet's worst-case payout, held against the bankroll
        uint64 boughtAt;
        uint64 readyAt;
        bytes32 entropyId;
        Roulette.Bet bet;
        uint8 selection;
        Status status;
    }

    // -------- immutable wiring --------
    IERC20 public immutable stock;
    IEntropyConductor public immutable conductor;
    IHouseBook public immutable houseBook;
    IOracle public immutable oracle;
    ISwapRouter public immutable router;
    BearerCertificate public immutable certificate;
    IPitBoss public immutable boss;
    IActivationManager public immutable activation;
    IFloorBump public immutable floor;
    address public immutable creator;
    address public immutable protocolReserve;

    // -------- config [CONFIG] --------
    uint256 public constant RAKE_BPS = 200; // 2% rake off the stake
    uint256 public constant CREATOR_BPS = 50; // 0.5%
    uint256 public constant BOOK_BPS = 50; // 0.5%
    uint256 public constant PROTOCOL_BPS = 100; // 1%
    uint256 public constant INSTANT_MAX_USD = 100e8; // instant lane stake ceiling
    uint64 public constant INSTANT_DELAY = 30 seconds; // short entropy delay
    uint64 public constant VAULT_DELAY = 10 minutes; // longer commit delay (anti-grind)
    uint64 public constant REFUND_WINDOW = 48 hours;
    uint256 public constant SELLBACK_BPS = 9500; // 95% of oracle mark
    uint256 public constant RESTOCK_SLIPPAGE_BPS = 300;
    uint256 public constant BANKROLL_STAKE_POINTS = 10;
    /// @notice Permanently-locked shares minted to the dead address on the first
    ///         stake, so the first-depositor share-price attack is unprofitable.
    uint256 public constant DEAD_SHARES = 1e3;
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;

    // -------- state --------
    uint256 public nextSpinId = 1;
    mapping(uint256 => Spin) public spins;

    uint256 public totalBankrollStock; // staked + earned, in stock units
    uint256 public totalReserved; // Σ open-spin reserves (invariant: <= bankroll)
    uint256 public ethFloat; // net stake ETH awaiting restock -> stock
    uint256 public totalShares;
    mapping(address => uint256) public shares;

    event SpinBought(
        uint256 indexed spinId,
        address indexed player,
        Lane lane,
        Roulette.Bet bet,
        uint8 selection,
        uint256 stakeEth,
        uint256 notional
    );
    event SpinSettled(
        uint256 indexed spinId,
        address indexed player,
        uint256 word,
        uint256 pocket,
        bool win,
        uint256 prize,
        bool wasSealed
    );
    event SpinRefunded(uint256 indexed spinId, address indexed player, uint256 amount);
    event SoldBack(address indexed player, uint256 stockIn, uint256 ethOut);
    event Staked(address indexed staker, uint256 indexed bossId, uint256 amount, uint256 sharesOut);
    event Unstaked(address indexed staker, uint256 amount, uint256 sharesIn);
    event Restocked(address indexed keeper, uint256 ethIn, uint256 stockOut);

    constructor(
        address stock_,
        address conductor_,
        address houseBook_,
        address oracle_,
        address router_,
        address certificate_,
        address boss_,
        address activation_,
        address floor_,
        address creator_,
        address protocolReserve_
    ) {
        stock = IERC20(stock_);
        conductor = IEntropyConductor(conductor_);
        houseBook = IHouseBook(houseBook_);
        oracle = IOracle(oracle_);
        router = ISwapRouter(router_);
        certificate = BearerCertificate(certificate_);
        boss = IPitBoss(boss_);
        activation = IActivationManager(activation_);
        floor = IFloorBump(floor_);
        creator = creator_;
        protocolReserve = protocolReserve_;
    }

    // ==================== play ====================

    /// @notice Place a bet and commit to future entropy. Fails closed if entropy is
    ///         unhealthy. Reserves the bet's worst-case payout from free inventory.
    /// @param lane       Instant (small, fast) or Vault (larger, anti-grind delay).
    /// @param bet        The bet type.
    /// @param selection  Number (straight) or group index (dozen/column); else 0.
    function spin(Lane lane, Roulette.Bet bet, uint8 selection)
        external
        payable
        nonReentrant
        returns (uint256 spinId)
    {
        if (!conductor.healthy()) revert Errors.FloorUnhealthy();
        if (!Roulette.isValidSelection(bet, selection)) revert Errors.InvalidConfig();
        uint256 t = msg.value;
        if (t == 0) revert Errors.ZeroAmount();

        uint256 usd = (t * oracle.usdPerEth()) / 1e18; // 1e8-scaled
        uint64 delay;
        if (lane == Lane.Instant) {
            if (usd > INSTANT_MAX_USD) revert Errors.InvalidConfig();
            delay = INSTANT_DELAY;
        } else {
            delay = VAULT_DELAY;
        }

        uint256 notional = _stockFor(t);
        if (notional == 0) revert Errors.InvalidConfig();
        uint256 reserve = (notional * Roulette.potentialMultiplier(bet)) / Roulette.ONE_X;
        if (totalBankrollStock - totalReserved < reserve) revert Errors.ReserveShortfall();
        totalReserved += reserve;

        spinId = nextSpinId++;
        bytes32 id = keccak256(abi.encode(address(this), spinId));
        uint64 readyAt = uint64(block.timestamp) + delay;
        spins[spinId] = Spin({
            player: msg.sender,
            escrowEth: t,
            notional: notional,
            reserved: reserve,
            boughtAt: uint64(block.timestamp),
            readyAt: readyAt,
            entropyId: id,
            bet: bet,
            selection: selection,
            status: Status.Open
        });
        conductor.commit(id, readyAt);
        emit SpinBought(spinId, msg.sender, lane, bet, selection, t, notional);
    }

    /// @notice Settle a fulfilled spin, paying any prize as stock to the player.
    ///         Always available (never gated on health).
    function settle(uint256 spinId) external nonReentrant returns (uint256 prize) {
        return _resolve(spinId, false);
    }

    /// @notice Settle a fulfilled spin by sealing a winning prize into a Bearer
    ///         Certificate — no sell-back spread taken. A losing spin just settles.
    function sealIntoCertificate(uint256 spinId) external nonReentrant returns (uint256 prize) {
        return _resolve(spinId, true);
    }

    function _resolve(uint256 spinId, bool seal) internal returns (uint256 prize) {
        Spin storage s = spins[spinId];
        if (s.status != Status.Open) revert Errors.RoundAlreadySettled();
        // Land the word (idempotent). Reverts if not yet ready.
        uint256 word = conductor.fulfill(s.entropyId);
        (bool win, uint256 milliX, uint256 pocket) = Roulette.resolve(s.bet, s.selection, word);
        prize = win ? (s.notional * milliX) / Roulette.ONE_X : 0;

        s.status = Status.Settled;
        totalReserved -= s.reserved; // release worst-case hold

        // Split rake from the stake; net feeds the restock float.
        _splitRake(s.escrowEth);

        // Pay prize from bankroll (guaranteed solvent by the reserve invariant).
        if (prize > 0) {
            totalBankrollStock -= prize;
            if (seal) {
                stock.forceApprove(address(certificate), prize);
                certificate.issue(s.player, address(stock), prize);
            } else {
                stock.safeTransfer(s.player, prize);
            }
        }

        emit SpinSettled(spinId, s.player, word, pocket, win, prize, seal && prize > 0);
    }

    /// @notice Refund an unfulfilled spin after the 48h window. Always available.
    function refund(uint256 spinId) external nonReentrant {
        Spin storage s = spins[spinId];
        if (s.status != Status.Open) revert Errors.RoundAlreadySettled();
        if (conductor.isFulfilled(s.entropyId)) revert Errors.RoundAlreadySettled();
        if (block.timestamp < s.boughtAt + REFUND_WINDOW) revert Errors.NotRefundableYet();

        s.status = Status.Refunded;
        totalReserved -= s.reserved;
        uint256 amount = s.escrowEth;
        (bool ok,) = s.player.call{value: amount}("");
        if (!ok) revert Errors.InsufficientPayment();
        emit SpinRefunded(spinId, s.player, amount);
    }

    /// @notice Sell won stock back to the bankroll at 95% of the oracle mark; the
    ///         5% spread stays in the bankroll for stakers. Always available.
    function sellBack(uint256 amount) external nonReentrant {
        if (amount == 0) revert Errors.ZeroAmount();
        uint256 value = (amount * oracle.ethPerToken(address(stock))) / 1e18;
        uint256 ethOut = (value * SELLBACK_BPS) / 10_000;
        if (ethOut > ethFloat) revert Errors.InsufficientPayment();

        stock.safeTransferFrom(msg.sender, address(this), amount);
        totalBankrollStock += amount; // full stock enters bankroll
        ethFloat -= ethOut; // 95% paid out; 5% spread retained as stock

        (bool ok,) = msg.sender.call{value: ethOut}("");
        if (!ok) revert Errors.InsufficientPayment();
        emit SoldBack(msg.sender, amount, ethOut);
    }

    // ==================== bankroll ====================

    /// @notice Stake stock into the wheel bankroll. Caller must own an activated
    ///         Boss (`bossId`). Mints pro-rata shares.
    function stakeBankroll(uint256 bossId, uint256 amount) external nonReentrant returns (uint256 sharesOut) {
        if (boss.ownerOf(bossId) != msg.sender) revert Errors.NotOwner();
        if (!activation.isActivated(bossId)) revert Errors.NotActivated();
        if (amount == 0) revert Errors.ZeroAmount();

        stock.safeTransferFrom(msg.sender, address(this), amount);
        if (totalShares == 0) {
            // First deposit: lock DEAD_SHARES forever so share price can't be
            // cheaply inflated to steal a later staker's deposit.
            if (amount <= DEAD_SHARES) revert Errors.ZeroAmount();
            sharesOut = amount - DEAD_SHARES;
            shares[DEAD] += DEAD_SHARES;
            totalShares = amount; // DEAD_SHARES + sharesOut
        } else {
            sharesOut = (amount * totalShares) / totalBankrollStock;
            if (sharesOut == 0) revert Errors.ZeroAmount(); // never mint zero shares
            totalShares += sharesOut;
        }
        shares[msg.sender] += sharesOut;
        totalBankrollStock += amount;

        // Reward bankroll participation on the floor (best-effort).
        try floor.bump(bossId, BANKROLL_STAKE_POINTS) {} catch {}
        emit Staked(msg.sender, bossId, amount, sharesOut);
    }

    /// @notice Withdraw bankroll stake, limited by open-spin reserves. Always
    ///         available up to free inventory.
    function unstake(uint256 sharesIn) external nonReentrant returns (uint256 amount) {
        if (sharesIn == 0 || sharesIn > shares[msg.sender]) revert Errors.ZeroAmount();
        amount = (sharesIn * totalBankrollStock) / totalShares;
        uint256 free = totalBankrollStock - totalReserved;
        if (amount > free) revert Errors.ReserveShortfall();

        shares[msg.sender] -= sharesIn;
        totalShares -= sharesIn;
        totalBankrollStock -= amount;
        stock.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount, sharesIn);
    }

    /// @notice Convert the accumulated ETH float into bankroll stock at the oracle
    ///         mark. Permissionless keeper action. Always available.
    function restock() external nonReentrant returns (uint256 stockOut) {
        uint256 ethIn = ethFloat;
        if (ethIn == 0) revert Errors.ZeroAmount();
        uint256 quote = router.quoteETHForTokens(address(stock), ethIn);
        uint256 minOut = (quote * (10_000 - RESTOCK_SLIPPAGE_BPS)) / 10_000;
        ethFloat = 0;
        stockOut = router.swapExactETHForTokens{value: ethIn}(address(stock), minOut, address(this));
        totalBankrollStock += stockOut;
        emit Restocked(msg.sender, ethIn, stockOut);
    }

    // ==================== views ====================

    function freeStock() external view returns (uint256) {
        return totalBankrollStock - totalReserved;
    }

    /// @notice Stock value of one share, scaled 1e18. Rises as the bankroll earns.
    function sharePrice() external view returns (uint256) {
        if (totalShares == 0) return 1e18;
        return (totalBankrollStock * 1e18) / totalShares;
    }

    /// @notice Preview the outcome of a spin from the currently-available entropy.
    function previewSpin(uint256 spinId)
        external
        view
        returns (uint256 pocket, bool win, uint256 prize)
    {
        Spin storage s = spins[spinId];
        uint256 word = conductor.previewWord(s.entropyId);
        uint256 milliX;
        (win, milliX, pocket) = Roulette.resolve(s.bet, s.selection, word);
        prize = win ? (s.notional * milliX) / Roulette.ONE_X : 0;
    }

    // ==================== internal ====================

    function _stockFor(uint256 ethAmount) internal view returns (uint256) {
        uint256 px = oracle.ethPerToken(address(stock)); // eth-wei per 1e18 token
        if (px == 0) return 0;
        return (ethAmount * 1e18) / px;
    }

    function _splitRake(uint256 stakeEth) internal {
        uint256 rake = (stakeEth * RAKE_BPS) / 10_000;
        uint256 toCreator = (stakeEth * CREATOR_BPS) / 10_000;
        uint256 toBook = (stakeEth * BOOK_BPS) / 10_000;
        uint256 toProtocol = rake - toCreator - toBook; // remainder = protocol 1%
        uint256 net = stakeEth - rake;
        ethFloat += net;

        if (toBook > 0) houseBook.payFee{value: toBook}(IHouseBook.Source.PitEdge);
        if (toCreator > 0) {
            (bool ok,) = creator.call{value: toCreator}("");
            if (!ok) revert Errors.InsufficientPayment();
        }
        if (toProtocol > 0) {
            (bool ok,) = protocolReserve.call{value: toProtocol}("");
            if (!ok) revert Errors.InsufficientPayment();
        }
    }

    receive() external payable {
        // Direct ETH is treated as a float donation to the bankroll restock buffer.
        ethFloat += msg.value;
    }
}
