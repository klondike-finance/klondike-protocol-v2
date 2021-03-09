//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "../interfaces/IBoardroom.sol";

contract BoardroomMock is IBoardroom {
    function notifyTransfer(address token, uint256 amount) public override {
        emit NotifyTransfer(token, amount);
    }

    function stake(address to, uint256 amount) public override {
        emit Stake(to, amount);
    }

    function withdraw(address to, uint256 amount) public override {
        emit Withdraw(to, amount);
    }

    event NotifyTransfer(address token, uint256 amount);
    event Stake(address to, uint256 amount);
    event Withdraw(address to, uint256 amount);
    event UpdateRewardsAfterLock(address owner);
}
