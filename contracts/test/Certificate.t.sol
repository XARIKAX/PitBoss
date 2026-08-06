// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./utils/TestBase.sol";

contract CertificateTest is TestBase {
    address internal buyer = makeAddr("buyer");

    function setUp() public {
        deploySystem();
        vm.deal(buyer, 10 ether);
    }

    /// @dev Invariant #1: certificate supply == vaulted deeds, and per-token backing
    ///      equals the contract's token balance (no empty notes, no stray stock).
    function test_SupplyEqualsVaultedBacking() public {
        stock.mint(buyer, 1_000 ether);
        vm.startPrank(buyer);
        stock.approve(address(counter), 1_000 ether);
        uint256 fee = counter.feeEth();
        counter.buy{value: fee}(buyer, address(stock), 400 ether);
        counter.buy{value: fee}(buyer, address(stock), 600 ether);
        vm.stopPrank();

        assertEq(cert.totalSupply(), 2, "two deeds issued");
        assertEq(cert.totalBackedOf(address(stock)), 1_000 ether, "backing tracked");
        assertEq(stock.balanceOf(address(cert)), 1_000 ether, "vault holds exactly the backing");
    }

    /// @dev redeem() burns the deed and releases stock atomically; a spent note
    ///      cannot exist afterward.
    function test_RedeemBurnsAndReleases() public {
        stock.mint(buyer, 500 ether);
        vm.startPrank(buyer);
        stock.approve(address(counter), 500 ether);
        uint256 certId = counter.buy{value: counter.feeEth()}(buyer, address(stock), 500 ether);

        uint256 before = stock.balanceOf(buyer);
        cert.redeem(certId);
        vm.stopPrank();

        assertEq(stock.balanceOf(buyer) - before, 500 ether, "stock released");
        assertEq(cert.totalBackedOf(address(stock)), 0, "backing cleared");
        assertEq(stock.balanceOf(address(cert)), 0, "vault emptied");
        vm.expectRevert();
        cert.ownerOf(certId); // burned
    }

    /// @dev Fee is split 50/50 House Book / protocol reserve.
    function test_FeeSplit() public {
        stock.mint(buyer, 100 ether);
        uint256 fee = counter.feeEth();
        uint256 reserveBefore = protocolReserve.balance;
        uint256 bookBefore = address(book).balance;

        vm.startPrank(buyer);
        stock.approve(address(counter), 100 ether);
        counter.buy{value: fee}(buyer, address(stock), 100 ether);
        vm.stopPrank();

        assertEq(protocolReserve.balance - reserveBefore, fee / 2, "50% to reserve");
        assertEq(address(book).balance - bookBefore, fee - fee / 2, "50% to House Book");
    }

    /// @dev tokenURI renders onchain (data URI), no reverts.
    function test_OnchainTokenURI() public {
        stock.mint(buyer, 42 ether);
        vm.startPrank(buyer);
        stock.approve(address(counter), 42 ether);
        uint256 certId = counter.buy{value: counter.feeEth()}(buyer, address(stock), 42 ether);
        vm.stopPrank();
        string memory uri = cert.tokenURI(certId);
        assertGt(bytes(uri).length, 0, "tokenURI non-empty");
    }
}
