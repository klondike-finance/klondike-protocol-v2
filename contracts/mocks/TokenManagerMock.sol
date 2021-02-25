//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "../interfaces/ITokenManager.sol";

contract TokenManagerMock is ITokenManager {
    address[] _tokens;

    function allTokens() external view override returns (address[] memory) {
        return _tokens;
    }

    function addToken(address token) public {
        _tokens.push(token);
    }

    function isManagedToken(address) external view override returns (bool) {
        return false;
    }

    function isTokenAdmin(address) external view override returns (bool) {
        return false;
    }

    function underlyingToken(address) external view override returns (address) {
        return address(0);
    }

    function averagePrice(address, uint256)
        external
        view
        override
        returns (uint256)
    {
        return 0;
    }

    function currentPrice(address, uint256)
        external
        view
        override
        returns (uint256)
    {
        return 0;
    }

    function updateOracle(address) external override {}

    function burnSyntheticFrom(
        address,
        address,
        uint256
    ) external override {}

    function mintSynthetic(
        address,
        address,
        uint256
    ) external override {}

    function oneSyntheticUnit(address)
        external
        view
        override
        returns (uint256)
    {
        return 0;
    }

    function oneUnderlyingUnit(address)
        external
        view
        override
        returns (uint256)
    {
        return 0;
    }
}
