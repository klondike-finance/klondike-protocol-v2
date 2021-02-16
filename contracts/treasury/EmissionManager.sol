//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "@openzeppelin/contracts/math/Math.sol";
import "./TokenManager.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../access/Operatable.sol";
import "../time/Debouncable.sol";
import "../time/Timeboundable.sol";
import "../interfaces/IEmissionManager.sol";
import "../interfaces/ITokenManager.sol";
import "../interfaces/IBoardroom.sol";

/// Emission manager expands supply when the price goes up
contract EmissionManager is
    IEmissionManager,
    ReentrancyGuard,
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
    /// Pauses positive rebases
    bool public pausePositiveRebase;

    /// Create new Emission manager
    /// @param startTime Start of the operations
    /// @param period The period between positive rebases
    constructor(uint256 startTime, uint256 period)
        public
        Debouncable(period)
        Timeboundable(startTime, 0)
    {}

    // --------- Modifiers ---------

    /// Checks if contract was initialized properly and ready for use
    modifier initialized() {
        require(isInitialized(), "EmissionManager: not initialized");
        _;
    }

    // /// Checks if the synthetic token is managed by the TokenManager
    // /// @param syntheticTokenAddress The address of the synthetic token
    // modifier managedToken(address syntheticTokenAddress) {
    //     require(
    //         tokenManager.isManagedToken(syntheticTokenAddress),
    //         "EmissionManager: Token is not managed"
    //     );
    //     _;
    // }

    // --------- View ---------

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

    /// The amount for positive rebase of the synthetic token
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
        uint256 thresholdUndPerUnitSyn =
            threshold.mul(oneUnderlyingUnit).div(100);
        if (rebasePriceUndPerUnitSyn < thresholdUndPerUnitSyn) {
            return 0;
        }
        SyntheticToken syntheticToken = SyntheticToken(syntheticTokenAddress);
        uint256 supply =
            syntheticToken.totalSupply().sub(
                syntheticToken.balanceOf(address(bondManager))
            );
        return
            supply.mul(rebasePriceUndPerUnitSyn.sub(oneUnderlyingUnit)).div(
                oneUnderlyingUnit
            );
    }

    // --------- Public ---------

    /// Makes positive rebases for all eligible tokens
    function makePositiveRebase()
        public
        nonReentrant
        initialized
        debounce
        inTimeBounds
    {
        require(!pausePositiveRebase, "EmissionManager: Rebases are paused");
        address[] memory tokens = tokenManager.allTokens();
        for (uint32 i = 0; i < tokens.length; i++) {
            if (tokens[i] != address(0)) {
                _makeOnePositiveRebase(tokens[i]);
            }
        }
    }

    // --------- Owner (Timelocked) ---------

    /// Set new dev fund
    /// @param _devFund New dev fund address
    function setDevFund(address _devFund) public onlyOwner {
        devFund = _devFund;
        emit DevFundChanged(msg.sender, _devFund);
    }

    /// Set new stable fund
    /// @param _stableFund New stable fund address
    function setStableFund(address _stableFund) public onlyOwner {
        stableFund = _stableFund;
        emit StableFundChanged(msg.sender, _stableFund);
    }

    /// Set new boardroom
    /// @param _boardroom New boardroom address
    function setBoardroom(address _boardroom) public onlyOwner {
        boardroom = IBoardroom(_boardroom);
        emit BoardroomChanged(msg.sender, _boardroom);
    }

    /// Set new TokenManager
    /// @param _tokenManager New TokenManager address
    function setTokenManager(address _tokenManager) public onlyOwner {
        tokenManager = ITokenManager(_tokenManager);
        emit TokenManagerChanged(msg.sender, _tokenManager);
    }

    /// Set new BondManager
    /// @param _bondManager New BondManager address
    function setBondManager(address _bondManager) public onlyOwner {
        bondManager = IBondManager(_bondManager);
        emit BondManagerChanged(msg.sender, _bondManager);
    }

    /// Set new dev fund rate
    /// @param _devFundRate New dev fund rate
    function setDevFundRate(uint256 _devFundRate) public onlyOwner {
        devFundRate = _devFundRate;
        emit DevFundRateChanged(msg.sender, _devFundRate);
    }

    /// Set new stable fund rate
    /// @param _stableFundRate New stable fund rate
    function setStableFundRate(uint256 _stableFundRate) public onlyOwner {
        stableFundRate = _stableFundRate;
        emit StableFundRateChanged(msg.sender, _stableFundRate);
    }

    /// Set new threshold
    /// @param _threshold New threshold
    function setThreshold(uint256 _threshold) public onlyOwner {
        threshold = _threshold;
        emit ThresholdChanged(msg.sender, _threshold);
    }

    // --------- Operator (immediate) ---------

    /// Pauses / unpauses positive rebases
    /// @param pause Sets the pause / unpause
    function setPausePositiveRebase(bool pause) public onlyOperator {
        pausePositiveRebase = pause;
        emit PositiveRebasePaused(msg.sender, pause);
    }

    /// Make positive rebase for one token
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @dev The caller must ensure `managedToken` and `initialized` properties
    function _makeOnePositiveRebase(address syntheticTokenAddress) internal {
        tokenManager.updateOracle(syntheticTokenAddress);
        SyntheticToken syntheticToken = SyntheticToken(syntheticTokenAddress);
        uint256 amount = positiveRebaseAmount(syntheticTokenAddress);
        if (amount == 0) {
            return;
        }
        emit PositiveRebaseTotal(syntheticTokenAddress, amount);

        uint256 devFundAmount = amount.mul(devFundRate).div(100);
        tokenManager.mintSynthetic(
            syntheticTokenAddress,
            devFund,
            devFundAmount
        );
        emit DevFundFunded(syntheticTokenAddress, devFundAmount);
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
                address(bondManager),
                bondAmount
            );
            emit BondDistributionFunded(syntheticTokenAddress, bondAmount);
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
        emit StableFundFunded(syntheticTokenAddress, stableFundAmount);
        amount = amount.sub(stableFundAmount);

        tokenManager.mintSynthetic(
            syntheticTokenAddress,
            address(boardroom),
            amount
        );
        boardroom.notifyTransfer(syntheticTokenAddress, amount);
        emit BoardroomFunded(syntheticTokenAddress, amount);
    }

    event DevFundChanged(address indexed operator, address newFund);
    event StableFundChanged(address indexed operator, address newFund);
    event BoardroomChanged(address indexed operator, address newBoadroom);
    event TokenManagerChanged(
        address indexed operator,
        address newTokenManager
    );
    event BondManagerChanged(address indexed operator, address newBondManager);
    event PositiveRebasePaused(address indexed operator, bool pause);

    event DevFundRateChanged(address indexed operator, uint256 newRate);
    event StableFundRateChanged(address indexed operator, uint256 newRate);
    event ThresholdChanged(address indexed operator, uint256 newThreshold);
    event PositiveRebaseTotal(
        address indexed syntheticTokenAddress,
        uint256 amount
    );
    event BondDistributionFunded(
        address indexed syntheticTokenAddress,
        uint256 amount
    );
    event BoardroomFunded(
        address indexed syntheticTokenAddress,
        uint256 amount
    );
    event DevFundFunded(address indexed syntheticTokenAddress, uint256 amount);
    event StableFundFunded(
        address indexed syntheticTokenAddress,
        uint256 amount
    );
}
