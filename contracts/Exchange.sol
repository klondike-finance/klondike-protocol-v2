//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "./interfaces/ISmelter.sol";
import "./SyntheticToken.sol";
import "./access/Migratable.sol";
import "./openoracle/OpenOracleView.sol";

contract Exchange is Operatable, Migratable {
    using SafeMath for uint256;
    struct TokenData {
        string oracleTicker;
        ISmelter smelter;
    }
    mapping(address => TokenData) public tokenData;
    mapping(address => address) public mintableTokens;
    mapping(address => address) public unmintableTokens;
    OpenOracleView public oracle;
    address[] public tokens;

    function addToken(address mintableToken, string memory oracleTicker, address smelter) public onlyOperator {
        addTokenPair(mintableToken, address(0), oracleTicker, smelter);
    }

    function addTokenPair(address mintableToken, address unmintableToken, string memory oracleTicker, address smelter) public onlyOperator {
        tokens.push(mintableToken);
        TokenData memory tokenDataItem = TokenData({oracleTicker: oracleTicker, smelter: ISmelter(smelter)});
        tokenData[mintableToken] = tokenDataItem;
        if (unmintableToken != address(0)) {
            unmintableTokens[mintableToken] = unmintableToken;
            mintableTokens[unmintableToken] = mintableToken;
        }
    }

    function validPermissions() public view returns (bool) {
        for (uint i = 0; i < tokens.length; i++) {
            ISmelter smelter = tokenData[tokens[i]].smelter;
            if (SyntheticToken(tokens[i]).owner() != address(smelter)) {
                return false;
            }
            if (!smelter.isTokenAdmin(address(this))) {
                return false;
            }
        }
        return true;
    }

    // throws if ticker doesn't exist
    function getUnitPriceAPerB(address tokenA, address tokenB) public view returns (uint256) {
        string storage oracleTickerA = tokenData[tokenA].oracleTicker;
        string storage oracleTickerB = tokenData[tokenB].oracleTicker;
        return oracle.getUnitPriceAPerB(oracleTickerA, oracleTickerB);
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
        ISmelter mintableFromSmelter = tokenData[mintableFromToken].smelter;
        ISmelter mintableToSmelter = tokenData[mintableToToken].smelter;
        require(address(mintableFromSmelter) != address(0), "Exchange: FromToken is not managed");
        require(address(mintableToSmelter) != address(0), "Exchange: ToToken is not managed");

        uint256 price = getUnitPriceAPerB(mintableToToken, mintableFromToken);
        uint256 amountOut = price.mul(amountIn).div(1 ether);
        if (isMintable(fromToken)) {
            mintableFromSmelter.burnSyntheticFrom(fromToken, msg.sender, amountIn);    
        } else {
            SyntheticToken(fromToken).transferFrom(msg.sender, address(this), amountIn);
        }
        if (unmintableToToken != address(0)) {
            SyntheticToken token = SyntheticToken(unmintableToToken);
            uint256 balance = token.balanceOf(address(this));
            uint256 transferAmount = balance < amountOut ? balance : amountOut;
            token.transfer(msg.sender, transferAmount);
            amountOut = amountOut.sub(transferAmount);
        }
        if (amountOut > 0) {
            mintableToSmelter.mintSynthetic(mintableToToken, msg.sender, amountOut);                
        }
        
        emit Swap(fromToken, toToken, amountIn, amountOut);
    }

    event Swap(address indexed fromToken, address indexed toToken, uint256 amountIn,uint256 amountOut);
}