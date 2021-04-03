//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "../interfaces/IVault.sol";

contract VaultMock is IVault {
    address public override token;

    constructor(address _token) public {
        token = _token;
    }

    function deposit(uint256 amount) external override {
        emit VaultDeposited(amount);
    }

    function withdraw(uint256 amount) external override {
        emit VaultWithdrawn(amount);
    }

    event VaultDeposited(uint256 amount);
    event VaultWithdrawn(uint256 amount);
}
