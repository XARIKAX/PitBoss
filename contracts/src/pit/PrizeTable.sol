// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PrizeTable
/// @notice The Degen Roll multiplier table, encoded as a bytecode constant.
///         Multipliers are in "milli-x" where 1_000 == 1.00× (floor 0.70× == 700,
///         ceiling 50× == 50_000). Odds are in basis points summing to 10_000.
///         RTP = 90% (EV = 0.90) — verified in test/PrizeTable.t.sol. [CONFIG: if
///         RTP changes, regenerate this table and re-verify the EV test.]
/// @dev    `multiplierFor(word)` is a pure function anyone can recompute from a
///         landed entropy word, satisfying the "every outcome verifiable" rule.
library PrizeTable {
    uint256 internal constant ONE_X = 1_000; // 1.00x
    uint256 internal constant FLOOR_X = 700; // 0.70x
    uint256 internal constant CEIL_X = 50_000; // 50x
    uint256 internal constant ODDS_DENOM = 10_000;

    /// @notice Number of rows in the table.
    function rows() internal pure returns (uint256) {
        return 21;
    }

    /// @notice Multipliers (milli-x), parallel to `oddsBps`.
    function mults() internal pure returns (uint16[21] memory m) {
        m = [
            uint16(700), 750, 800, 850, 900, 950, 1000, 1100, 1250, 1500, 1750, 2000, 2500, 3000, 4000, 5000,
            7500, 10000, 15000, 25000, 50000
        ];
    }

    /// @notice Odds in basis points, parallel to `mults`. Sum == 10_000.
    function oddsBps() internal pure returns (uint16[21] memory o) {
        o = [
            uint16(4518), 3640, 290, 224, 180, 150, 250, 180, 140, 110, 80, 70, 50, 35, 20, 16, 15, 12, 6, 4, 10
        ];
    }

    /// @notice Map an entropy word to a multiplier (milli-x). Deterministic and
    ///         pure — the canonical verification function for a roll.
    function multiplierFor(uint256 word) internal pure returns (uint256 milliX, uint256 index) {
        uint256 r = word % ODDS_DENOM; // [0, 9999]
        uint16[21] memory o = oddsBps();
        uint16[21] memory m = mults();
        uint256 cum;
        for (uint256 i; i < 21; ++i) {
            cum += o[i];
            if (r < cum) {
                return (m[i], i);
            }
        }
        // Unreachable: odds sum to 10_000. Fall back to floor for safety.
        return (FLOOR_X, 0);
    }

    /// @notice Payout for a ticket given a word, in the ticket's units.
    function payoutFor(uint256 ticket, uint256 word) internal pure returns (uint256) {
        (uint256 milliX,) = multiplierFor(word);
        return (ticket * milliX) / ONE_X;
    }

    /// @notice Worst-case payout multiple used for reserve math: the ceiling.
    function maxMultiplierMilliX() internal pure returns (uint256) {
        return CEIL_X;
    }
}
