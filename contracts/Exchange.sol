//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";
import "./access/Operatable.sol";
import "./treasury/TokenManager.sol";
import "./libraries/UniswapLibrary.sol";

contract Exchange is Operatable {
    uint256 constant ETH = 10**18;
    using SafeMath for uint256;
    struct OraclePair {
        AggregatorV3Interface oracle0;
        AggregatorV3Interface oracle1;
    }
    struct TokenPair {
        ERC20 token0;
        ERC20 token1;
    }
    mapping(address => mapping(address => OraclePair)) public oracleIndex;
    TokenPair[] public tokens;
    TokenManager public tokenManager;

    function addPair(address tokenA, address tokenB, address oracleA, address oracleB) public onlyOperator {
        (address token0, address token1) = UniswapLibrary.sortTokens(tokenA, tokenB);
        tokens.push(TokenPair({token0: ERC20(token0), token1: ERC20(token1)}));
        oracleIndex[tokenA][tokenB] = OraclePair({oracle0: AggregatorV3Interface(oracleA), oracle1: AggregatorV3Interface(oracleB)});
        oracleIndex[tokenB][tokenA] = OraclePair({oracle0: AggregatorV3Interface(oracleB), oracle1: AggregatorV3Interface(oracleA)});
    }
    function validPermissions() public view returns (bool) {
        return tokenManager.isTokenAdmin(address(this));
    }

    function getPriceUnitAPerB(address tokenA, address tokenB) public view returns (uint256) {
        OraclePair storage oraclePair = oracleIndex[tokenA][tokenB];
        (,int price0,,,) = oraclePair.oracle0.latestRoundData(); // A per USD
        (,int price1,,,) = oraclePair.oracle1.latestRoundData(); // B per USD
        return uint256(price1).mul(ETH).div(uint256(price0));
    }

    function swap(address fromToken, address toToken, uint256 amountIn) public {
        uint256 price = getPriceUnitAPerB(toToken, fromToken);
        uint256 amountOut = price.mul(amountIn).div(ETH);
        tokenManager.burnSyntheticFrom(fromToken, msg.sender, amountIn);
        tokenManager.mintSynthetic(toToken, msg.sender, amountOut);
        emit Swap(fromToken, toToken, amountIn, amountOut);
    }

    event Swap(address indexed fromToken, address indexed toToken, uint256 amountIn,uint256 amountOut);
}