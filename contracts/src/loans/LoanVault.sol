// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {FlatAMMVault} from "../amm/FlatAMMVault.sol";
import {IHouseBook} from "../interfaces/IHouseBook.sol";
import {IOracle, IPitBoss} from "../interfaces/Support.sol";
import {Errors} from "../lib/Errors.sol";

/// @title LoanVault
/// @notice Borrow the full flat AMM principal ($PIT) against a Boss. An upfront ETH
///         fee equal to 15% APR on the ETH notional of the principal (floored so
///         borrowing is never cheaper than an AMM exit) is charged for the term.
///         Repay the exact principal to reclaim the Boss; overdue loans accrue an
///         ETH late fee; default liquidates the Boss into the AMM vault. Fees split
///         70% House Book / 30% protocol reserve.
/// @dev    The vault holds a $PIT float (funded at deploy) it lends from. On default
///         the collateral Boss is deposited into the AMM as inventory, keeping the
///         500k-$PIT of value inside the protocol. Audit-scoped.
contract LoanVault is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    struct Loan {
        address borrower;
        uint256 bossId;
        uint256 principal;
        uint256 ethNotional;
        uint64 startAt;
        uint64 dueAt;
        bool closed;
    }

    IPitBoss public immutable boss;
    IERC20 public pit;
    FlatAMMVault public immutable amm;
    IHouseBook public houseBook;
    IOracle public oracle;
    address public protocolReserve;

    // -------- config [CONFIG] --------
    uint256 public constant APR_BPS = 1500; // 15% APR
    uint64 public constant MIN_TERM = 3 days; // minimum-term floor
    uint64 public constant GRACE = 1 days; // grace before liquidation
    uint256 public constant LATE_APR_BPS = 3000; // 30% APR late accrual
    uint16 public constant BOOK_SHARE_BPS = 7000; // 70% House Book
    /// @notice Fee floor so a loan is never cheaper than an AMM exit. [CONFIG]
    uint256 public minFee = 0.006 ether;

    uint256 public nextLoanId = 1;
    mapping(uint256 => Loan) public loans;

    event Borrowed(uint256 indexed loanId, address indexed borrower, uint256 bossId, uint256 principal, uint256 feeEth, uint64 dueAt);
    event Repaid(uint256 indexed loanId, uint256 principal, uint256 lateFeeEth);
    event Liquidated(uint256 indexed loanId, uint256 bossId);
    event Funded(uint256 amount);
    event PITSet(address indexed pit);

    constructor(address boss_, address pit_, address amm_, address houseBook_, address oracle_, address protocolReserve_)
        Ownable(msg.sender)
    {
        if (boss_ == address(0) || amm_ == address(0) || houseBook_ == address(0)
            || oracle_ == address(0) || protocolReserve_ == address(0)) revert Errors.ZeroAddress();
        boss = IPitBoss(boss_);
        if (pit_ != address(0)) pit = IERC20(pit_);
        amm = FlatAMMVault(amm_);
        houseBook = IHouseBook(houseBook_);
        oracle = IOracle(oracle_);
        protocolReserve = protocolReserve_;
    }

    // -------- admin: config + float funding only --------

    function setConfig(address houseBook_, address oracle_, address protocolReserve_, uint256 minFee_) external onlyOwner {
        if (houseBook_ == address(0) || oracle_ == address(0) || protocolReserve_ == address(0)) {
            revert Errors.ZeroAddress();
        }
        houseBook = IHouseBook(houseBook_);
        oracle = IOracle(oracle_);
        protocolReserve = protocolReserve_;
        minFee = minFee_;
    }

    /// @notice Wire the $PIT token after Pons graduation. One-time; reverts if already set.
    function setPIT(address pit_) external onlyOwner {
        if (address(pit) != address(0)) revert Errors.InvalidConfig();
        if (pit_ == address(0)) revert Errors.ZeroAddress();
        pit = IERC20(pit_);
        emit PITSet(pit_);
    }

    /// @notice Fund the lendable $PIT float. Owner-only; this is protocol liquidity,
    ///         not borrower or player funds.
    function fund(uint256 amount) external onlyOwner {
        if (address(pit) == address(0)) revert Errors.NotInitialized();
        pit.safeTransferFrom(msg.sender, address(this), amount);
        emit Funded(amount);
    }

    // -------- quote --------

    function principalPit() public view returns (uint256) {
        return amm.PRICE_PIT();
    }

    /// @notice Upfront ETH fee for a loan of `term` seconds.
    function quoteFee(uint64 term) public view returns (uint256 feeEth, uint256 ethNotional) {
        if (address(pit) == address(0)) revert Errors.NotInitialized();
        uint256 pxEthPerPit = oracle.ethPerToken(address(pit)); // eth-wei per 1e18 PIT
        ethNotional = (principalPit() * pxEthPerPit) / 1e18;
        uint256 apr = (ethNotional * APR_BPS * term) / (10_000 * 365 days);
        feeEth = apr < minFee ? minFee : apr;
    }

    // -------- borrow / repay / liquidate --------

    function borrow(uint256 bossId, uint64 term) external payable nonReentrant returns (uint256 loanId) {
        if (address(pit) == address(0)) revert Errors.NotInitialized();
        if (boss.ownerOf(bossId) != msg.sender) revert Errors.NotOwner();
        if (term < MIN_TERM) revert Errors.InvalidConfig();

        (uint256 feeEth, uint256 ethNotional) = quoteFee(term);
        if (msg.value < feeEth) revert Errors.InsufficientPayment();

        uint256 principal = principalPit();
        // Take collateral, disburse principal.
        IERC721(address(boss)).transferFrom(msg.sender, address(this), bossId);
        pit.safeTransfer(msg.sender, principal);

        loanId = nextLoanId++;
        loans[loanId] = Loan({
            borrower: msg.sender,
            bossId: bossId,
            principal: principal,
            ethNotional: ethNotional,
            startAt: uint64(block.timestamp),
            dueAt: uint64(block.timestamp) + term,
            closed: false
        });

        _splitFee(feeEth);
        uint256 refund = msg.value - feeEth;
        if (refund > 0) {
            (bool ok,) = msg.sender.call{value: refund}("");
            if (!ok) revert Errors.InsufficientPayment();
        }
        emit Borrowed(loanId, msg.sender, bossId, principal, feeEth, loans[loanId].dueAt);
    }

    /// @notice Accrued ETH late fee for an overdue loan (0 if current).
    function lateFee(uint256 loanId) public view returns (uint256) {
        Loan storage l = loans[loanId];
        if (l.closed || block.timestamp <= l.dueAt) return 0;
        uint256 overdue = block.timestamp - l.dueAt;
        return (l.ethNotional * LATE_APR_BPS * overdue) / (10_000 * 365 days);
    }

    /// @notice Repay exact principal (+ late fee if overdue) and reclaim the Boss.
    function repay(uint256 loanId) external payable nonReentrant {
        if (address(pit) == address(0)) revert Errors.NotInitialized();
        Loan storage l = loans[loanId];
        if (l.closed) revert Errors.RoundAlreadySettled();
        if (l.borrower != msg.sender) revert Errors.NotOwner();

        uint256 late = lateFee(loanId);
        if (msg.value < late) revert Errors.InsufficientPayment();

        l.closed = true;
        pit.safeTransferFrom(msg.sender, address(this), l.principal);
        IERC721(address(boss)).transferFrom(address(this), l.borrower, l.bossId);

        if (late > 0) _splitFee(late);
        uint256 refund = msg.value - late;
        if (refund > 0) {
            (bool ok,) = msg.sender.call{value: refund}("");
            if (!ok) revert Errors.InsufficientPayment();
        }
        emit Repaid(loanId, l.principal, late);
    }

    /// @notice Liquidate a defaulted loan: the collateral Boss is deposited into the
    ///         AMM vault as inventory. Callable by anyone after due + grace.
    function liquidate(uint256 loanId) external nonReentrant {
        Loan storage l = loans[loanId];
        if (l.closed) revert Errors.RoundAlreadySettled();
        if (block.timestamp <= l.dueAt + GRACE) revert Errors.WindowNotElapsed();

        l.closed = true;
        // Approve + hand the Boss to the AMM as fresh inventory.
        IERC721(address(boss)).approve(address(amm), l.bossId);
        amm.depositLiquidated(l.bossId);
        emit Liquidated(loanId, l.bossId);
    }

    // -------- internal --------

    function _splitFee(uint256 feeEth) internal {
        uint256 toBook = (feeEth * BOOK_SHARE_BPS) / 10_000;
        uint256 toProtocol = feeEth - toBook;
        if (toBook > 0) houseBook.payFee{value: toBook}(IHouseBook.Source.LoanInterest);
        if (toProtocol > 0) {
            (bool ok,) = protocolReserve.call{value: toProtocol}("");
            if (!ok) revert Errors.InsufficientPayment();
        }
    }
}
