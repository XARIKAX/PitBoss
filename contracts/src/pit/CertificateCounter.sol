// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {BearerCertificate} from "./BearerCertificate.sol";
import {IHouseBook} from "../interfaces/IHouseBook.sol";
import {IOracle} from "../interfaces/Support.sol";
import {Errors} from "../lib/Errors.sol";

/// @title CertificateCounter
/// @notice Wrap any routed stock token 1:1 into a numbered Bearer Certificate for
///         a flat fee. The fee is a fixed USD amount paid in ETH, split 50/50
///         between the House Book (CertFees) and the protocol reserve.
/// @dev    The counter never custodies stock beyond the same-transaction hop into
///         the certificate vault. Geo-gating for certificate purchase is a
///         front-end concern per the brief (open globally pending review); the
///         contract stays permissionless. Audit-scoped (moves ETH + stock).
contract CertificateCounter is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    BearerCertificate public immutable certificate;
    IHouseBook public houseBook;
    IOracle public oracle;
    address public protocolReserve;

    /// @notice Flat fee in USD (8 decimals, Chainlink-style). [CONFIG: $2]
    uint256 public feeUsd = 2e8;

    /// @notice Tokens permitted at the counter (the routed stock set).
    mapping(address => bool) public isRouted;

    event RoutedSet(address indexed token, bool allowed);
    event FeeSet(uint256 feeUsd);
    event ConfigSet(address houseBook, address oracle, address protocolReserve);
    event Bought(address indexed buyer, address indexed to, address token, uint256 amount, uint256 certId, uint256 feeEth);

    constructor(address certificate_, address houseBook_, address oracle_, address protocolReserve_)
        Ownable(msg.sender)
    {
        if (certificate_ == address(0) || houseBook_ == address(0) || oracle_ == address(0)
            || protocolReserve_ == address(0)) revert Errors.ZeroAddress();
        certificate = BearerCertificate(certificate_);
        houseBook = IHouseBook(houseBook_);
        oracle = IOracle(oracle_);
        protocolReserve = protocolReserve_;
    }

    // -------- admin: config only --------

    function setRouted(address token, bool allowed) external onlyOwner {
        isRouted[token] = allowed;
        emit RoutedSet(token, allowed);
    }

    function setFeeUsd(uint256 feeUsd_) external onlyOwner {
        feeUsd = feeUsd_;
        emit FeeSet(feeUsd_);
    }

    function setConfig(address houseBook_, address oracle_, address protocolReserve_) external onlyOwner {
        if (houseBook_ == address(0) || oracle_ == address(0) || protocolReserve_ == address(0)) {
            revert Errors.ZeroAddress();
        }
        houseBook = IHouseBook(houseBook_);
        oracle = IOracle(oracle_);
        protocolReserve = protocolReserve_;
        emit ConfigSet(houseBook_, oracle_, protocolReserve_);
    }

    // -------- buy / gift --------

    /// @notice Current flat fee in ETH-wei.
    function feeEth() public view returns (uint256) {
        uint256 usdPerEth = oracle.usdPerEth(); // 1e8
        if (usdPerEth == 0) revert Errors.InvalidConfig();
        return (feeUsd * 1e18) / usdPerEth;
    }

    /// @notice Wrap `amount` of `token` (1:1) into a certificate minted to `to`.
    ///         Pay the flat fee in ETH (excess refunded).
    function buy(address to, address token, uint256 amount)
        external
        payable
        nonReentrant
        returns (uint256 certId)
    {
        if (!isRouted[token]) revert Errors.NotAuthorized();
        if (amount == 0) revert Errors.ZeroAmount();
        if (to == address(0)) revert Errors.ZeroAddress();

        uint256 fee = feeEth();
        if (msg.value < fee) revert Errors.InsufficientPayment();

        // Pull stock, hop into the certificate vault 1:1.
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).forceApprove(address(certificate), amount);
        certId = certificate.issue(to, token, amount);

        // Split fee 50/50 House Book / protocol reserve.
        uint256 half = fee / 2;
        houseBook.payFee{value: half}(IHouseBook.Source.CertFees);
        (bool ok,) = protocolReserve.call{value: fee - half}("");
        if (!ok) revert Errors.InsufficientPayment();

        // Refund any overpayment.
        uint256 refund = msg.value - fee;
        if (refund > 0) {
            (ok,) = msg.sender.call{value: refund}("");
            if (!ok) revert Errors.InsufficientPayment();
        }
        emit Bought(msg.sender, to, token, amount, certId, fee);
    }
}
