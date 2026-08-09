// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Roulette
/// @notice Pure, verifiable payout logic for a European single-zero wheel
///         (37 pockets, 0–36). Multipliers are TOTAL-return in "milli-x" where
///         1_000 == 1.00× — matching PrizeTable's convention — so a straight-up
///         number pays 36.00× (35:1 plus the stake) and even-money bets pay
///         2.00×. On a single-zero wheel these true payouts give a uniform
///         structural house edge of 1/37 ≈ 2.70%, which accrues to the bankroll.
/// @dev    `resolve(bet, selection, word)` is a pure function anyone can recompute
///         from a landed entropy word, satisfying the "every outcome verifiable"
///         rule. The pocket is `word % 37`.
library Roulette {
    uint256 internal constant ONE_X = 1_000; // 1.00×
    uint256 internal constant POCKETS = 37; // 0..36 (single zero)

    /// @notice Total-return multipliers (milli-x).
    uint256 internal constant STRAIGHT_X = 36_000; // 35:1 + stake
    uint256 internal constant EVEN_MONEY_X = 2_000; // 1:1 + stake
    uint256 internal constant DOZEN_COLUMN_X = 3_000; // 2:1 + stake

    /// @notice Largest multiplier any single bet can pay (straight-up), used as the
    ///         worst-case reserve ceiling by callers that don't inspect the bet.
    uint256 internal constant MAX_MULT_MILLIX = STRAIGHT_X;

    /// @dev Bitmask of red numbers on a European wheel (bit n set == n is red):
    ///      1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36.
    uint256 internal constant RED_MASK = 91447186090;

    enum Bet {
        Straight, // selection = the number, 0..36
        Red, // selection ignored
        Black, // selection ignored
        Even, // selection ignored
        Odd, // selection ignored
        Low, // 1..18, selection ignored
        High, // 19..36, selection ignored
        Dozen, // selection = 0 (1–12), 1 (13–24), 2 (25–36)
        Column // selection = 0/1/2 (n%3==1 / ==2 / ==0)
    }

    /// @notice True if pocket `n` (1..36) is red.
    function isRed(uint256 n) internal pure returns (bool) {
        if (n == 0 || n > 36) return false;
        return ((RED_MASK >> n) & 1) == 1;
    }

    /// @notice Validate a (bet, selection) pair. Reverts nothing — returns false so
    ///         callers can revert with their own error.
    function isValidSelection(Bet bet, uint256 selection) internal pure returns (bool) {
        if (bet == Bet.Straight) return selection <= 36;
        if (bet == Bet.Dozen || bet == Bet.Column) return selection <= 2;
        return selection == 0; // even-money bets ignore selection; require 0
    }

    /// @notice The multiplier a bet pays IF it wins (milli-x). Independent of the
    ///         outcome — used to size the worst-case reserve at bet time.
    function potentialMultiplier(Bet bet) internal pure returns (uint256) {
        if (bet == Bet.Straight) return STRAIGHT_X;
        if (bet == Bet.Dozen || bet == Bet.Column) return DOZEN_COLUMN_X;
        return EVEN_MONEY_X;
    }

    /// @notice The canonical outcome of a spin. Deterministic and pure.
    /// @param bet        The bet type.
    /// @param selection  Number (straight) or group index (dozen/column); ignored otherwise.
    /// @param word       The landed entropy word.
    /// @return win       Whether the bet won.
    /// @return milliX    Total-return multiplier if won, else 0.
    /// @return pocket    The winning pocket (0..36).
    function resolve(Bet bet, uint256 selection, uint256 word)
        internal
        pure
        returns (bool win, uint256 milliX, uint256 pocket)
    {
        pocket = word % POCKETS; // [0, 36]

        if (bet == Bet.Straight) {
            win = (pocket == selection);
            return (win, win ? STRAIGHT_X : 0, pocket);
        }

        // Every outside bet loses on the green zero.
        if (pocket == 0) return (false, 0, pocket);

        if (bet == Bet.Red) {
            win = isRed(pocket);
        } else if (bet == Bet.Black) {
            win = !isRed(pocket);
        } else if (bet == Bet.Even) {
            win = (pocket % 2 == 0);
        } else if (bet == Bet.Odd) {
            win = (pocket % 2 == 1);
        } else if (bet == Bet.Low) {
            win = (pocket <= 18);
        } else if (bet == Bet.High) {
            win = (pocket >= 19);
        } else if (bet == Bet.Dozen) {
            win = ((pocket - 1) / 12 == selection);
            return (win, win ? DOZEN_COLUMN_X : 0, pocket);
        } else if (bet == Bet.Column) {
            uint256 col = pocket % 3 == 0 ? 2 : (pocket % 3) - 1; // n%3==1→0, ==2→1, ==0→2
            win = (col == selection);
            return (win, win ? DOZEN_COLUMN_X : 0, pocket);
        }

        return (win, win ? EVEN_MONEY_X : 0, pocket);
    }
}
