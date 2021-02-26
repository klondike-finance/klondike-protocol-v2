//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "./interfaces/ISmelter.sol";
import "./SyntheticToken.sol";
import "./openoracle/OpenOracleView.sol";

contract Exchange is Operatable {
    uint256 constant ETH = 10**18;
    using SafeMath for uint256;
    struct TokenData {
        OpenOracleView oracle;
        ISmelter smelter;
    }
    struct TokenPair {
        SyntheticToken token0;
        SyntheticToken token1;
        
    }
    mapping(address => mapping(address => TokenData)) public tokenData;
    TokenPair[] public tokens;

    function addPair(address tokenA, address tokenB, address smelter, address oracle) public onlyOperator {
        (address token0, address token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);
        tokens.push(TokenPair({token0: SyntheticToken(token0), token1: SyntheticToken(token1)}));
        TokenData memory tokenDataItem = TokenData({oracle: OpenOracleView(oracle), smelter: ISmelter(smelter)});
        tokenData[tokenA][tokenB] = tokenDataItem;
        tokenData[tokenB][tokenA] = tokenDataItem;
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
        if (address(oraclePair.oracle) == address(0)) {
            return ETH;
        }
        return oraclePair.oracle.getPrice(tokenA, tokenB);
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