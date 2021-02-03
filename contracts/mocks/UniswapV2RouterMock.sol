//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "@uniswap/v2-periphery/contracts/UniswapV2Router02.sol";

/// Fixed window oracle that recomputes the average price for the entire period once every period
/// @title Oracle
/// @dev note that the price average is only guaranteed to be over at least 1 period, but may be over a longer period
contract UniswapV2Router02Mock is UniswapV2Router02 {
    constructor(address _factory, address _WETH)
        public
        UniswapV2Router02(_factory, _WETH)
    {}
}
