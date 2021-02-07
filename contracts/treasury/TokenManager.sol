//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

import "../libraries/UniswapLibrary.sol";
import "../interfaces/IOracle.sol";
import "../SyntheticToken.sol";
import "../access/Operatable.sol";

/// TokenManager manages all tokens and their price data
contract TokenManager is Operatable {
    struct TokenData {
        SyntheticToken syntheticToken;
        uint8 syntheticDecimals;
        ERC20 underlyingToken;
        uint8 underlyingDecimals;
        IUniswapV2Pair pair;
        IOracle oracle;
    }
    /// Token data (key is synthetic token address)
    mapping(address => TokenData) public tokenIndex;
    /// A set of managed synthetic token addresses
    address[] public tokens;
    /// Uniswap factory address
    address public immutable uniswapFactory;

    // ------- Constructor ----------

    /// Creates a new Token Manager
    /// @param _uniswapFactory The address of the Uniswap Factory
    constructor(address _uniswapFactory) public {
        uniswapFactory = _uniswapFactory;
    }

    // ------- Modifiers ----------

    /// Fails if a token is not currently managed by Token Manager
    /// @param syntheticTokenAddress The address of the synthetic token
    modifier managedToken(address syntheticTokenAddress) {
        require(
            isManagedToken(syntheticTokenAddress),
            "TokenManager: Token is not managed"
        );
        _;
    }

    // ------- View ----------

    /// Checks if the token is managed by Token Manager
    /// @param syntheticTokenAddress The address of the synthetic token
    function isManagedToken(address syntheticTokenAddress)
        public
        view
        returns (bool)
    {
        return
            address(tokenIndex[syntheticTokenAddress].syntheticToken) !=
            address(0);
    }

    /// The decimals of the synthetic token
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @dev Fails if the token is not managed
    function syntheticDecimals(address syntheticTokenAddress)
        public
        view
        managedToken(syntheticTokenAddress)
        returns (uint8)
    {
        return tokenIndex[syntheticTokenAddress].syntheticDecimals;
    }

    /// The decimals of the underlying token
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @dev Fails if the token is not managed
    function underlyingDecimals(address syntheticTokenAddress)
        public
        view
        managedToken(syntheticTokenAddress)
        returns (uint8)
    {
        return tokenIndex[syntheticTokenAddress].underlyingDecimals;
    }

    /// Average price of the synthetic token according to price oracle
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @param syntheticTokenAmount The amount to be priced
    /// @dev Fails if the token is not managed
    function averagePrice(
        address syntheticTokenAddress,
        uint256 syntheticTokenAmount
    ) public view managedToken(syntheticTokenAddress) returns (uint256) {
        IOracle oracle = tokenIndex[syntheticTokenAddress].oracle;
        return oracle.consult(syntheticTokenAddress, syntheticTokenAmount);
    }

    /// Current price of the synthetic token according to Uniswap
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @param syntheticTokenAmount The amount to be priced
    /// @dev Fails if the token is not managed
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

    /// Adds token to managed tokens
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @param underlyingTokenAddress The address of the underlying token
    /// @param oracleAddress The address of the price oracle for the pair
    /// @dev Requires the operator and the owner of the synthetic token to be set to TokenManager address before calling
    function addToken(
        address syntheticTokenAddress,
        address underlyingTokenAddress,
        address oracleAddress
    ) external onlyOperator {
        require(
            syntheticTokenAddress != underlyingTokenAddress,
            "TokenManager: Synthetic token and Underlying tokens must be different"
        );
        require(
            !isManagedToken(syntheticTokenAddress),
            "TokenManager: Token is already managed"
        );
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

    /// Removes token from managed, transfers its operator and owner to target address
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @param newOperator The operator and owner of the token will be transferred to this address.
    /// @dev Fails if the token is not managed
    function deleteToken(address syntheticTokenAddress, address newOperator)
        external
        managedToken(syntheticTokenAddress)
        onlyOperator
    {
        uint256 pos;
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == syntheticTokenAddress) {
                pos = i;
            }
        }
        TokenData memory data = tokenIndex[tokens[pos]];
        delete tokenIndex[syntheticTokenAddress];
        delete tokens[pos];
        data.syntheticToken.transferOperator(newOperator);
        data.syntheticToken.transferOwnership(newOperator);

        emit TokenDeleted(
            syntheticTokenAddress,
            address(data.underlyingToken),
            address(data.oracle),
            address(data.pair)
        );
    }

    // ------- Internal ----------

    // Uncomment when used

    // /// Mints synthetic token to the recipient address
    // /// @param syntheticTokenAddress The address of the synthetic token
    // /// @param recipient The address of recipient
    // /// @param amount The amount of tokens to mint
    // /// @dev Fails if the token is not managed
    // function _mint(
    //     address syntheticTokenAddress,
    //     address recipient,
    //     uint256 amount
    // ) internal managedToken(syntheticTokenAddress) {
    //     SyntheticToken token = tokenIndex[syntheticTokenAddress].syntheticToken;
    //     token.mint(recipient, amount);
    // }

    // /// Burns token from the caller
    // /// @param syntheticTokenAddress The address of the synthetic token
    // /// @param amount The amount of tokens to burn
    // /// @dev Fails if the token is not managed
    // function _burn(address syntheticTokenAddress, uint256 amount)
    //     internal
    //     managedToken(syntheticTokenAddress)
    // {
    //     SyntheticToken token = tokenIndex[syntheticTokenAddress].syntheticToken;
    //     token.burn(amount);
    // }

    // /// Burns token from address
    // /// @param syntheticTokenAddress The address of the synthetic token
    // /// @param from The account to burn from
    // /// @param amount The amount of tokens to burn
    // /// @dev The allowance for sender in address account must be
    // /// strictly >= amount. Otherwise the function call will fail.
    // /// Fails if the token is not managed.
    // function _burnFrom(
    //     address syntheticTokenAddress,
    //     address from,
    //     uint256 amount
    // ) internal managedToken(syntheticTokenAddress) {
    //     SyntheticToken token = tokenIndex[syntheticTokenAddress].syntheticToken;
    //     token.burnFrom(from, amount);
    // }

    /// Emitted each time the token becomes managed
    event TokenAdded(
        address indexed syntheticTokenAddress,
        address indexed underlyingTokenAddress,
        address oracleAddress,
        address pairAddress
    );
    /// Emitted each time the token becomes unmanaged
    event TokenDeleted(
        address indexed syntheticTokenAddress,
        address indexed underlyingTokenAddress,
        address oracleAddress,
        address pairAddress
    );
}
