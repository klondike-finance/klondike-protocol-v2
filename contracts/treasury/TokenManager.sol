//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

import "../libraries/UniswapLibrary.sol";
import "../interfaces/IOracle.sol";
import "../interfaces/ITokenManager.sol";
import "../interfaces/IBondManager.sol";
import "../interfaces/IEmissionManager.sol";
import "../SyntheticToken.sol";
import "../access/Operatable.sol";

/// TokenManager manages all tokens and their price data
contract TokenManager is ITokenManager, Operatable {
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

    IBondManager public bondManager;
    IEmissionManager public emissionManager;

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

    modifier initialized() {
        require(
            address(bondManager) != address(0),
            "TokenManager: BondManager is not initialized"
        );
        require(
            address(emissionManager) != address(0),
            "TokenManager: EmissionManager is not initialized"
        );
        _;
    }

    // ------- View ----------

    /// Checks if the token is managed by Token Manager
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @return True if token is managed
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
    /// @return The number of decimals for the synthetic token
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
    /// @return The number of decimals for the underlying token
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
    /// @return The equivalent amount of the underlying token required to buy syntheticTokenAmount (average)
    /// @dev Fails if the token is not managed
    function averagePrice(
        address syntheticTokenAddress,
        uint256 syntheticTokenAmount
    )
        public
        view
        override
        managedToken(syntheticTokenAddress)
        returns (uint256)
    {
        IOracle oracle = tokenIndex[syntheticTokenAddress].oracle;
        return oracle.consult(syntheticTokenAddress, syntheticTokenAmount);
    }

    /// Current price of the synthetic token according to Uniswap
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @param syntheticTokenAmount The amount to be priced
    /// @return The equivalent amount of the underlying token required to buy syntheticTokenAmount
    /// @dev Fails if the token is not managed
    function currentPrice(
        address syntheticTokenAddress,
        uint256 syntheticTokenAmount
    )
        public
        view
        override
        managedToken(syntheticTokenAddress)
        returns (uint256)
    {
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

    /// Get one synthetic unit
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @return one unit of the synthetic asset
    function oneSyntheticUnit(address syntheticTokenAddress)
        public
        view
        override
        managedToken(syntheticTokenAddress)
        returns (uint256)
    {
        return uint256(10)**syntheticDecimals(syntheticTokenAddress);
    }

    /// Get one underlying unit
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @return one unit of the underlying asset
    function oneUnderlyingUnit(address syntheticTokenAddress)
        public
        view
        override
        managedToken(syntheticTokenAddress)
        returns (uint256)
    {
        return uint256(10)**underlyingDecimals(syntheticTokenAddress);
    }

    // ------- External --------------------

    /// Update oracle price
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @dev This modifier must always come with managedToken and oncePerBlock
    function updateOracle(address syntheticTokenAddress)
        public
        override
        managedToken(syntheticTokenAddress)
    {
        IOracle oracle = tokenIndex[syntheticTokenAddress].oracle;
        oracle.update();
    }

    // ------- External, Operator ----------

    /// Adds token to managed tokens
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @param bondTokenAddress The address of the bond token
    /// @param underlyingTokenAddress The address of the underlying token
    /// @param oracleAddress The address of the price oracle for the pair
    /// @dev Requires the operator and the owner of the synthetic token to be set to TokenManager address before calling
    function addToken(
        address syntheticTokenAddress,
        address bondTokenAddress,
        address underlyingTokenAddress,
        address oracleAddress
    ) external onlyOperator initialized {
        require(
            syntheticTokenAddress != underlyingTokenAddress,
            "TokenManager: Synthetic token and Underlying tokens must be different"
        );
        require(
            !isManagedToken(syntheticTokenAddress),
            "TokenManager: Token is already managed"
        );
        SyntheticToken syntheticToken = SyntheticToken(syntheticTokenAddress);
        SyntheticToken bondToken = SyntheticToken(bondTokenAddress);
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
            syntheticToken.decimals() == bondToken.decimals(),
            "TokenManager: Synthetic and Bond tokens must have the same number of decimals"
        );
        require(
            (syntheticToken.operator() == address(this)) &&
                (syntheticToken.owner() == address(this)),
            "TokenManager: Token operator and owner of the synthetic token must be set to TokenManager before adding a token"
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
        bondManager.addBondToken(syntheticTokenAddress, bondTokenAddress);
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
        initialized
    {
        bondManager.deleteBondToken(syntheticTokenAddress, newOperator);
        uint256 pos;
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == syntheticTokenAddress) {
                pos = i;
            }
        }
        TokenData memory data = tokenIndex[tokens[pos]];
        data.syntheticToken.transfer(
            newOperator,
            data.syntheticToken.balanceOf(address(this))
        );
        data.syntheticToken.transferOperator(newOperator);
        data.syntheticToken.transferOwnership(newOperator);
        delete tokenIndex[syntheticTokenAddress];
        delete tokens[pos];
        emit TokenDeleted(
            syntheticTokenAddress,
            address(data.underlyingToken),
            address(data.oracle),
            address(data.pair)
        );
    }

    /// Burns synthetic token from the owner
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @param owner Owner of the tokens to burn
    /// @param amount Amount to burn
    function burnSyntheticFrom(
        address syntheticTokenAddress,
        address owner,
        uint256 amount
    )
        public
        override
        onlyOperator
        managedToken(syntheticTokenAddress)
        initialized
    {
        SyntheticToken token = tokenIndex[syntheticTokenAddress].syntheticToken;
        token.burnFrom(owner, amount);
    }

    /// Updates bond manager address
    /// @param _bondManager new bond manager
    function setBondManager(address _bondManager) public onlyOperator {
        bondManager = IBondManager(_bondManager);
    }

    /// Updates emission manager address
    /// @param _emissionManager new emission manager
    function setEmissionManager(address _emissionManager) public onlyOperator {
        emissionManager = IEmissionManager(_emissionManager);
    }

    /// Updates oracle for synthetic token address
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @param oracleAddress new oracle address
    function setOracle(address syntheticTokenAddress, address oracleAddress)
        public
        onlyOperator
        managedToken(syntheticTokenAddress)
    {
        IOracle oracle = IOracle(oracleAddress);
        require(
            oracle.pair() == tokenIndex[syntheticTokenAddress].pair,
            "TokenManager: Tokens and Oracle tokens are different"
        );
        tokenIndex[syntheticTokenAddress].oracle = oracle;
    }

    // ------- Events ----------

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
