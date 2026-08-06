// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IOracle} from "../interfaces/Support.sol";

/// @title MockOracle
/// @notice Settable price feed for local/testnet. Replaced on mainnet by real
///         oracle feeds configured in Chains.
contract MockOracle is IOracle {
    mapping(address => uint256) private _ethPerToken;
    mapping(address => uint256) private _usdPerToken;
    uint256 private _usdPerEth = 3000e8;

    function setEthPerToken(address token, uint256 v) external {
        _ethPerToken[token] = v;
    }

    function setUsdPerToken(address token, uint256 v) external {
        _usdPerToken[token] = v;
    }

    function setUsdPerEth(uint256 v) external {
        _usdPerEth = v;
    }

    function ethPerToken(address token) external view returns (uint256) {
        return _ethPerToken[token];
    }

    function usdPerToken(address token) external view returns (uint256) {
        return _usdPerToken[token];
    }

    function usdPerEth() external view returns (uint256) {
        return _usdPerEth;
    }
}
