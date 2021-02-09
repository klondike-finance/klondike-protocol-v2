//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "../interfaces/IBondManager.sol";

contract BondManagerMock is IBondManager {
    function addBondToken(
        address syntheticTokenAddress,
        address bondTokenAddress
    ) external override {
        emit AddBondToken(syntheticTokenAddress, bondTokenAddress);
    }

    function deleteBondToken(address syntheticTokenAddress, address newOperator)
        external
        override
    {
        emit DeleteBondToken(syntheticTokenAddress, newOperator);
    }

    event AddBondToken(address syntheticTokenAddress, address bondTokenAddress);
    event DeleteBondToken(address syntheticTokenAddress, address newOperator);
}
