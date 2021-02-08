//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "../libraries/UniswapLibrary.sol";

contract UniswapLibraryTest {
    function pairFor(
        address factory,
        address tokenA,
        address tokenB
    ) public pure returns (address pair) {
        return UniswapLibrary.pairFor(factory, tokenA, tokenB);
    }

    function sortTokens(address tokenA, address tokenB)
        public
        pure
        returns (address token0, address token1)
    {
        (token0, token1) = UniswapLibrary.sortTokens(tokenA, tokenB);
    }

    // given some amount of an asset and pair reserves, returns an equivalent amount of the other asset
    function quote(
        uint256 amountA,
        uint256 reserveA,
        uint256 reserveB
    ) public pure returns (uint256 amountB) {
        amountB = UniswapLibrary.quote(amountA, reserveA, reserveB);
    }

    // fetches and sorts the reserves for a pair
    function getReserves(
        address factory,
        address tokenA,
        address tokenB
    ) public view returns (uint256 reserveA, uint256 reserveB) {
        (reserveA, reserveB) = UniswapLibrary.getReserves(
            factory,
            tokenA,
            tokenB
        );
    }
}
