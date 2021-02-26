//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";
import "./access/Operatable.sol";
import "./interfaces/ISmelter.sol";
import "./libraries/UniswapLibrary.sol";
import "./SyntheticToken.sol";

contract Exchange is Operatable {
    uint256 constant ETH = 10**18;
    using SafeMath for uint256;
    struct TokenData {
        AggregatorV3Interface oracle0;
        AggregatorV3Interface oracle1;
        ISmelter smelter;
    }
    struct TokenPair {
        SyntheticToken token0;
        SyntheticToken token1;
        
    }
    mapping(address => mapping(address => TokenData)) public tokenData;
    TokenPair[] public tokens;

    function addPair(address tokenA, address tokenB, address smelter, address oracleA, address oracleB) public onlyOperator {
        (address token0, address token1) = UniswapLibrary.sortTokens(tokenA, tokenB);
        tokens.push(TokenPair({token0: SyntheticToken(token0), token1: SyntheticToken(token1)}));
        tokenData[tokenA][tokenB] = TokenData({oracle0: AggregatorV3Interface(oracleA), oracle1: AggregatorV3Interface(oracleB), smelter: ISmelter(smelter)});
        tokenData[tokenB][tokenA] = TokenData({oracle0: AggregatorV3Interface(oracleB), oracle1: AggregatorV3Interface(oracleA), smelter: ISmelter(smelter)});
    }

    function validPermissions() public view returns (bool) {
        for (uint i = 0; i < tokens.length; i++) {
            ISmelter smelter = tokenData[address(tokens[i].token0)][address(tokens[i].token1)].smelter;
            if (tokens[i].token0.operator() != address(smelter)) {
                return false;
            }
            if (tokens[i].token1.operator() != address(smelter)) {
                return false;
            }
            if (smelter.isTokenAdmin(address(this))) {
                return false;
            }
        }
        return true;
    }

    function getPriceUnitAPerB(address tokenA, address tokenB) public view returns (uint256) {
        TokenData storage oraclePair = tokenData[tokenA][tokenB];
        if (address(oraclePair.oracle0) == address(0)) {
            return ETH;
        }
        
        (,int price0,,,) = oraclePair.oracle0.latestRoundData(); // A per USD
        (,int price1,,,) = oraclePair.oracle1.latestRoundData(); // B per USD
        return uint256(price1).mul(ETH).div(uint256(price0));
    }

    function swap(address fromToken, address toToken, uint256 amountIn) public {
        ISmelter smelter = tokenData[fromToken][toToken].smelter;
        require(address(smelter) != address(0), "Exchange: Tokens are not managed");

        uint256 price = getPriceUnitAPerB(toToken, fromToken);
        uint256 amountOut = price.mul(amountIn).div(ETH);
        smelter.burnSyntheticFrom(fromToken, msg.sender, amountIn);
        smelter.mintSynthetic(toToken, msg.sender, amountOut);
        emit Swap(fromToken, toToken, amountIn, amountOut);
    }

    event Swap(address indexed fromToken, address indexed toToken, uint256 amountIn,uint256 amountOut);
}