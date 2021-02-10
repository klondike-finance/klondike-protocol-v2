//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "@openzeppelin/contracts/math/Math.sol";
import "./TokenManager.sol";
import "../access/ReentrancyGuardable.sol";
import "../access/Operatable.sol";
import "../time/Debouncable.sol";
import "../time/Timeboundable.sol";
import "../interfaces/IEmissionManager.sol";
import "../interfaces/ITokenManager.sol";
import "../interfaces/IBoardroom.sol";

/// Emission manager expands supply when the price goes up
contract EmissionManager is
    IEmissionManager,
    ReentrancyGuardable,
    Operatable,
    Debouncable,
    Timeboundable
{
    using SafeMath for uint256;

    /// Stable fund address
    address public stableFund;
    /// Development fund address
    address public devFund;
    /// Boardroom contract
    IBoardroom public boardroom;
    /// TokenManager contract
    ITokenManager public tokenManager;
    /// BondManager contract
    IBondManager public bondManager;

    /// Threshold for positive rebase
    uint256 public threshold;
    /// Development fund allocation rate (in percentage points)
    uint256 public devFundRate;
    /// Stable fund allocation rate (in percentage points)
    uint256 public stableFundRate;

    /// Create new Emission manager
    /// @param startTime Start of the operations
    /// @param period The period between positive rebases
    constructor(uint256 startTime, uint256 period)
        public
        Debouncable(period)
        Timeboundable(startTime, 0)
    {}

    /// Checks if contract was initialized properly and ready for use
    modifier initialized() {
        require(
            isInitialized(),
            "EmissionManager: TokenManager is not initialized"
        );
        _;
    }

    /// Checks if the synthetic token is managed by the TokenManager
    /// @param syntheticTokenAddress The address of the synthetic token
    modifier managedToken(address syntheticTokenAddress) {
        require(
            tokenManager.isManagedToken(syntheticTokenAddress),
            "EmissionManager: Token is not managed"
        );
        _;
    }

    /// Checks if contract was initialized properly and ready for use
    function isInitialized() public view returns (bool) {
        return
            (address(tokenManager) != address(0)) &&
            (address(bondManager) != address(0)) &&
            (address(stableFund) != address(0)) &&
            (address(devFund) != address(0)) &&
            (address(boardroom) != address(0)) &&
            (stableFundRate > 0) &&
            (devFundRate > 0) &&
            (threshold > 100);
    }

    /// The amount for positive rebase of the syntheric token
    /// @param syntheticTokenAddress The address of the synthetic token
    function positiveRebaseAmount(address syntheticTokenAddress)
        public
        view
        initialized
        returns (uint256)
    {
        uint256 oneSyntheticUnit =
            tokenManager.oneSyntheticUnit(syntheticTokenAddress);
        uint256 oneUnderlyingUnit =
            tokenManager.oneUnderlyingUnit(syntheticTokenAddress);

        uint256 rebasePriceUndPerUnitSyn =
            tokenManager.averagePrice(syntheticTokenAddress, oneSyntheticUnit);
        uint256 thresholdUndPerUnitSyn = threshold.mul(oneUnderlyingUnit);
        if (rebasePriceUndPerUnitSyn < thresholdUndPerUnitSyn) {
            return 0;
        }
        SyntheticToken syntheticToken = SyntheticToken(syntheticTokenAddress);
        uint256 supply =
            syntheticToken.totalSupply().sub(
                syntheticToken.balanceOf(address(this))
            );
        return
            supply.mul(rebasePriceUndPerUnitSyn.sub(oneUnderlyingUnit)).div(
                oneUnderlyingUnit
            );
    }

    /// Makes positive rebases for all eligible tokens
    function makePositiveRebase()
        public
        onePerBlock
        initialized
        debounce
        inTimeBounds
    {
        address[] memory tokens = tokenManager.allTokens();
        for (uint32 i = 0; i < tokens.length; i++) {
            makeOnePositiveRebase(tokens[i]);
        }
    }

    /// Make positive rebase for one token
    /// @param syntheticTokenAddress The address of the synthetic token
    function makeOnePositiveRebase(address syntheticTokenAddress)
        internal
        initialized
        managedToken(syntheticTokenAddress)
    {
        tokenManager.updateOracle(syntheticTokenAddress);
        SyntheticToken syntheticToken = SyntheticToken(syntheticTokenAddress);
        uint256 amount = positiveRebaseAmount(syntheticTokenAddress);
        if (amount == 0) {
            return;
        }

        uint256 devFundAmount = amount.mul(devFundRate).div(100);
        tokenManager.mintSynthetic(
            syntheticTokenAddress,
            devFund,
            devFundAmount
        );
        emit DevFundFunded(devFundAmount);
        amount = amount.sub(devFundAmount);

        SyntheticToken bondToken =
            SyntheticToken(bondManager.bondIndex(syntheticTokenAddress));
        uint256 bondSupply = bondToken.totalSupply();
        uint256 bondPoolBalance = syntheticToken.balanceOf(address(this));
        uint256 bondShortage =
            Math.max(bondSupply, bondPoolBalance).sub(bondPoolBalance);
        uint256 bondAmount = Math.min(amount, bondShortage);
        if (bondAmount > 0) {
            tokenManager.mintSynthetic(
                syntheticTokenAddress,
                address(this),
                bondAmount
            );
            emit BondDistributionFunded(bondAmount);
        }
        amount = amount.sub(bondAmount);
        if (amount == 0) {
            return;
        }

        uint256 stableFundAmount = amount.mul(stableFundRate).div(100);
        tokenManager.mintSynthetic(
            syntheticTokenAddress,
            stableFund,
            stableFundAmount
        );
        emit StableFundFunded(stableFundAmount);
        amount = amount.sub(stableFundAmount);

        tokenManager.mintSynthetic(
            syntheticTokenAddress,
            address(boardroom),
            amount
        );
        boardroom.notifyTransfer(syntheticTokenAddress, amount);
        emit BoardroomFunded(stableFundAmount);
    }

    /// Set new dev fund
    /// @param _devFund New dev fund address
    function setDevFund(address _devFund) public onlyOperator {
        devFund = _devFund;
        emit DevFundChanged(operator, _devFund);
    }

    /// Set new stable fund
    /// @param _stableFund New stable fund address
    function setStableFund(address _stableFund) public onlyOperator {
        stableFund = _stableFund;
        emit StableFundChanged(operator, _stableFund);
    }

    /// Set new boardroom
    /// @param _boardroom New boardroom address
    function setBoardroom(address _boardroom) public onlyOperator {
        boardroom = IBoardroom(_boardroom);
        emit BoardroomChanged(operator, _boardroom);
    }

    /// Set new TokenManager
    /// @param _tokenManager New TokenManager address
    function setTokenManager(address _tokenManager) public onlyOperator {
        tokenManager = ITokenManager(_tokenManager);
        emit TokenManagerChanged(operator, _tokenManager);
    }

    /// Set new BondManager
    /// @param _bondManager New BondManager address
    function setBondManager(address _bondManager) public onlyOperator {
        bondManager = IBondManager(_bondManager);
        emit BondManagerChanged(operator, _bondManager);
    }

    /// Set new dev fund rate
    /// @param _devFundRate New dev fund rate
    function setDevFundRate(uint256 _devFundRate) public onlyOperator {
        devFundRate = _devFundRate;
        emit DevFundRateChanged(operator, _devFundRate);
    }

    /// Set new stable fund rate
    /// @param _stableFundRate New stable fund rate
    function setStableFundRate(uint256 _stableFundRate) public onlyOperator {
        stableFundRate = _stableFundRate;
        emit StableFundRateChanged(operator, _stableFundRate);
    }

    /// Set new threshold
    /// @param _threshold New threshold
    function setThreshold(uint256 _threshold) public onlyOperator {
        threshold = _threshold;
        emit ThresholdChanged(operator, _threshold);
    }

    event DevFundChanged(address indexed operator, address newFund);
    event StableFundChanged(address indexed operator, address newFund);
    event BoardroomChanged(address indexed operator, address newBoadroom);
    event TokenManagerChanged(
        address indexed operator,
        address newTokenManager
    );
    event BondManagerChanged(address indexed operator, address newBondManager);

    event DevFundRateChanged(address indexed operator, uint256 newRate);
    event StableFundRateChanged(address indexed operator, uint256 newRate);
    event ThresholdChanged(address indexed operator, uint256 newThreshold);
    event BondDistributionFunded(uint256 amount);
    event BoardroomFunded(uint256 amount);
    event DevFundFunded(uint256 amount);
    event StableFundFunded(uint256 amount);
}
