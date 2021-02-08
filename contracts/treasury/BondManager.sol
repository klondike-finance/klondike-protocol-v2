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

    function bondPriceUndPerUnitSyn(address syntheticTokenAddress)
        internal
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

    function buyBond(address syntheticTokenAddress, uint256 amountOfSynthetic)
        public
        managedToken(syntheticTokenAddress)
        onePerBlock
        updateOracle(syntheticTokenAddress)
    {
        uint256 amountOfBonds =
            quoteBuyBond(syntheticTokenAddress, amountOfSynthetic);
        SyntheticToken syntheticToken =
            tokenIndex[syntheticTokenAddress].syntheticToken;
        syntheticToken.burnFrom(msg.sender, amountOfSynthetic);

        SyntheticToken bondToken = bondIndex[syntheticTokenAddress].bondToken;
        bondToken.mint(msg.sender, amountOfBonds);
    }

    function sellBond(
        address syntheticTokenAddress,
        uint256 amountIn,
        uint256 minAmountOut
    ) public managedToken(syntheticTokenAddress) onePerBlock {
        SyntheticToken syntheticToken =
            tokenIndex[syntheticTokenAddress].syntheticToken;
        SyntheticToken bondToken = bondIndex[syntheticTokenAddress].bondToken;
        uint256 amount =
            Math.min(syntheticToken.balanceOf(address(this)), amountIn);
        require(
            amount >= minAmountOut,
            "BondManager: Less than minAmountOut bonds could be sold"
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

    function _addBondToken(
        address syntheticTokenAddress,
        address bondTokenAddress
    ) internal override {
        super._addBondToken(syntheticTokenAddress, bondTokenAddress);
        SyntheticToken bondToken = SyntheticToken(bondTokenAddress);
        bondIndex[syntheticTokenAddress] = BondData(
            bondToken,
            bondToken.decimals()
        );
    }

    function _deleteBondToken(
        address syntheticTokenAddress,
        address newOperator
    ) internal override {
        super._deleteBondToken(syntheticTokenAddress, newOperator);
        delete bondIndex[syntheticTokenAddress];
    }
}
