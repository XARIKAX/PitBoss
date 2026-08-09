// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IOracle} from "../interfaces/Support.sol";
import {AggregatorV3Interface} from "./external.sol";
import {Errors} from "../lib/Errors.sol";

/// @title ChainlinkOracleAdapter
/// @notice Real `IOracle` for Robinhood Chain, backed by **Chainlink Data Feeds** —
///         the chain's production oracle for ETH and every tokenized stock (each
///         stock feed reports share-price × multiplier). Presents the protocol's
///         three prices from Chainlink USD feeds:
///           • usdPerEth   = ETH/USD feed, normalized to 1e8
///           • usdPerToken = <stock>/USD feed, normalized to 1e8
///           • ethPerToken = usdPerToken / usdPerEth, scaled 1e18 (wei per token)
/// @dev    Feeds use the standard `AggregatorV3Interface` (`latestRoundData`,
///         8-decimal USD). The ETH/USD feed is intended to be Robinhood's
///         UnstaleWrapper, which adds its own staleness guard; this adapter ALSO
///         enforces `maxAge` on every read (defense in depth) so a stalled feed
///         reverts rather than quoting a dead price — cascading into the games'
///         fail-closed behavior. Per-stock feed addresses are set by the owner
///         (the timelock). Assumes 18-decimal stock tokens (FLAG deviation #4).
contract ChainlinkOracleAdapter is IOracle, Ownable {
    AggregatorV3Interface public ethUsdFeed;
    /// @notice Max seconds a feed answer may be stale before reads revert. [CONFIG]
    uint256 public maxAge;
    /// @notice stock token => Chainlink USD price feed.
    mapping(address => AggregatorV3Interface) public feedOf;

    event EthFeedSet(address feed);
    event MaxAgeSet(uint256 maxAge);
    event TokenFeedSet(address indexed token, address feed);

    constructor(address ethUsdFeed_, uint256 maxAge_, address owner_) Ownable(owner_) {
        if (ethUsdFeed_ == address(0) || maxAge_ == 0) revert Errors.InvalidConfig();
        ethUsdFeed = AggregatorV3Interface(ethUsdFeed_);
        maxAge = maxAge_;
    }

    // -------- admin --------
    function setEthFeed(address feed) external onlyOwner {
        if (feed == address(0)) revert Errors.InvalidConfig();
        ethUsdFeed = AggregatorV3Interface(feed);
        emit EthFeedSet(feed);
    }

    function setMaxAge(uint256 maxAge_) external onlyOwner {
        if (maxAge_ == 0) revert Errors.InvalidConfig();
        maxAge = maxAge_;
        emit MaxAgeSet(maxAge_);
    }

    function setTokenFeed(address token, address feed) external onlyOwner {
        feedOf[token] = AggregatorV3Interface(feed); // address(0) disables the token
        emit TokenFeedSet(token, feed);
    }

    // -------- IOracle --------
    /// @inheritdoc IOracle
    function usdPerEth() public view returns (uint256) {
        return _read(ethUsdFeed);
    }

    /// @inheritdoc IOracle
    function usdPerToken(address token) public view returns (uint256) {
        AggregatorV3Interface feed = feedOf[token];
        if (address(feed) == address(0)) revert Errors.InvalidConfig();
        return _read(feed);
    }

    /// @inheritdoc IOracle
    function ethPerToken(address token) external view returns (uint256) {
        uint256 tokUsd = usdPerToken(token); // 1e8
        uint256 ethUsd = usdPerEth(); // 1e8
        if (ethUsd == 0) revert Errors.InvalidConfig();
        return (tokUsd * 1e18) / ethUsd; // wei per 1e18 token
    }

    // -------- internal --------
    /// @dev Read a Chainlink feed, enforce positivity + staleness, normalize to 1e8.
    function _read(AggregatorV3Interface feed) internal view returns (uint256) {
        (, int256 answer,, uint256 updatedAt,) = feed.latestRoundData();
        if (answer <= 0) revert Errors.InvalidConfig();
        if (block.timestamp - updatedAt > maxAge) revert Errors.FloorUnhealthy(); // stale -> fail closed
        uint256 price = uint256(answer);
        uint8 d = feed.decimals();
        if (d == 8) return price;
        if (d < 8) return price * (10 ** uint256(8 - d));
        return price / (10 ** uint256(d - 8));
    }
}
