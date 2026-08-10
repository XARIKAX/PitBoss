// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VRFServiceConductor} from "../src/pit/entropy/VRFServiceConductor.sol";
import {IVRFService} from "../src/interfaces/IVRFService.sol";

/// @dev Minimal IVRFService: flat fee, hash-namespaced ids, settable delivery.
contract MockVRFService is IVRFService {
    uint256 public fee;
    uint256 internal nonce;
    mapping(uint256 => uint256) internal _words;
    mapping(uint256 => bool) internal _avail;

    function setFee(uint256 f) external {
        fee = f;
    }

    function vrfFeeNative() external view returns (uint256) {
        return fee;
    }

    function requestRandomWord() external payable returns (uint256 requestId) {
        require(msg.value >= fee, "fee");
        requestId = uint256(keccak256(abi.encodePacked("mock", nonce++)));
    }

    function wordOf(uint256 requestId) external view returns (bool, uint256) {
        return (_avail[requestId], _words[requestId]);
    }

    /// @dev Test-only: simulate the keeper's deliver().
    function deliver(uint256 requestId, uint256 word) external {
        _words[requestId] = word;
        _avail[requestId] = true;
    }
}

contract VRFServiceConductorTest is Test {
    MockVRFService internal svc;
    VRFServiceConductor internal cond;

    receive() external payable {}

    function setUp() public {
        vm.warp(1_000_000);
        svc = new MockVRFService();
        svc.setFee(0.001 ether);
        cond = new VRFServiceConductor(address(svc), address(this));
        vm.deal(address(this), 100 ether);
        (bool ok,) = address(cond).call{value: 1 ether}(""); // fund the fee float
        require(ok, "fund");
    }

    function test_CommitFulfill_PullsWord() public {
        bytes32 id = keccak256("round-1");
        uint64 readyAt = uint64(block.timestamp) + 30;
        cond.commit(id, readyAt);

        uint256 reqId = cond.requestIdOf(address(this), id);
        svc.deliver(reqId, 0xABCDEF);

        vm.warp(block.timestamp + 31);
        assertTrue(cond.isReady(id), "ready once delivered + readyAt passed");
        uint256 w = cond.fulfill(id);
        assertEq(w, 0xABCDEF, "word pulled from service");
        assertEq(cond.wordOf(id), 0xABCDEF, "wordOf reproduces");
        assertTrue(cond.isFulfilled(id));
    }

    function test_NotReady_BeforeReadyAt() public {
        bytes32 id = keccak256("r2");
        cond.commit(id, uint64(block.timestamp) + 100);
        svc.deliver(cond.requestIdOf(address(this), id), 7);
        vm.expectRevert(); // readyAt not passed
        cond.fulfill(id);
    }

    function test_NotReady_BeforeDelivery() public {
        bytes32 id = keccak256("r3");
        cond.commit(id, uint64(block.timestamp) + 1);
        vm.warp(block.timestamp + 2);
        vm.expectRevert(); // service hasn't delivered
        cond.fulfill(id);
    }

    function test_FailsClosed_WhenFloatEmpty() public {
        cond.withdraw(address(this), address(cond).balance);
        assertFalse(cond.healthy(), "unhealthy when float can't cover fee");
        vm.expectRevert(); // FloorUnhealthy
        cond.commit(keccak256("x"), uint64(block.timestamp) + 1);
    }

    function test_FeePaidPerCommit() public {
        uint256 before = address(cond).balance;
        cond.commit(keccak256("r4"), uint64(block.timestamp) + 1);
        assertEq(address(cond).balance, before - svc.fee(), "flat fee forwarded to service");
    }
}
