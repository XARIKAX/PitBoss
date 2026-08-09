// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IVRFService
/// @notice The managed randomness service on Robinhood Chain
///         (`BlockhashRandomnessServiceV3` today; `PythEntropyService` when Pyth
///         lands — same interface). A registered consumer requests a word for a
///         flat native fee; the service delivers it a block later (keeper-cron'd,
///         re-arming if the blockhash ages out). Truth is pulled via `wordOf`; the
///         `onRandomWord` callback into the consumer is a best-effort hint.
interface IVRFService {
    /// @notice Request a random word. Caller must be the registered consumer and
    ///         forward at least `vrfFeeNative()`. Returns a hash-namespaced id.
    function requestRandomWord() external payable returns (uint256 requestId);

    /// @notice Flat native-ETH fee per request.
    function vrfFeeNative() external view returns (uint256);

    /// @notice The delivered word for `requestId`. `available` is false until the
    ///         service has delivered it.
    function wordOf(uint256 requestId) external view returns (bool available, uint256 word);
}

/// @notice Consumer callback the service invokes (best-effort, try/catch-wrapped)
///         when a word lands. It passes only the requestId — the consumer pulls
///         the word from `wordOf`. MUST NOT revert.
interface IVRFConsumer {
    function onRandomWord(uint256 requestId) external;
}
