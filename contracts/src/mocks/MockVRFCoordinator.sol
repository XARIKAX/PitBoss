// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IVRFCoordinatorV2Plus} from "../pit/entropy/VRFEntropyConductor.sol";

/// @title MockVRFCoordinator
/// @notice Test/dev double for Chainlink VRF v2.5. Records requests and lets a
///         test drive the callback (`fulfill`) with a chosen word, exercising the
///         push model of VRFEntropyConductor without a live coordinator.
contract MockVRFCoordinator {
    uint256 public nextRequestId = 1;
    mapping(uint256 => address) public consumerOf;

    event RandomWordsRequested(uint256 indexed requestId, address indexed consumer);

    function requestRandomWords(IVRFCoordinatorV2Plus.RandomWordsRequest calldata)
        external
        returns (uint256 requestId)
    {
        requestId = nextRequestId++;
        consumerOf[requestId] = msg.sender;
        emit RandomWordsRequested(requestId, msg.sender);
    }

    /// @notice Deliver a word to the requesting conductor, as the real coordinator would.
    function fulfill(uint256 requestId, uint256 word) external {
        address consumer = consumerOf[requestId];
        require(consumer != address(0), "unknown request");
        uint256[] memory words = new uint256[](1);
        words[0] = word;
        // matches VRFEntropyConductor.rawFulfillRandomWords
        (bool ok,) = consumer.call(
            abi.encodeWithSignature("rawFulfillRandomWords(uint256,uint256[])", requestId, words)
        );
        require(ok, "callback failed");
    }
}
