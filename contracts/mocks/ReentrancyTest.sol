//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "../access/ReentrancyGuardable.sol";

contract ReentrancyTest is ReentrancyGuardable {
    uint256 public stub;

    function test(uint256 _stub) public onePerBlock {
        stub = _stub;
    }
}
