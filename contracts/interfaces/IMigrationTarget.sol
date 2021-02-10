//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

/// Target for migrations
interface IMigrationTarget {
    function name() external returns (string memory);
}
