// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IOracle} from "../interfaces/Support.sol";
import {IPyth, PythStructs} from "./external.sol";
import {Errors} from "../lib/Errors.sol";

/// @title PythOracleAdapter
/// @notice Real `IOracle` for mainnet, backed by Pyth price feeds. Presents the
///         three prices the protocol needs — `usdPerEth`, `usdPerToken`,
///         `ethPerToken` — from Pyth USD feeds:
///           • usdPerEth   = ETH/USD feed, scaled 1e8
///           • usdPerToken = <token>/USD feed, scaled 1e8
///           • ethPerToken = usdPerToken / usdPerEth, scaled 1e18 (wei per token)
/// @dev    Feed ids are set by the owner per token (owner is intended to be the
///         3-day timelock at deploy). Prices are read with a staleness bound
///         (`maxAge`) so a stalled feed reverts rather than quoting a dead price —
///         this cascades into the games' fail-closed behavior. Assumes 18-decimal
///         tokens, consistent with the rest of the protocol (FLAG deviation #4);
///         a non-18-decimal routed stock needs a decimals-aware variant.
contract PythOracleAdapter is IOracle, Ownable {
    IPyth public immutable pyth;
    bytes32 public ethUsdFeed;
    /// @notice Max seconds a Pyth price may be stale before reads revert. [CONFIG]
    uint256 public maxAge;
    /// @notice token => Pyth USD price-feed id.
    mapping(address => bytes32) public feedOf;

    event EthFeedSet(bytes32 feed);
    event MaxAgeSet(uint256 maxAge);
    event TokenFeedSet(address indexed token, bytes32 feed);

    constructor(address pyth_, bytes32 ethUsdFeed_, uint256 maxAge_, address owner_) Ownable(owner_) {
        if (pyth_ == address(0) || ethUsdFeed_ == bytes32(0) || maxAge_ == 0) revert Errors.InvalidConfig();
        pyth = IPyth(pyth_);
        ethUsdFeed = ethUsdFeed_;
        maxAge = maxAge_;
    }

    // -------- admin --------
    function setEthFeed(bytes32 feed) external onlyOwner {
        if (feed == bytes32(0)) revert Errors.InvalidConfig();
        ethUsdFeed = feed;
        emit EthFeedSet(feed);
    }

    function setMaxAge(uint256 maxAge_) external onlyOwner {
        if (maxAge_ == 0) revert Errors.InvalidConfig();
        maxAge = maxAge_;
        emit MaxAgeSet(maxAge_);
    }

    function setTokenFeed(address token, bytes32 feed) external onlyOwner {
        feedOf[token] = feed; // bytes32(0) disables the token
        emit TokenFeedSet(token, feed);
    }

    // -------- IOracle --------
    /// @inheritdoc IOracle
    function usdPerEth() public view returns (uint256) {
        return _to1e8(pyth.getPriceNoOlderThan(ethUsdFeed, maxAge));
    }

    /// @inheritdoc IOracle
    function usdPerToken(address token) public view returns (uint256) {
        bytes32 feed = feedOf[token];
        if (feed == bytes32(0)) revert Errors.InvalidConfig();
        return _to1e8(pyth.getPriceNoOlderThan(feed, maxAge));
    }

    /// @inheritdoc IOracle
    function ethPerToken(address token) external view returns (uint256) {
        uint256 tokUsd = usdPerToken(token); // 1e8
        uint256 ethUsd = usdPerEth(); // 1e8
        if (ethUsd == 0) revert Errors.InvalidConfig();
        // wei per 1e18 token = (tokenUsd / ethUsd) * 1e18
        return (tokUsd * 1e18) / ethUsd;
    }

    // -------- internal --------
    /// @dev Convert a Pyth price to a 1e8-scaled positive USD value.
    function _to1e8(PythStructs.Price memory p) internal pure returns (uint256) {
        if (p.price <= 0) revert Errors.InvalidConfig();
        uint256 price = uint256(int256(p.price));
        int256 pow = int256(8) + int256(p.expo); // target scale 1e8
        if (pow >= 0) {
            return price * (10 ** uint256(pow));
        }
        return price / (10 ** uint256(-pow));
    }
}
