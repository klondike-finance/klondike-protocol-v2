//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./TokenManager.sol";
import "../access/ReentrancyGuardable.sol";

contract BondManager is TokenManager, ReentrancyGuardable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /// Creates a new Bond Manager
    /// @param _uniswapFactory The address of the Uniswap Factory
    constructor(address _uniswapFactory) public TokenManager(_uniswapFactory) {}

    // ------- Public view ----------

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

        SyntheticToken bondToken = tokenIndex[syntheticTokenAddress].bondToken;
        bondToken.mint(msg.sender, amountOfBonds);
    }

    function sellBond(address syntheticTokenAddress, uint256 amountOfBonds)
        public
        onePerBlock
    {
        SyntheticToken bondToken = tokenIndex[syntheticTokenAddress].bondToken;
        bondToken.burnFrom(msg.sender, amountOfBonds);

        SyntheticToken syntheticToken =
            tokenIndex[syntheticTokenAddress].syntheticToken;
        syntheticToken.transfer(msg.sender, amountOfBonds);
    }
}
