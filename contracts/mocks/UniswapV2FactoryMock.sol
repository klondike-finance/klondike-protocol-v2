//SPDX-License-Identifier: MIT
pragma solidity =0.5.16;

import "@uniswap/v2-core/contracts/UniswapV2Factory.sol";

/// Fixed window oracle that recomputes the average price for the entire period once every period
/// @title Oracle
/// @dev note that the price average is only guaranteed to be over at least 1 period, but may be over a longer period
contract UniswapV2FactoryMock is UniswapV2Factory {

}
