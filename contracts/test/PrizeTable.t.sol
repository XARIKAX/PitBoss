// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PrizeTable} from "../src/pit/PrizeTable.sol";

/// @dev Exposes the internal library for testing.
contract PrizeTableHarness {
    function multiplierFor(uint256 word) external pure returns (uint256 milliX, uint256 index) {
        return PrizeTable.multiplierFor(word);
    }

    function mults() external pure returns (uint16[21] memory) {
        return PrizeTable.mults();
    }

    function oddsBps() external pure returns (uint16[21] memory) {
        return PrizeTable.oddsBps();
    }

    /// @dev Sample a chunk of the distribution in its own call frame. EVM memory
    ///      is never freed within a frame, so sampling everything in one frame
    ///      runs out of memory (MemoryOOG); chunked external calls each start
    ///      with fresh memory.
    function countChunk(uint256 seed, uint256 start, uint256 n)
        external
        pure
        returns (uint256[21] memory counts)
    {
        for (uint256 i; i < n; ++i) {
            uint256 word = uint256(keccak256(abi.encode(seed, start + i)));
            (, uint256 idx) = PrizeTable.multiplierFor(word);
            counts[idx] += 1;
        }
    }
}

contract PrizeTableTest is Test {
    PrizeTableHarness h;

    function setUp() public {
        h = new PrizeTableHarness();
    }

    /// @notice Published odds must sum to exactly 10_000 bps.
    function test_OddsSumTo10000() public view {
        uint16[21] memory o = h.oddsBps();
        uint256 sum;
        for (uint256 i; i < 21; ++i) sum += o[i];
        assertEq(sum, 10_000, "odds must sum to 10000 bps");
    }

    /// @notice EV must equal exactly 0.90 (RTP 90%). In milli-x, EV == 900.
    function test_EV_Is_090() public view {
        uint16[21] memory m = h.mults();
        uint16[21] memory o = h.oddsBps();
        uint256 acc; // Σ mult_milliX * odds_bps
        for (uint256 i; i < 21; ++i) {
            acc += uint256(m[i]) * o[i];
        }
        // EV_milliX = acc / 10_000
        assertEq(acc, 9_000_000, "sum mult*odds must be 9,000,000");
        assertEq(acc / 10_000, 900, "EV must be 0.900x");
    }

    /// @notice Every possible word maps to a multiplier within [floor, ceiling].
    function test_Bounds_AllResidues() public view {
        for (uint256 r; r < 10_000; ++r) {
            (uint256 milliX,) = h.multiplierFor(r);
            assertGe(milliX, PrizeTable.FLOOR_X, "below floor 0.70x");
            assertLe(milliX, PrizeTable.CEIL_X, "above ceiling 50x");
        }
    }

    /// @notice The first residues resolve to the floor (0.70x), the last to 50x.
    function test_FloorAndCeilingResidues() public view {
        (uint256 lo,) = h.multiplierFor(0);
        assertEq(lo, 700, "residue 0 -> 0.70x");
        (uint256 hi,) = h.multiplierFor(9_999);
        assertEq(hi, 50_000, "residue 9999 -> 50x");
    }

    /// @notice Distribution fuzz vs the published table. Uses a deterministic PRNG
    ///         so the chi-square statistic is reproducible (not flaky). A correct
    ///         table yields chi-square near the 20-dof mean (~20); the generous
    ///         bound catches gross deviations while tolerating sampling noise.
    function test_DistributionChiSquare() public view {
        uint256 N = 50_000; // smallest expected count = 4bps * 50k = 20 (chi2-valid)
        uint256 CHUNK = 1_000; // per-frame bound so memory never OOGs
        uint16[21] memory o = h.oddsBps();
        uint256[21] memory obs;

        uint256 seed = uint256(keccak256("pitbosses-prize-fuzz"));
        for (uint256 c; c < N / CHUNK; ++c) {
            uint256[21] memory part = h.countChunk(seed, c * CHUNK, CHUNK);
            for (uint256 i; i < 21; ++i) obs[i] += part[i];
        }

        // chi-square scaled by 1e6 for integer precision.
        uint256 chi2_1e6;
        for (uint256 i; i < 21; ++i) {
            uint256 exp = (N * o[i]) / 10_000; // expected count
            assertGt(exp, 0, "expected count must be positive");
            uint256 diff = obs[i] > exp ? obs[i] - exp : exp - obs[i];
            // (diff^2 / exp) * 1e6
            chi2_1e6 += (diff * diff * 1e6) / exp;
        }
        uint256 chi2 = chi2_1e6 / 1e6;
        // 20 dof: mean 20, p=0.001 critical ~45.3. Bound at 100 to be robust to the
        // fixed seed while still failing on a broken table (which scores thousands).
        assertLt(chi2, 100, "distribution deviates from published table");
    }
}
