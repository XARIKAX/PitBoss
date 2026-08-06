// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Errors
/// @notice Shared custom errors used across PitBosses money contracts.
library Errors {
    error ZeroAddress();
    error ZeroAmount();
    error NotOwner();
    error NotActivated();
    error AlreadyActivated();
    error SupplyExhausted();
    error InsufficientPayment();
    error SlippageExceeded();
    error NothingToClaim();
    error Reentrancy();
    error FloorUnhealthy(); // entropy stalled: no new ticket sales
    error TimelockPending();
    error TimelockNotReady();
    error NotAuthorized();
    error InvalidConfig();
    error ReserveShortfall(); // open-round reserves would exceed inventory
    error RoundNotReady();
    error RoundAlreadySettled();
    error NotRefundableYet();
    error WindowNotElapsed(); // locker principal still locked
    error PermanentLock();
    error BarNotFull();
    error NoLiveTokens();
}
