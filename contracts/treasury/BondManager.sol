//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "./TokenManager.sol";
import "../access/ReentrancyGuardable.sol";

contract BondManager is ReentrancyGuardable, TokenManager {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    struct BondData {
        SyntheticToken bondToken;
        uint8 bondDecimals;
    }

    /// Bond data (key is synthetic token address)
    mapping(address => BondData) public bondIndex;

    /// Creates a new Bond Manager
    /// @param _uniswapFactory The address of the Uniswap Factory
    constructor(address _uniswapFactory) public TokenManager(_uniswapFactory) {}

    // ------- Public view ----------

    /// The decimals of the bond token
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @return The number of decimals for the bond token
    /// @dev Fails if the token is not managed
    function bondDecimals(address syntheticTokenAddress)
        public
        view
        managedToken(syntheticTokenAddress)
        returns (uint8)
    {
        return bondIndex[syntheticTokenAddress].bondDecimals;
    }

    /// This is the price of synthetic in underlying (und / syn)
    /// but corrected for bond mechanics, i.e. max of oracle / current uniswap price
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @return The price of one unit (e.g. BTC, ETH, etc.) syn token in underlying token (e.g. sat, wei, etc)
    /// @dev Fails if the token is not managed
    function bondPriceUndPerUnitSyn(address syntheticTokenAddress)
        public
        view
        managedToken(syntheticTokenAddress)
        returns (uint256)
    {
        uint256 avgPriceUndPerUnitSyn =
            averagePrice(
                syntheticTokenAddress,
                _oneSyntheticUnit(syntheticTokenAddress)
            );
        uint256 curPriceUndPerUnitSyn =
            currentPrice(
                syntheticTokenAddress,
                _oneSyntheticUnit(syntheticTokenAddress)
            );
        return Math.max(avgPriceUndPerUnitSyn, curPriceUndPerUnitSyn);
    }

    /// How many bonds you can buy with this amount of synthetic
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @param amountOfSynthetic Amount of synthetic to sell
    /// @return amountOfBonds The number of bonds that could be bought
    /// @dev Use the returned value as the input for minAmountBondsOut in `buyBonds`
    function quoteBuyBond(
        address syntheticTokenAddress,
        uint256 amountOfSynthetic
    )
        public
        view
        managedToken(syntheticTokenAddress)
        returns (uint256 amountOfBonds)
    {
        uint256 bondPrice = bondPriceUndPerUnitSyn(syntheticTokenAddress);
        require(
            bondPrice < _oneUnderlyingUnit(syntheticTokenAddress),
            "BondManager: Synthetic price is not eligible for bond emission"
        );
        amountOfBonds = amountOfSynthetic
            .mul(_oneUnderlyingUnit(syntheticTokenAddress))
            .div(bondPrice);
    }

    // ------- Public ----------

    /// Buy bonds with synthetic
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @param amountOfSyntheticIn Amount of synthetic to sell
    /// @param minAmountBondsOut Minimum amount of bonds out
    /// @dev Fails if the token is not managed
    function buyBond(
        address syntheticTokenAddress,
        uint256 amountOfSyntheticIn,
        uint256 minAmountBondsOut
    )
        public
        managedToken(syntheticTokenAddress)
        onePerBlock
        updateOracle(syntheticTokenAddress)
    {
        uint256 amountOfBonds =
            quoteBuyBond(syntheticTokenAddress, amountOfSyntheticIn);
        require(
            amountOfBonds >= minAmountBondsOut,
            "BondManager: number of bonds is less than minAmountBondsOut"
        );
        SyntheticToken syntheticToken =
            tokenIndex[syntheticTokenAddress].syntheticToken;
        syntheticToken.burnFrom(msg.sender, amountOfSyntheticIn);

        SyntheticToken bondToken = bondIndex[syntheticTokenAddress].bondToken;
        bondToken.mint(msg.sender, amountOfBonds);
    }

    /// Sell bonds for synthetic 1-to-1
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @param amountOfBondsIn Amount of bonds to sell
    /// @param minAmountOfSyntheticOut Minimum amount of synthetics out
    /// @dev Fails if the token is not managed. Could be paritally executed
    /// or not executed at all if the BondManager balance of synthetic is less
    /// than amountOfSyntheticIn. The balance of synthetic is increased during positive rebases.
    function sellBond(
        address syntheticTokenAddress,
        uint256 amountOfBondsIn,
        uint256 minAmountOfSyntheticOut
    ) public managedToken(syntheticTokenAddress) onePerBlock {
        SyntheticToken syntheticToken =
            tokenIndex[syntheticTokenAddress].syntheticToken;
        SyntheticToken bondToken = bondIndex[syntheticTokenAddress].bondToken;
        uint256 amount =
            Math.min(syntheticToken.balanceOf(address(this)), amountOfBondsIn);
        require(
            amount >= minAmountOfSyntheticOut,
            "BondManager: Less than minAmountOfSyntheticOut bonds could be sold"
        );
        require(amount > 0, "BondManager: Only zero bonds could be sold now");
        bondToken.burnFrom(msg.sender, amount);
        syntheticToken.transfer(msg.sender, amount);
    }

    // ------- Internal ----------

    /// Get one bond unit
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @return one unit of the bond asset
    function _oneBondUnit(address syntheticTokenAddress)
        internal
        view
        managedToken(syntheticTokenAddress)
        returns (uint256)
    {
        return uint256(10)**bondDecimals(syntheticTokenAddress);
    }

    /// Triggered what addToken is called in TokenManager
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @param bondTokenAddress The address of the bond token
    function _addBondToken(
        address syntheticTokenAddress,
        address bondTokenAddress
    ) internal virtual override {
        super._addBondToken(syntheticTokenAddress, bondTokenAddress);
        SyntheticToken bondToken = SyntheticToken(bondTokenAddress);
        require(
            (bondToken.operator() == address(this)) &&
                (bondToken.owner() == address(this)),
            "BondManager: Token operator and owner of the bond token must be set to TokenManager before adding a token"
        );
        bondIndex[syntheticTokenAddress] = BondData(
            bondToken,
            bondToken.decimals()
        );
        emit BondAdded(bondTokenAddress);
    }

    /// Triggered what deleteToken is called in TokenManager
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @param newOperator New operator for the bond token
    function _deleteBondToken(
        address syntheticTokenAddress,
        address newOperator
    ) internal virtual override {
        super._deleteBondToken(syntheticTokenAddress, newOperator);
        SyntheticToken bondToken = bondIndex[syntheticTokenAddress].bondToken;
        bondToken.transferOperator(newOperator);
        bondToken.transferOwnership(newOperator);
        delete bondIndex[syntheticTokenAddress];
        emit BondDeleted(address(bondToken), newOperator);
    }

    /// Emitted each time the token becomes managed
    event BondAdded(address indexed bondTokenAddress);
    /// Emitted each time the token becomes unmanaged
    event BondDeleted(address indexed bondAddress, address indexed newOperator);
}
