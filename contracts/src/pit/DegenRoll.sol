// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IEntropyConductor} from "../interfaces/IEntropyConductor.sol";
import {IHouseBook} from "../interfaces/IHouseBook.sol";
import {ISwapRouter, IOracle, IPitBoss, IActivationManager} from "../interfaces/Support.sol";
import {IFloorPosition} from "../interfaces/IFloorPosition.sol";
import {BearerCertificate} from "./BearerCertificate.sol";
import {PrizeTable} from "./PrizeTable.sol";
import {Errors} from "../lib/Errors.sol";

/// @notice Bumper surface of FloorPosition used to reward bankroll participation.
interface IFloorBump {
    function bump(uint256 tokenId, uint256 points) external;
    function EPOCH() external view returns (uint64);
}

/// @title DegenRoll
/// @notice One roll machine per stock token. Tickets are paid in ETH; prizes settle
///         as stock. The bankroll is player-owned: activated Bosses stake stock as
///         inventory and earn the sell-back spread pro rata through share
///         accounting. Every open pull reserves worst-case 50× from free inventory,
///         so the machine can always pay. Fails closed on entropy stall: ticket
///         sales stop, but settles, seals, cash-outs, and refunds always work.
/// @dev    Economic model (documented in docs/PIT.md): ticket T is escrowed until
///         resolution; at settle a 10% edge is split 2.5% creator / 2.5% House Book
///         / 5% protocol reserve, and the 90% net feeds an ETH float the `restock`
///         keeper converts to bankroll stock at the oracle mark. Prize notional is
///         the full ticket value in stock; table EV is 0.90 so the bankroll is flat
///         in expectation and earns the 5% sell-back spread plus dust. Reserve
///         invariant maintained everywhere: totalBankrollStock >= totalReserved.
///         Audit-scoped: custodies ETH float + stock bankroll + open reserves.
contract DegenRoll is ReentrancyGuard {
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

    struct Round {
        address player;
        uint256 escrowEth; // full ticket, held until settle/refund
        uint256 notional; // ticket value in stock at buy time
        uint256 reserved; // 50x notional, held against the bankroll
        uint64 boughtAt;
        uint64 readyAt;
        bytes32 entropyId;
        Status status;
        uint256 escrowPit; // $PITBOSS stake when the ticket was bought in PIT, else 0
    }

    // -------- immutable wiring --------
    IERC20 public immutable stock;
    /// @notice $PITBOSS. Zero disables PIT betting on this machine.
    IERC20 public immutable pit;
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
    uint256 public constant EDGE_BPS = 1000; // 10% total edge
    uint256 public constant CREATOR_BPS = 250; // 2.5%
    uint256 public constant BOOK_BPS = 250; // 2.5%
    uint256 public constant PROTOCOL_BPS = 500; // 5%
    uint256 public constant INSTANT_MAX_USD = 100e8; // instant lane ticket ceiling
    uint64 public constant INSTANT_DELAY = 30 seconds; // short entropy delay
    uint64 public constant VAULT_DELAY = 10 minutes; // longer commit delay (anti-grind)
    uint64 public constant REFUND_WINDOW = 48 hours;
    uint256 public constant SELLBACK_BPS = 9500; // 95% of oracle mark
    /// @notice Share of a $PITBOSS ticket burned outright, in bps. Set to the full
    ///         house edge so a PIT player gets the SAME 90% return as an ETH player —
    ///         the burn replaces the creator/book/protocol split rather than coming
    ///         out of the stake. Burning more than the edge would make the bankroll
    ///         insolvent, because prizes are paid at full notional. [CONFIG]
    uint256 public constant PIT_BURN_BPS = 1000; // 10%
    uint256 public constant RESTOCK_SLIPPAGE_BPS = 300;
    uint256 public constant LOSS_STREAK_LEN = 5; // consecutive floor rolls
    uint256 public constant REBATE_BPS = 1000; // 10% of avg ticket
    uint256 public constant BANKROLL_STAKE_POINTS = 10;
    /// @notice Permanently-locked shares minted to the dead address on the first
    ///         stake. Absorbs any share-price inflation so the classic first-
    ///         depositor attack is unprofitable (audit H3).
    uint256 public constant DEAD_SHARES = 1e3;
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;

    // -------- state --------
    uint256 public nextRoundId = 1;
    mapping(uint256 => Round) public rounds;

    uint256 public totalBankrollStock; // staked + earned, in stock units
    uint256 public totalReserved; // Σ open-round reserves (invariant: <= bankroll)
    uint256 public ethFloat; // net ticket ETH awaiting restock -> stock
    uint256 public pitFloat; // settled $PITBOSS awaiting conversion -> ETH -> stock
    uint256 public totalShares;
    mapping(address => uint256) public shares;

    // loss-streak tracking (per player wallet on this machine)
    mapping(address => uint256) public streakCount;
    mapping(address => uint256) public streakTicketSum;

    event Bought(uint256 indexed roundId, address indexed player, Lane lane, uint256 ticketEth, uint256 notional);
    event Settled(uint256 indexed roundId, address indexed player, uint256 word, uint256 milliX, uint256 prize, bool wasSealed);
    event Refunded(uint256 indexed roundId, address indexed player, uint256 amount);
    event SoldBack(address indexed player, uint256 stockIn, uint256 ethOut);
    event Staked(address indexed staker, uint256 indexed bossId, uint256 amount, uint256 sharesOut);
    event Unstaked(address indexed staker, uint256 amount, uint256 sharesIn);
    event Restocked(address indexed keeper, uint256 ethIn, uint256 stockOut);
    event BoughtWithPIT(
        uint256 indexed roundId, address indexed player, uint256 stakePit, uint256 notional
    );
    event PitBurned(uint256 amount);
    event PitRestocked(address indexed keeper, uint256 pitIn, uint256 ethOut);
    event RebateMinted(address indexed player, uint256 certId, uint256 amount);

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
        address protocolReserve_,
        address pit_
    ) {
        stock = IERC20(stock_);
        pit = IERC20(pit_);
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

    /// @notice Buy a ticket and commit to future entropy. Fails closed if entropy
    ///         is unhealthy. Reserves worst-case 50× from free inventory.
    function buy(Lane lane) external payable nonReentrant returns (uint256 roundId) {
        if (!conductor.healthy()) revert Errors.FloorUnhealthy();
        uint256 t = msg.value;
        if (t == 0) revert Errors.ZeroAmount();

        _checkLaneCap(lane, t);
        roundId = _open(lane, t, 0, _stockFor(t));
    }

    /// @notice Buy the same ticket staking $PITBOSS instead of ETH. Identical odds:
    ///         the ticket is priced in stock at the oracle mark and pays from the
    ///         same bankroll, and only the house edge is burned. The player must
    ///         approve this machine for `pitAmount` first.
    /// @dev    $PITBOSS taxes transfers, so everything downstream is denominated in
    ///         the amount that actually arrives, never the amount requested.
    function buyWithPIT(Lane lane, uint256 pitAmount) external nonReentrant returns (uint256 roundId) {
        if (address(pit) == address(0)) revert Errors.NotInitialized();
        if (!conductor.healthy()) revert Errors.FloorUnhealthy();
        if (pitAmount == 0) revert Errors.ZeroAmount();

        uint256 before = pit.balanceOf(address(this));
        pit.safeTransferFrom(msg.sender, address(this), pitAmount);
        uint256 received = pit.balanceOf(address(this)) - before;
        if (received == 0) revert Errors.ZeroAmount();

        // Value the ticket in ETH terms so the lane cap and the stock notional use
        // exactly the same maths as an ETH ticket.
        uint256 ethValue = (received * oracle.ethPerToken(address(pit))) / 1e18;
        if (ethValue == 0) revert Errors.InvalidConfig();

        _checkLaneCap(lane, ethValue);
        roundId = _open(lane, 0, received, _stockFor(ethValue));
    }

    /// @dev Reserve, record and commit. Shared by both stake currencies so the
    ///      reserve invariant can never diverge between them.
    function _open(Lane lane, uint256 escrowEth_, uint256 escrowPit_, uint256 notional)
        internal
        returns (uint256 roundId)
    {
        if (notional == 0) revert Errors.InvalidConfig();
        uint256 reserve = (notional * PrizeTable.maxMultiplierMilliX()) / PrizeTable.ONE_X;
        if (totalBankrollStock - totalReserved < reserve) revert Errors.ReserveShortfall();
        totalReserved += reserve;

        roundId = nextRoundId++;
        bytes32 id = keccak256(abi.encode(address(this), roundId));
        uint64 readyAt = uint64(block.timestamp) + delayFor(lane);
        rounds[roundId] = Round({
            player: msg.sender,
            escrowEth: escrowEth_,
            notional: notional,
            reserved: reserve,
            boughtAt: uint64(block.timestamp),
            readyAt: readyAt,
            entropyId: id,
            status: Status.Open,
            escrowPit: escrowPit_
        });
        conductor.commit(id, readyAt);
        emit Bought(roundId, msg.sender, lane, escrowEth_, notional);
        if (escrowPit_ > 0) emit BoughtWithPIT(roundId, msg.sender, escrowPit_, notional);
    }

    /// @dev The Instant lane is capped in dollars, so both stake currencies are
    ///      valued in ETH first and measured against the same ceiling.
    function _checkLaneCap(Lane lane, uint256 ethValue) internal view {
        if (lane != Lane.Instant) return;
        uint256 usd = (ethValue * oracle.usdPerEth()) / 1e18; // 1e8-scaled
        if (usd > INSTANT_MAX_USD) revert Errors.InvalidConfig();
    }

    function delayFor(Lane lane) public pure returns (uint64) {
        return lane == Lane.Instant ? INSTANT_DELAY : VAULT_DELAY;
    }

    /// @notice Settle a fulfilled round, paying the prize as stock to the player's
    ///         wallet. Always available (never gated on health).
    function settle(uint256 roundId) external nonReentrant returns (uint256 prize) {
        return _resolve(roundId, false);
    }

    /// @notice Settle a fulfilled round by sealing 100% of the prize into a Bearer
    ///         Certificate — no sell-back spread taken.
    function sealIntoCertificate(uint256 roundId) external nonReentrant returns (uint256 prize) {
        return _resolve(roundId, true);
    }

    function _resolve(uint256 roundId, bool seal) internal returns (uint256 prize) {
        Round storage r = rounds[roundId];
        if (r.status != Status.Open) revert Errors.RoundAlreadySettled();
        // Land the word (idempotent). Reverts if not yet ready.
        uint256 word = conductor.fulfill(r.entropyId);
        (uint256 milliX,) = PrizeTable.multiplierFor(word);
        prize = (r.notional * milliX) / PrizeTable.ONE_X;

        r.status = Status.Settled;
        totalReserved -= r.reserved; // release worst-case hold

        // Split edge from escrow; net feeds the restock float.
        if (r.escrowPit > 0) {
            _splitPit(r.escrowPit);
        } else {
            _splitEdge(r.escrowEth);
        }

        // Pay prize from bankroll (guaranteed solvent by the reserve invariant).
        totalBankrollStock -= prize;
        if (seal) {
            stock.forceApprove(address(certificate), prize);
            certificate.issue(r.player, address(stock), prize);
        } else {
            stock.safeTransfer(r.player, prize);
        }

        _updateStreak(r.player, r.notional, milliX);
        emit Settled(roundId, r.player, word, milliX, prize, seal);
    }

    /// @notice Refund an unfulfilled pull after the 48h window. Always available.
    function refund(uint256 roundId) external nonReentrant {
        Round storage r = rounds[roundId];
        if (r.status != Status.Open) revert Errors.RoundAlreadySettled();
        if (conductor.isFulfilled(r.entropyId)) revert Errors.RoundAlreadySettled();
        if (block.timestamp < r.boughtAt + REFUND_WINDOW) revert Errors.NotRefundableYet();

        r.status = Status.Refunded;
        totalReserved -= r.reserved;
        // Refund in whatever was staked. Nothing has been burned or converted yet —
        // that only happens at settle — so the escrow is still intact either way.
        if (r.escrowPit > 0) {
            uint256 pitAmount = r.escrowPit;
            pit.safeTransfer(r.player, pitAmount);
            emit Refunded(roundId, r.player, pitAmount);
            return;
        }
        uint256 amount = r.escrowEth;
        (bool ok,) = r.player.call{value: amount}("");
        if (!ok) revert Errors.InsufficientPayment();
        emit Refunded(roundId, r.player, amount);
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

    /// @notice Stake stock into the machine bankroll. Caller must own an activated
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

    /// @notice Withdraw bankroll stake, limited by open-round reserves. Always
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

    /// @notice Convert settled $PITBOSS into ETH, which `restock` then turns into
    ///         bankroll stock. Permissionless keeper action, same as `restock`.
    /// @dev    Split in two so the PIT->ETH leg and the ETH->stock leg each carry
    ///         their own slippage bound instead of compounding inside one call.
    function restockPit() external nonReentrant returns (uint256 ethOut) {
        uint256 pitIn = pitFloat;
        if (pitIn == 0) revert Errors.ZeroAmount();
        uint256 quote = router.quoteTokensForETH(address(pit), pitIn);
        uint256 minOut = (quote * (10_000 - RESTOCK_SLIPPAGE_BPS)) / 10_000;
        pitFloat = 0;

        // The machine's own `receive()` credits ethFloat, so route the proceeds here
        // and let the existing ETH path do the rest.
        pit.forceApprove(address(router), pitIn);
        ethOut = router.swapExactTokensForETH(address(pit), pitIn, minOut, address(this));
        emit PitRestocked(msg.sender, pitIn, ethOut);
    }

    /// @dev The $PITBOSS mirror of `_splitEdge`. The whole 10% edge is burned rather
    ///      than split to creator/book/protocol, so a PIT player gets the same 90%
    ///      return as an ETH player while permanently removing supply. The remaining
    ///      90% becomes stock via `restockPit` -> `restock`, which is what keeps the
    ///      bankroll solvent against prizes paid at full notional.
    function _splitPit(uint256 stakePit) internal {
        uint256 burn = (stakePit * PIT_BURN_BPS) / 10_000;
        uint256 net = stakePit - burn;
        pitFloat += net;
        if (burn > 0) {
            // $PITBOSS exposes no burn(); the dead address is the sink used
            // everywhere else in the protocol (see ActivationManager).
            pit.safeTransfer(DEAD, burn);
            emit PitBurned(burn);
        }
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

    function previewRoll(uint256 roundId) external view returns (uint256 milliX, uint256 prize) {
        Round storage r = rounds[roundId];
        uint256 word = conductor.previewWord(r.entropyId);
        (milliX,) = PrizeTable.multiplierFor(word);
        prize = (r.notional * milliX) / PrizeTable.ONE_X;
    }

    // ==================== internal ====================

    function _stockFor(uint256 ethAmount) internal view returns (uint256) {
        uint256 px = oracle.ethPerToken(address(stock)); // eth-wei per 1e18 token
        if (px == 0) return 0;
        return (ethAmount * 1e18) / px;
    }

    function _splitEdge(uint256 ticketEth) internal {
        uint256 edge = (ticketEth * EDGE_BPS) / 10_000;
        uint256 toCreator = (ticketEth * CREATOR_BPS) / 10_000;
        uint256 toBook = (ticketEth * BOOK_BPS) / 10_000;
        uint256 toProtocol = edge - toCreator - toBook; // remainder = protocol 5%
        uint256 net = ticketEth - edge;
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

    function _updateStreak(address player, uint256 notional, uint256 milliX) internal {
        if (milliX == PrizeTable.FLOOR_X) {
            uint256 c = streakCount[player] + 1;
            uint256 sum = streakTicketSum[player] + notional;
            if (c >= LOSS_STREAK_LEN) {
                uint256 avg = sum / c;
                uint256 rebate = (avg * REBATE_BPS) / 10_000;
                streakCount[player] = 0;
                streakTicketSum[player] = 0;
                // Only mint if free inventory covers it (keeps reserve invariant).
                if (rebate > 0 && totalBankrollStock - totalReserved >= rebate) {
                    totalBankrollStock -= rebate;
                    stock.forceApprove(address(certificate), rebate);
                    uint256 certId = certificate.issue(player, address(stock), rebate);
                    emit RebateMinted(player, certId, rebate);
                }
            } else {
                streakCount[player] = c;
                streakTicketSum[player] = sum;
            }
        } else {
            streakCount[player] = 0;
            streakTicketSum[player] = 0;
        }
    }

    receive() external payable {
        // Direct ETH is treated as a float donation to the bankroll restock buffer.
        ethFloat += msg.value;
    }
}
