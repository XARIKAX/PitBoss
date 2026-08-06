// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolDeployer} from "../launcher/interfaces.sol";
import {INonfungiblePositionManager as INPM} from "../interfaces/INonfungiblePositionManager.sol";

/// @title MockPoolDeployer
/// @notice Local/testnet stand-in for the V3 pool + LP creation on graduation. It
///         pulls the launch tokens, holds the pair ETH, and mints a mock position
///         NFT to the caller (the launcher) so the auto-lock flow can be exercised
///         end to end. Production replaces this with a real Uniswap V3 adapter.
contract MockPoolDeployer is IPoolDeployer, ERC721 {
    uint256 private _nextId = 1;
    mapping(uint256 => uint128) public liquidityOf;
    mapping(uint256 => address) public token0Of;
    mapping(uint256 => address) public token1Of;

    constructor() ERC721("Mock V3 Position", "MV3") {}

    function deployPoolAndMint(address launchToken, address pairAsset, uint256 tokenAmount)
        external
        payable
        returns (address positionManager, uint256 positionId)
    {
        IERC20(launchToken).transferFrom(msg.sender, address(this), tokenAmount);
        positionId = _nextId++;
        liquidityOf[positionId] = uint128(tokenAmount);
        token0Of[positionId] = launchToken;
        token1Of[positionId] = pairAsset;
        _safeMint(msg.sender, positionId);
        return (address(this), positionId);
    }

    // -------- INPM surface (enough for the Locker) --------

    function positions(uint256 tokenId)
        external
        view
        returns (uint96, address, address, address, uint24, int24, int24, uint128, uint256, uint256, uint128, uint128)
    {
        return (0, address(0), token0Of[tokenId], token1Of[tokenId], 0, 0, 0, liquidityOf[tokenId], 0, 0, 0, 0);
    }

    function collect(INPM.CollectParams calldata) external pure returns (uint256, uint256) {
        return (0, 0); // no accrued fees in the mock
    }

    function decreaseLiquidity(INPM.DecreaseLiquidityParams calldata p) external returns (uint256, uint256) {
        liquidityOf[p.tokenId] -= p.liquidity;
        return (p.liquidity, 0);
    }

    // ownerOf + safeTransferFrom(address,address,uint256) are inherited from ERC721
    // and match the INPM surface the Locker calls via interface cast. The mock does
    // not formally inherit INPM (OZ's 3-arg safeTransferFrom is non-virtual), which
    // is fine: INPM(address(this)).f() dispatches by selector regardless.
}
