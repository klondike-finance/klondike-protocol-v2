//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

/// Boardroom as seen by others
interface IBoardroom {
    function notifyTransfer(address token, uint256 amount) external;
}
