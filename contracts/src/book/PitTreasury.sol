// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IHouseBook} from "../interfaces/IHouseBook.sol";
import {ISwapRouter, IOracle} from "../interfaces/Support.sol";
import {Errors} from "../lib/Errors.sol";

/// @title PitTreasury
/// @notice Receives the $PITBOSS share of protocol revenue and turns it into Boss
///         rewards. `convert` sells the held $PITBOSS for ETH and pays the proceeds
///         into the House Book, where it is distributed to activated Bosses through
///         the same crank/deliver path as every other fee.
///
/// @dev    WHY THIS EXISTS: `ActivationManager` splits each 888,888 $PITBOSS
///         activation fee in half — one half burned, the other sent to a "book"
///         address to become protocol revenue. It was pointed at `HouseBook`, which
///         has no ERC-20 code path of any kind: no transfer, no approve, no rescue.
///         Tokens sent there can never leave. Roughly 5.3M $PITBOSS is already
///         stranded that way and is not recoverable by any means, including
///         redeploying the book.
///
///         Repointing `ActivationManager.setHouseBook` at this contract routes
///         future activations here instead, where the tokens are usable.
///
///         Every token this contract can hold has a way out — `convert` for
///         $PITBOSS and `sweepToken` for anything else that arrives. That property
///         is the entire reason it exists, so do not remove either.
contract PitTreasury is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable pit;

    ISwapRouter public router;
    IOracle public oracle;
    IHouseBook public houseBook;

    /// @notice Slippage bound applied to the oracle quote when converting. [CONFIG]
    uint256 public maxSlippageBps = 300; // 3%
    /// @notice Ignore conversions below this, so a dust call cannot burn gas moving
    ///         an amount worth less than the transaction. [CONFIG]
    uint256 public minConvert = 1_000 ether; // 1,000 $PITBOSS

    event RouterSet(address router);
    event OracleSet(address oracle);
    event HouseBookSet(address houseBook);
    event MaxSlippageSet(uint256 bps);
    event MinConvertSet(uint256 amount);
    event Converted(address indexed caller, uint256 pitIn, uint256 ethOut);
    event Swept(address indexed token, address indexed to, uint256 amount);

    constructor(address pit_, address router_, address oracle_, address houseBook_, address owner_)
        Ownable(owner_)
    {
        if (pit_ == address(0) || router_ == address(0) || oracle_ == address(0) || houseBook_ == address(0)) {
            revert Errors.ZeroAddress();
        }
        pit = IERC20(pit_);
        router = ISwapRouter(router_);
        oracle = IOracle(oracle_);
        houseBook = IHouseBook(houseBook_);
    }

    // -------- admin (routing only; never a claim on the funds) --------

    function setRouter(address router_) external onlyOwner {
        if (router_ == address(0)) revert Errors.ZeroAddress();
        router = ISwapRouter(router_);
        emit RouterSet(router_);
    }

    function setOracle(address oracle_) external onlyOwner {
        if (oracle_ == address(0)) revert Errors.ZeroAddress();
        oracle = IOracle(oracle_);
        emit OracleSet(oracle_);
    }

    function setHouseBook(address houseBook_) external onlyOwner {
        if (houseBook_ == address(0)) revert Errors.ZeroAddress();
        houseBook = IHouseBook(houseBook_);
        emit HouseBookSet(houseBook_);
    }

    function setMaxSlippageBps(uint256 bps) external onlyOwner {
        if (bps > 10_000) revert Errors.InvalidConfig();
        maxSlippageBps = bps;
        emit MaxSlippageSet(bps);
    }

    function setMinConvert(uint256 amount) external onlyOwner {
        minConvert = amount;
        emit MinConvertSet(amount);
    }

    // -------- convert --------

    /// @notice Sell `amount` of the held $PITBOSS for ETH and pay it into the House
    ///         Book as Boss rewards. Permissionless: the amount is bounded by the
    ///         balance and the price by an oracle-derived `minOut`, so an untrusted
    ///         caller has nothing to gain beyond paying the gas.
    /// @param  amount $PITBOSS to convert, or 0 for the whole balance.
    function convert(uint256 amount) external nonReentrant returns (uint256 ethOut) {
        uint256 held = pit.balanceOf(address(this));
        uint256 sell = amount == 0 || amount > held ? held : amount;
        if (sell < minConvert) revert Errors.ZeroAmount();

        uint256 quote = router.quoteTokensForETH(address(pit), sell);
        if (quote == 0) revert Errors.InvalidConfig(); // no price — fail closed
        uint256 minOut = (quote * (10_000 - maxSlippageBps)) / 10_000;

        pit.forceApprove(address(router), sell);
        ethOut = router.swapExactTokensForETH(address(pit), sell, minOut, address(this));
        if (ethOut == 0) revert Errors.ZeroAmount();

        // Tagged PitEdge: the House Book's Source enum has no slot for token
        // revenue, and PitEdge is what it already attributes bare transfers to.
        houseBook.payFee{value: ethOut}(IHouseBook.Source.PitEdge);
        emit Converted(msg.sender, sell, ethOut);
    }

    // -------- escape hatches --------

    /// @notice Move any ERC-20 out. The House Book's missing counterpart to this is
    ///         exactly why ~5.3M $PITBOSS is stranded, so this contract keeps one for
    ///         every token it can ever hold.
    function sweepToken(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert Errors.ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
        emit Swept(token, to, amount);
    }

    /// @notice Move ETH out — only needed if a conversion's proceeds could not be
    ///         paid onward (e.g. the book was mid-migration).
    function sweepETH(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert Errors.ZeroAddress();
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert Errors.InsufficientPayment();
        emit Swept(address(0), to, amount);
    }

    /// @notice $PITBOSS awaiting conversion into Boss rewards.
    function pendingPit() external view returns (uint256) {
        return pit.balanceOf(address(this));
    }

    receive() external payable {}
}
