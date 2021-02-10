//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

// Todo initialized + bond events + migration + starttime

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "./TokenManager.sol";
import "../time/Timeboundable.sol";
import "../access/ReentrancyGuardable.sol";
import "../interfaces/IBondManager.sol";
import "../interfaces/ITokenManager.sol";

contract BondManager is
    IBondManager,
    ReentrancyGuardable,
    Operatable,
    Timeboundable
{
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /// Bond data (key is synthetic token address, value is bond address)
    mapping(address => address) public override bondIndex;

    /// Pauses buying bonds
    bool public pauseBuyBonds = false;

    /// TokenManager reference
    ITokenManager public tokenManager;

    /// Creates a new Bond Manager
    constructor(uint256 startTime) public Timeboundable(startTime, 0) {}

    // ------- Modifiers ------------

    /// Fails if a token is not currently managed by Token Manager
    /// @param syntheticTokenAddress The address of the synthetic token
    modifier managedToken(address syntheticTokenAddress) {
        require(
            isManagedToken(syntheticTokenAddress),
            "TokenManager: Token is not managed"
        );
        _;
    }

    // ------- Public view ----------

    function isManagedToken(address syntheticTokenAddress)
        public
        view
        returns (bool)
    {
        return bondIndex[syntheticTokenAddress] != address(0);
    }

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
        return SyntheticToken(bondIndex[syntheticTokenAddress]).decimals();
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
            tokenManager.averagePrice(
                syntheticTokenAddress,
                tokenManager.oneSyntheticUnit(syntheticTokenAddress)
            );
        uint256 curPriceUndPerUnitSyn =
            tokenManager.currentPrice(
                syntheticTokenAddress,
                tokenManager.oneSyntheticUnit(syntheticTokenAddress)
            );
        return Math.max(avgPriceUndPerUnitSyn, curPriceUndPerUnitSyn);
    }

    /// How many bonds you can buy with this amount of synthetic
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @param amountOfSynthetic Amount of synthetic to sell
    /// @return amountOfBonds The number of bonds that could be bought
    /// @dev Use the returned value as the input for minAmountBondsOut in `buyBonds`
    function quoteBonds(
        address syntheticTokenAddress,
        uint256 amountOfSynthetic
    )
        public
        view
        managedToken(syntheticTokenAddress)
        returns (uint256 amountOfBonds)
    {
        uint256 underlyingUnit =
            tokenManager.oneUnderlyingUnit(syntheticTokenAddress);
        uint256 bondPrice = bondPriceUndPerUnitSyn(syntheticTokenAddress);
        require(
            bondPrice < underlyingUnit,
            "BondManager: Synthetic price is not eligible for bond emission"
        );
        amountOfBonds = amountOfSynthetic.mul(underlyingUnit).div(bondPrice);
    }

    // ------- Public ----------

    /// Buy bonds with synthetic
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @param amountOfSyntheticIn Amount of synthetic to sell
    /// @param minAmountBondsOut Minimum amount of bonds out
    /// @dev Fails if the token is not managed
    function buyBonds(
        address syntheticTokenAddress,
        uint256 amountOfSyntheticIn,
        uint256 minAmountBondsOut
    ) public onePerBlock managedToken(syntheticTokenAddress) inTimeBounds {
        tokenManager.updateOracle(syntheticTokenAddress);
        require(
            !pauseBuyBonds,
            "BondManager: Buying bonds is temporarily suspended"
        );
        uint256 amountOfBonds =
            quoteBonds(syntheticTokenAddress, amountOfSyntheticIn);
        require(
            amountOfBonds >= minAmountBondsOut,
            "BondManager: number of bonds is less than minAmountBondsOut"
        );
        tokenManager.burnSyntheticFrom(
            syntheticTokenAddress,
            msg.sender,
            amountOfSyntheticIn
        );

        SyntheticToken bondToken =
            SyntheticToken(bondIndex[syntheticTokenAddress]);
        bondToken.mint(msg.sender, amountOfBonds);
    }

    /// Sell bonds for synthetic 1-to-1
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @param amountOfBondsIn Amount of bonds to sell
    /// @param minAmountOfSyntheticOut Minimum amount of synthetics out
    /// @dev Fails if the token is not managed. Could be paritally executed
    /// or not executed at all if the BondManager balance of synthetic is less
    /// than amountOfSyntheticIn. The balance of synthetic is increased during positive rebases.
    /// Use minAmountOfSyntheticOut to regulate partial fulfillments.
    function sellBonds(
        address syntheticTokenAddress,
        uint256 amountOfBondsIn,
        uint256 minAmountOfSyntheticOut
    ) public managedToken(syntheticTokenAddress) onePerBlock inTimeBounds {
        SyntheticToken syntheticToken = SyntheticToken(syntheticTokenAddress); // trusted address since this is a managedToken
        SyntheticToken bondToken =
            SyntheticToken(bondIndex[syntheticTokenAddress]);
        uint256 amount =
            Math.min(syntheticToken.balanceOf(address(this)), amountOfBondsIn);
        require(
            amount >= minAmountOfSyntheticOut,
            "BondManager: Less than minAmountOfSyntheticOut bonds could be sold"
        );
        bondToken.burnFrom(msg.sender, amount);
        syntheticToken.transfer(msg.sender, amount);
    }

    // ------- Public, Operator ----------

    /// Sets the pause to buying bonds
    /// @param pause True if bonds buying should be stopped.
    function setPauseBuyBonds(bool pause) public onlyOperator {
        pauseBuyBonds = pause;
    }

    /// Sets the TokenManager
    /// @param _tokenManager The address of the new TokenManager
    function setTokenManager(address _tokenManager) public onlyOperator {
        tokenManager = ITokenManager(_tokenManager);
    }

    // ------- Internal ----------

    /// Called when new token is added in TokenManager
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @param bondTokenAddress The address of the bond token
    function addBondToken(
        address syntheticTokenAddress,
        address bondTokenAddress
    ) public override {
        require(
            msg.sender == address(tokenManager),
            "BondManager: Only TokenManager can call this function"
        );
        SyntheticToken bondToken = SyntheticToken(bondTokenAddress);
        require(
            (bondToken.operator() == address(this)) &&
                (bondToken.owner() == address(this)),
            "BondManager: Token operator and owner of the bond token must be set to TokenManager before adding a token"
        );
        bondIndex[syntheticTokenAddress] = address(bondToken);
        emit BondAdded(bondTokenAddress);
    }

    /// Called when token is deleted in TokenManager
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @param newOperator New operator for the bond token
    function deleteBondToken(address syntheticTokenAddress, address newOperator)
        public
        override
    {
        require(
            msg.sender == address(tokenManager),
            "BondManager: Only TokenManager can call this function"
        );
        SyntheticToken syntheticToken = SyntheticToken(syntheticTokenAddress);
        syntheticToken.transfer(
            newOperator,
            syntheticToken.balanceOf(address(this))
        );
        SyntheticToken bondToken =
            SyntheticToken(bondIndex[syntheticTokenAddress]);
        bondToken.transferOperator(newOperator);
        bondToken.transferOwnership(newOperator);
        delete bondIndex[syntheticTokenAddress];
        assert(!isManagedToken(syntheticTokenAddress));
        emit BondDeleted(address(bondToken), newOperator);
    }

    // event RedeemedBonds(address indexed from, uint256 amount);
    // event BoughtBonds(address indexed from, uint256 amount);

    /// Emitted each time the token becomes managed
    event BondAdded(address indexed bondTokenAddress);
    /// Emitted each time the token becomes unmanaged
    event BondDeleted(address indexed bondAddress, address indexed newOperator);
}
