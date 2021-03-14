//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "../interfaces/IBoardroom.sol";

contract BoardroomMock is IBoardroom {
    function notifyTransfer(address token, uint256 amount) public override {
        emit NotifyTransfer(token, amount);
    }

    function updateAccruals(address owner) public {
        emit UpdateAccruals(msg.sender, owner);
    }

    event NotifyTransfer(address token, uint256 amount);
    event UpdateAccruals(address sender, address owner);
}
