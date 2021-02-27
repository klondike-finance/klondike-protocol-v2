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
    mapping(address => SyntheticToken) public mintableTokens;
    mapping(address => SyntheticToken) public unmintableTokens;
    TokenPair[] public tokens;

    function addPair(address tokenA, address tokenB, address smelter, address oracle) public onlyOperator {
        addTuple(tokenA, tokenB, address(0), address(0), smelter, oracle);
    }

    function addTuple(address mintableTokenA, address mintableTokenB, address unmintableTokenA, address unmintableTokenB, address smelter, address oracle) public onlyOperator {
        (address token0, address token1) = mintableTokenA < mintableTokenB
            ? (mintableTokenA, mintableTokenB)
            : (mintableTokenB, mintableTokenA);
        tokens.push(TokenPair({token0: SyntheticToken(token0), token1: SyntheticToken(token1)}));
        TokenData memory tokenDataItem = TokenData({oracle: OpenOracleView(oracle), smelter: ISmelter(smelter)});
        tokenData[token0][token1] = tokenDataItem;
        tokenData[token1][token0] = tokenDataItem;
        if (unmintableTokenA != address(0)) {
            unmintableTokens[mintableTokenA] = SyntheticToken(unmintableTokenA);
            mintableTokens[unmintableTokenA] = SyntheticToken(mintableTokenA);
        }
        if (unmintableTokenB != address(0)) {
            unmintableTokens[mintableTokenB] = SyntheticToken(unmintableTokenB);
            mintableTokens[unmintableTokenB] = SyntheticToken(mintableTokenB);
        }
    }

    function validPermissions() public view returns (bool) {
        for (uint i = 0; i < tokens.length; i++) {
            ISmelter smelter = tokenData[address(tokens[i].token0)][address(tokens[i].token1)].smelter;
            if (tokens[i].token0.owner() != address(smelter)) {
                return false;
            }
            if (tokens[i].token1.owner() != address(smelter)) {
                return false;
            }
            if (!smelter.isTokenAdmin(address(this))) {
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

    function isMintable(address token) public view returns (bool) {
        return address(unmintableTokens[token]) != address(0);
    }

    function mintableToken(address token) public view returns (address) {
        return isMintable(token) ? address(mintableTokens[address(unmintableTokens[token])]) : address(mintableTokens[token]);
    }


    function swap(address fromToken, address toToken, uint256 amountIn) public {  
        address mintableFromToken = mintableToken(fromToken); 
        address mintableToToken = mintableToken(toToken); 
        require(mintableFromToken != address(0), "Exchange: fromToken isn't managed");
        require(mintableToToken != address(0), "Exchange: toToken isn't managed");
        address unmintableToToken = address(unmintableTokens[mintableToToken]);
        ISmelter smelter = tokenData[mintableFromToken][mintableToToken].smelter;
        require(address(smelter) != address(0), "Exchange: Tokens are not managed");

        uint256 price = getPriceUnitAPerB(mintableToToken, mintableFromToken);
        uint256 amountOut = price.mul(amountIn).div(ETH);
        if (isMintable(fromToken)) {
            smelter.burnSyntheticFrom(fromToken, msg.sender, amountIn);    
        } else {
            SyntheticToken(fromToken).transferFrom(msg.sender, address(this), amountIn);
        }
        if (unmintableToToken != address(0)) {
            SyntheticToken token = SyntheticToken(unmintableToToken);
            uint256 balance = token.balanceOf(address(this));
            uint256 transferAmount = balance < amountOut ? balance : amountOut;
            token.transfer(msg.sender, transferAmount);
            amountOut = amountOut.sub(transferAmount);
            if (amountOut > 0) {
                smelter.mintSynthetic(mintableToToken, msg.sender, amountOut);                
            }
        }
        
        emit Swap(fromToken, toToken, amountIn, amountOut);
    }

    event Swap(address indexed fromToken, address indexed toToken, uint256 amountIn,uint256 amountOut);
}