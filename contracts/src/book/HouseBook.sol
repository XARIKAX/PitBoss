// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IHouseBook} from "../interfaces/IHouseBook.sol";
import {IRewardSink} from "../interfaces/IRewardSink.sol";
import {ISwapRouter, IPitBoss} from "../interfaces/Support.sol";
import {Errors} from "../lib/Errors.sol";

/// @title HouseBook
/// @notice The single fee sink. Every money module pays ETH here, tagged by
///         source. When the bar fills past THRESHOLD, anyone cranks: the cranker
///         takes a 0.5% tip and the rest is distributed pro rata by floor-position
///         weight through an O(1) accumulator — no loop over Bosses. Each Boss's
///         share is then pulled with `deliver()`, which converts the ETH into the
///         Boss's elected token(s) and pushes them to its TBA.
/// @dev    Reward weights are mirrored from FloorPosition via `syncWeight`, which
///         settles a Boss at its old weight before adopting the new one, keeping
///         the accumulator exact. Core runtime invariant: balance == bar + owed.
///         This contract custodies ETH — audit-scoped.
contract HouseBook is IHouseBook, IRewardSink, ReentrancyGuard, Ownable {
    uint256 private constant ACC_PRECISION = 1e18;

    IPitBoss public immutable boss;
    IFloorLike public immutable floor;
    ISwapRouter public router;

    // -------- tunables [CONFIG] --------
    /// @notice ETH the bar must hold before `crank()` may run. [CONFIG]
    uint256 public crankThreshold = 1 ether;
    /// @notice Cranker tip, in basis points of the pot. [CONFIG: 0.5%]
    uint16 public crankTipBps = 50;
    /// @notice Max slippage tolerated per token swap at delivery, in bps. [CONFIG]
    uint16 public maxSlippageBps = 300;

    // -------- accounting --------
    /// @notice ETH received per source, cumulative (never decreases). Σ == total in.
    mapping(Source => uint256) public accruedBySource;
    /// @notice ETH awaiting the next crank.
    uint256 public bar;
    /// @notice ETH owed to Bosses (in accumulator + settled credit), not yet pulled.
    uint256 public owed;

    // -------- reward accumulator --------
    uint256 public accEthPerWeight; // scaled by ACC_PRECISION
    uint256 public bookTotalWeight; // mirror of FloorPosition.totalWeight
    mapping(uint256 => uint256) public bookWeight; // per-Boss mirrored weight
    mapping(uint256 => uint256) public userAcc; // accEthPerWeight last settled
    mapping(uint256 => uint256) public credit; // settled ETH owed to a Boss

    // -------- elections --------
    struct Election {
        address[] tokens; // empty => paid in ETH (default)
        uint16[] weightsBps; // parallel to tokens; must sum to 10_000
    }

    mapping(uint256 => Election) private _election;

    event RouterSet(address router);
    event ThresholdSet(uint256 threshold);
    event ElectionSet(uint256 indexed tokenId, address[] tokens, uint16[] weightsBps);
    event Delivered(uint256 indexed tokenId, address indexed to, uint256 ethAmount);

    modifier onlyFloor() {
        if (msg.sender != address(floor)) revert Errors.NotAuthorized();
        _;
    }

    constructor(address boss_, address floor_, address router_) Ownable(msg.sender) {
        if (boss_ == address(0) || floor_ == address(0)) revert Errors.ZeroAddress();
        boss = IPitBoss(boss_);
        floor = IFloorLike(floor_);
        router = ISwapRouter(router_);
    }

    // -------- admin: recipient/config only, never touches owed funds --------

    function setRouter(address router_) external onlyOwner {
        router = ISwapRouter(router_);
        emit RouterSet(router_);
    }

    function setCrankThreshold(uint256 threshold) external onlyOwner {
        crankThreshold = threshold;
        emit ThresholdSet(threshold);
    }

    function setCrankTipBps(uint16 bps) external onlyOwner {
        if (bps > 1000) revert Errors.InvalidConfig(); // hard ceiling 10%
        crankTipBps = bps;
    }

    function setMaxSlippageBps(uint16 bps) external onlyOwner {
        if (bps > 2000) revert Errors.InvalidConfig();
        maxSlippageBps = bps;
    }

    // -------- fee intake --------

    /// @inheritdoc IHouseBook
    function payFee(Source source) external payable {
        if (msg.value == 0) revert Errors.ZeroAmount();
        accruedBySource[source] += msg.value;
        bar += msg.value;
        emit FeeReceived(source, msg.sender, msg.value);
    }

    /// @dev Plain transfers (e.g. from a router refund) land in the bar as PitEdge.
    receive() external payable {
        accruedBySource[Source.PitEdge] += msg.value;
        bar += msg.value;
        emit FeeReceived(Source.PitEdge, msg.sender, msg.value);
    }

    // -------- crank --------

    /// @notice Distribute the bar. Anyone may call once `bar >= crankThreshold`.
    ///         Cranker receives `crankTipBps` of the pot; the remainder is credited
    ///         pro rata by floor weight. Pays out exactly 100% of the pot: tip +
    ///         distributed credits + rounding dust rolled back into the bar.
    function crank() external nonReentrant returns (uint256 pot, uint256 tip) {
        pot = bar;
        if (pot < crankThreshold) revert Errors.BarNotFull();

        tip = (pot * crankTipBps) / 10_000;
        uint256 distributable = pot - tip;

        uint256 tw = bookTotalWeight;
        uint256 distributed;
        if (tw > 0) {
            uint256 perWeight = (distributable * ACC_PRECISION) / tw;
            accEthPerWeight += perWeight;
            distributed = (perWeight * tw) / ACC_PRECISION; // exact multiple, ≤ distributable
            owed += distributed;
        }
        // Whatever wasn't tipped or distributed (dust, or all of it when tw==0)
        // rolls forward in the bar. bar always equals uncredited ETH.
        bar = pot - tip - distributed;

        if (tip > 0) {
            (bool ok,) = msg.sender.call{value: tip}("");
            if (!ok) revert Errors.InsufficientPayment();
        }
        emit Cranked(msg.sender, pot, tip);
    }

    // -------- weight mirror (from FloorPosition) --------

    /// @inheritdoc IRewardSink
    function syncWeight(uint256 tokenId, uint256 newWeight) external onlyFloor {
        _settle(tokenId);
        bookTotalWeight = bookTotalWeight - bookWeight[tokenId] + newWeight;
        bookWeight[tokenId] = newWeight;
    }

    // -------- elections --------

    /// @notice Elect up to 3 payout tokens with weights (sum 10_000 bps). Empty
    ///         array = paid in ETH (default). Only the Boss owner may set.
    function setElection(uint256 tokenId, address[] calldata tokens, uint16[] calldata weightsBps) external {
        if (boss.ownerOf(tokenId) != msg.sender) revert Errors.NotOwner();
        if (tokens.length != weightsBps.length || tokens.length > 3) revert Errors.InvalidConfig();
        uint256 sum;
        for (uint256 i; i < weightsBps.length; ++i) {
            if (tokens[i] == address(0)) revert Errors.ZeroAddress();
            sum += weightsBps[i];
        }
        if (tokens.length > 0 && sum != 10_000) revert Errors.InvalidConfig();
        _election[tokenId] = Election(tokens, weightsBps);
        emit ElectionSet(tokenId, tokens, weightsBps);
    }

    /// @notice Convenience for autoDCA: elect a single token at 100%.
    function setAutoDCA(uint256 tokenId, address token) external {
        address[] memory t = new address[](1);
        uint16[] memory w = new uint16[](1);
        t[0] = token;
        w[0] = 10_000;
        // reuse validation via internal path
        if (boss.ownerOf(tokenId) != msg.sender) revert Errors.NotOwner();
        if (token == address(0)) revert Errors.ZeroAddress();
        _election[tokenId] = Election(t, w);
        emit ElectionSet(tokenId, t, w);
    }

    function electionOf(uint256 tokenId) external view returns (address[] memory, uint16[] memory) {
        Election storage e = _election[tokenId];
        return (e.tokens, e.weightsBps);
    }

    // -------- deliver (pull) --------

    /// @notice Realize a Boss's accrued ETH: settle, convert per its election, and
    ///         push the result to its TBA. Permissionless (keepers or owner call).
    function deliver(uint256 tokenId) external nonReentrant returns (uint256 amount) {
        _settle(tokenId);
        amount = credit[tokenId];
        if (amount == 0) revert Errors.NothingToClaim();
        credit[tokenId] = 0;
        owed -= amount;

        address tba = boss.accountOf(tokenId);
        Election storage e = _election[tokenId];

        if (e.tokens.length == 0) {
            (bool ok,) = tba.call{value: amount}("");
            if (!ok) revert Errors.InsufficientPayment();
        } else {
            uint256 spent;
            for (uint256 i; i < e.tokens.length; ++i) {
                uint256 slice = i == e.tokens.length - 1 ? amount - spent : (amount * e.weightsBps[i]) / 10_000;
                spent += slice;
                if (slice == 0) continue;
                uint256 quote = router.quoteETHForTokens(e.tokens[i], slice);
                uint256 minOut = (quote * (10_000 - maxSlippageBps)) / 10_000;
                router.swapExactETHForTokens{value: slice}(e.tokens[i], minOut, tba);
            }
        }
        emit Delivered(tokenId, tba, amount);
    }

    /// @notice Settle without delivering (e.g. before a manual weight sync). View
    ///         of what a Boss could pull right now.
    function pendingOf(uint256 tokenId) external view returns (uint256) {
        uint256 acc = accEthPerWeight;
        return credit[tokenId] + (bookWeight[tokenId] * (acc - userAcc[tokenId])) / ACC_PRECISION;
    }

    // -------- IHouseBook views --------

    function barBalance() external view returns (uint256) {
        return bar;
    }

    // -------- internal --------

    function _settle(uint256 tokenId) internal {
        uint256 acc = accEthPerWeight;
        uint256 last = userAcc[tokenId];
        if (acc != last) {
            credit[tokenId] += (bookWeight[tokenId] * (acc - last)) / ACC_PRECISION;
            userAcc[tokenId] = acc;
        }
    }
}

/// @dev Minimal view into FloorPosition used by the House Book.
interface IFloorLike {
    function totalWeight() external view returns (uint256);
    function weightOf(uint256 tokenId) external view returns (uint256);
}
