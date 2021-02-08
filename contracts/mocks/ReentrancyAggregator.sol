//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "./ReentrancyTest.sol";

contract ReentrancyAggregator {
    address[] private reentrancyTests;

    constructor(address[] memory _reentrancyTests) public {
        reentrancyTests = _reentrancyTests;
    }

    /// call each reentrancy several times
    function test(uint256 number) public {
        uint256 i;
        uint256 j;
        for (i = 0; i < reentrancyTests.length; i++) {
            for (j = 0; j < number; j++) {
                ReentrancyTest t = ReentrancyTest(reentrancyTests[i]);
                t.test(number);
            }
        }
    }
}
