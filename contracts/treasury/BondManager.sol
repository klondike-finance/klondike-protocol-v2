//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./TokenManager.sol";
import "./ProxyTokens.sol";
import "../access/ReentrancyGuardable.sol";

contract BondManager is ProxyTokens, ReentrancyGuardable, TokenManager {
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
        return
            avgPriceUndPerUnitSyn < curPriceUndPerUnitSyn
                ? curPriceUndPerUnitSyn
                : avgPriceUndPerUnitSyn;
    }

    function quoteBuyBond(
        address syntheticTokenAddress,
        uint256 amountOfSynthetic
    ) public view returns (uint256 amountOfBonds) {
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
        onePerBlock
    {
        uint256 amountOfBonds =
            quoteBuyBond(syntheticTokenAddress, amountOfSynthetic);
        SyntheticToken syntheticToken =
            tokenIndex[syntheticTokenAddress].syntheticToken;
        syntheticToken.burnFrom(msg.sender, amountOfSynthetic);

        SyntheticToken bondToken = bondIndex[syntheticTokenAddress].bondToken;
        bondToken.mint(msg.sender, amountOfBonds);
    }

    function sellBond(address syntheticTokenAddress, uint256 amount)
        public
        onePerBlock
    {
        withdrawInnerToken(syntheticTokenAddress, amount);
        SyntheticToken bondToken = bondIndex[syntheticTokenAddress].bondToken;
        bondToken.burnFrom(msg.sender, amount);

        SyntheticToken syntheticToken =
            tokenIndex[syntheticTokenAddress].syntheticToken;
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
        innerProxyTokens[syntheticTokenAddress] = SyntheticToken(
            syntheticTokenAddress
        );
    }

    function _deleteBondToken(
        address syntheticTokenAddress,
        address newOperator
    ) internal override {
        super._deleteBondToken(syntheticTokenAddress, newOperator);
        delete innerProxyTokens[syntheticTokenAddress];
        delete bondIndex[syntheticTokenAddress];
    }
}
