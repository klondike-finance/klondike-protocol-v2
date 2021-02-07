//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

import "../libraries/UniswapLibrary.sol";
import "../interfaces/IOracle.sol";
import "../SyntheticToken.sol";
import "../access/Operatable.sol";

contract TokenManager is Operatable {
    struct TokenData {
        SyntheticToken syntheticToken;
        uint8 syntheticDecimals;
        ERC20 underlyingToken;
        uint8 underlyingDecimals;
        IUniswapV2Pair pair;
        IOracle oracle;
    }
    mapping(address => TokenData) public tokenIndex;
    address[] public tokens;
    address public immutable uniswapFactory;

    // ------- Constructor ----------

    constructor(address _uniswapFactory) public {
        uniswapFactory = _uniswapFactory;
    }

    // ------- Modifiers ----------

    modifier managedToken(address syntheticTokenAddress) {
        require(
            isManagingToken(syntheticTokenAddress),
            "TokenManager: Token is not managed"
        );
        _;
    }

    // ------- View ----------

    function isManagingToken(address syntheticTokenAddress)
        public
        view
        returns (bool)
    {
        return
            address(tokenIndex[syntheticTokenAddress].syntheticToken) !=
            address(0);
    }

    function syntheticDecimals(address syntheticTokenAddress)
        public
        view
        managedToken(syntheticTokenAddress)
        returns (uint8)
    {
        return tokenIndex[syntheticTokenAddress].syntheticDecimals;
    }

    function underlyingDecimals(address syntheticTokenAddress)
        public
        view
        managedToken(syntheticTokenAddress)
        returns (uint8)
    {
        return tokenIndex[syntheticTokenAddress].underlyingDecimals;
    }

    function averagePrice(
        address syntheticTokenAddress,
        uint256 syntheticTokenAmount
    ) public view managedToken(syntheticTokenAddress) returns (uint256) {
        IOracle oracle = tokenIndex[syntheticTokenAddress].oracle;
        return oracle.consult(syntheticTokenAddress, syntheticTokenAmount);
    }

    function currentPrice(
        address syntheticTokenAddress,
        uint256 syntheticTokenAmount
    ) public view managedToken(syntheticTokenAddress) returns (uint256) {
        address underlyingTokenAddress =
            address(tokenIndex[syntheticTokenAddress].underlyingToken);
        (uint256 syntheticReserve, uint256 undelyingReserve) =
            UniswapLibrary.getReserves(
                uniswapFactory,
                syntheticTokenAddress,
                underlyingTokenAddress
            );
        return
            UniswapLibrary.quote(
                syntheticTokenAmount,
                syntheticReserve,
                undelyingReserve
            );
    }

    // ------- External, Operator ----------

    function addToken(
        address syntheticTokenAddress,
        address underlyingTokenAddress,
        address oracleAddress
    ) external onlyOperator {
        SyntheticToken syntheticToken = SyntheticToken(syntheticTokenAddress);
        ERC20 underlyingToken = ERC20(underlyingTokenAddress);
        IOracle oracle = IOracle(oracleAddress);
        IUniswapV2Pair pair =
            IUniswapV2Pair(
                UniswapLibrary.pairFor(
                    uniswapFactory,
                    syntheticTokenAddress,
                    underlyingTokenAddress
                )
            );
        require(
            (syntheticToken.operator() == address(this)) &&
                (syntheticToken.owner() == address(this)),
            "TokenManager: Token operator and owner must be set to TokenManager before adding a token"
        );
        require(
            address(oracle.pair()) == address(pair),
            "TokenManager: Tokens and Oracle tokens are different"
        );
        TokenData memory tokenData =
            TokenData(
                syntheticToken,
                syntheticToken.decimals(),
                underlyingToken,
                underlyingToken.decimals(),
                pair,
                oracle
            );
        tokenIndex[syntheticTokenAddress] = tokenData;
        tokens.push(syntheticTokenAddress);
        emit TokenAdded(
            syntheticTokenAddress,
            underlyingTokenAddress,
            address(oracle),
            address(pair)
        );
    }

    function deleteToken(address tokenAddress, address newOperator)
        external
        onlyOperator
    {
        address[] storage newTokens;
        TokenData memory deletedData;
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] != tokenAddress) {
                newTokens.push(tokens[i]);
            } else {
                deletedData = tokenIndex[tokens[i]];
            }
        }
        delete tokenIndex[tokenAddress];
        tokens = newTokens;
        deletedData.syntheticToken.transferOperator(newOperator);
        deletedData.syntheticToken.transferOwnership(newOperator);
        emit TokenDeleted(
            tokenAddress,
            address(deletedData.underlyingToken),
            address(deletedData.oracle),
            address(deletedData.pair)
        );
    }

    function mint(
        address syntheticTokenAddress,
        address to,
        uint256 value
    ) external managedToken(syntheticTokenAddress) onlyOperator {
        SyntheticToken token = tokenIndex[syntheticTokenAddress].syntheticToken;
        token.mint(to, value);
    }

    function burn(address syntheticTokenAddress, uint256 value)
        external
        managedToken(syntheticTokenAddress)
        onlyOperator
    {
        SyntheticToken token = tokenIndex[syntheticTokenAddress].syntheticToken;
        token.burn(value);
    }

    function burnFrom(
        address syntheticTokenAddress,
        address from,
        uint256 value
    ) external managedToken(syntheticTokenAddress) onlyOperator {
        SyntheticToken token = tokenIndex[syntheticTokenAddress].syntheticToken;
        token.burnFrom(from, value);
    }

    event TokenAdded(
        address indexed syntheticTokenAddress,
        address indexed underlyingTokenAddress,
        address oracleAddress,
        address pairAddress
    );
    event TokenDeleted(
        address indexed syntheticTokenAddress,
        address indexed underlyingTokenAddress,
        address oracleAddress,
        address pairAddress
    );
}
