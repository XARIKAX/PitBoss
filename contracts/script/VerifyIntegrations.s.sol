// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IOracle, ISwapRouter} from "../src/interfaces/Support.sol";
import {IVRFService} from "../src/interfaces/IVRFService.sol";

/// @title VerifyIntegrations
/// @notice On-chain dry run for the two external dependencies that can't be proven
///         from the repo: the **Chainlink oracle** and the **Uniswap V3 multi-hop
///         swap** (WETH → USDG → stock). Run it against a Robinhood testnet (or a
///         mainnet fork) AFTER deploying the adapters and setting a stock's feed +
///         route. It reads the oracle and executes a tiny real swap, so a green run
///         proves feeds return data and the route has liquidity.
///
/// @dev    Env:
///           ORACLE       — ChainlinkOracleAdapter
///           SWAP_ROUTER  — UniV3RouterAdapter (route already set: setRouteVia)
///           STOCK        — a reward stock (e.g. NVDA 0xd060…9EEC)
///           PROBE_ETH    — swap size in wei (default 0.001 ETH)
///           VRF_SERVICE  — (optional) BlockhashRandomnessServiceV3, to log its fee
///         Requires the sender to hold `PROBE_ETH`.
contract VerifyIntegrations is Script {
    function run() external {
        address oracleAddr = vm.envAddress("ORACLE");
        address routerAddr = vm.envAddress("SWAP_ROUTER");
        address stock = vm.envAddress("STOCK");
        uint256 probe = vm.envOr("PROBE_ETH", uint256(0.001 ether));

        IOracle oracle = IOracle(oracleAddr);
        ISwapRouter router = ISwapRouter(routerAddr);

        // 1) Chainlink oracle reads.
        console2.log("== oracle ==");
        console2.log("usdPerEth (1e8):", oracle.usdPerEth());
        console2.log("ethPerToken (wei/1e18 token):", oracle.ethPerToken(stock));

        // 2) VRF service reachable (optional).
        address vrf = vm.envOr("VRF_SERVICE", address(0));
        if (vrf != address(0)) {
            console2.log("== vrf ==");
            console2.log("vrfFeeNative (wei):", IVRFService(vrf).vrfFeeNative());
        }

        // 3) Live multi-hop swap probe.
        console2.log("== swap probe ==");
        uint256 quote = router.quoteETHForTokens(stock, probe);
        uint256 minOut = (quote * 9000) / 10_000; // 10% slippage tolerance for the probe
        console2.log("quote out:", quote);
        console2.log("minOut:", minOut);

        address me = msg.sender;
        uint256 before = IERC20(stock).balanceOf(me);

        vm.startBroadcast();
        uint256 got = router.swapExactETHForTokens{value: probe}(stock, minOut, me);
        vm.stopBroadcast();

        console2.log("swap returned:", got);
        console2.log("stock received:", IERC20(stock).balanceOf(me) - before);
        console2.log("VERIFY OK: oracle reads + live WETH->USDG->stock swap succeeded");
    }
}
