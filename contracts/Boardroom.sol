//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./time/Timeboundable.sol";
import "./LockPool.sol";
import "./SyntheticToken.sol";
import "./interfaces/ITokenManager.sol";
import "./interfaces/IBoardroom.sol";

/// Boardroom distributes token emission among shareholders
contract Boardroom is IBoardroom, ReentrancyGuard, Timeboundable, Operatable {
    using SafeMath for uint256;

    /// Added each time reward to the Boardroom is added
    struct PoolRewardSnapshot {
        /// when snapshost was made
        uint256 timestamp;
        /// how much reward was added at this snapshot
        uint256 addedSyntheticReward;
        /// accumulated reward per share unit (10^18 of reward token)
        uint256 accruedRewardPerShareUnit;
    }

    /// Accumulated personal rewards available for claiming
    struct PersonRewardAccrual {
        /// Last accrual time represented by snapshotId
        uint256 lastAccrualSnaphotId;
        /// Accrued and ready for distribution reward
        uint256 accruedReward;
    }

    /// A set of PoolRewardSnapshots for every synthetic token
    mapping(address => PoolRewardSnapshot[]) public poolRewardSnapshots;
    /// A set of records of personal accumulated income.
    /// The first key is token, the second is holder address.
    mapping(address => mapping(address => PersonRewardAccrual))
        public personRewardAccruals;

    /// Reward token formula param
    uint256 public immutable boostFactor;
    /// Reward token formula param
    uint256 public immutable boostDenominator;
    /// Decimals for base, boost and rewards tokens;
    uint256 public immutable decimals;
    /// Pause
    bool pause;

    /// Base token. Both base and boost token yield reward token which ultimately participates in rewards distribution.
    SyntheticToken public base;
    /// Boost token
    SyntheticToken public boost;
    /// TokenManager ref
    ITokenManager public tokenManager;
    /// EmissionManager ref
    address public emissionManager;
    /// LockPool (assume all tokens in LockPool are also locked in the Boardroom)
    LockPool public lockPool;

    /// Proxy for reward token supply
    uint256 public rewardTokenSupply;
    /// Proxy for reward token balances
    mapping(address => uint256) public rewardTokenBalances;
    /// Proxy for base token supply
    uint256 public baseTokenSupply;
    /// Proxy for base token balances
    mapping(address => uint256) public baseTokenBalances;
    /// Proxy for boost token supply
    uint256 public boostTokenSupply;
    /// Proxy for boost token balances
    mapping(address => uint256) public boostTokenBalances;

    /// Creates new Boardroom
    /// @param _base address of the base token
    /// @param _boost address of the boost token
    /// @param _tokenManager address of the TokenManager
    /// @param _emissionManager address of the EmissionManager
    /// @param _lockPool address of the LockPool
    /// @param _boostFactor boost formula param
    /// @param _boostDenominator boost formula param
    /// @param _start start of the pool date
    constructor(
        address _base,
        address _boost,
        address _tokenManager,
        address _emissionManager,
        address _lockPool,
        uint256 _boostFactor,
        uint256 _boostDenominator,
        uint256 _start
    ) public Timeboundable(_start, 0) {
        base = SyntheticToken(_base);
        boost = SyntheticToken(_boost);
        require(
            base.decimals() == boost.decimals(),
            "Boardroom: Base and Boost decimals must be equal"
        );
        decimals = base.decimals();
        tokenManager = ITokenManager(_tokenManager);
        emissionManager = _emissionManager;
        lockPool = LockPool(_lockPool);
        boostFactor = _boostFactor;
        boostDenominator = _boostDenominator;
        address[] memory syntheticTokens = tokenManager.allTokens();
        for (uint256 i = 0; i < syntheticTokens.length; i++) {
            address token = syntheticTokens[i];
            poolRewardSnapshots[token].push(
                PoolRewardSnapshot({
                    timestamp: block.timestamp,
                    addedSyntheticReward: 0,
                    accruedRewardPerShareUnit: 0
                })
            );
        }
    }

    // ------- Modifiers ----------

    /// Checks if pause is set
    modifier unpaused() {
        require(!pause, "Boardroom operations are paused");
        _;
    }

    // ------- Public ----------

    /// Get reward token balance for a user
    function rewardsTokenBalance(address owner) public view returns (uint256) {
        uint256 baseBalanceBoardroom = baseTokenBalances[owner];
        uint256 baseLockedBalance = lockPool.balanceOf(owner);
        uint256 baseBalance = baseBalanceBoardroom.add(baseLockedBalance);
        uint256 boostBalance = boostTokenBalances[owner];
        return
            baseBalance.add(
                boostFactor.mul(
                    Math.min(baseBalance, boostBalance.div(boostDenominator))
                )
            );
    }

    /// Stake tokens into Boardroom
    /// @param baseAmount amount of base token
    /// @param boostAmount amount of boost token
    /// @dev One of amounts should be > 0
    function stake(uint256 baseAmount, uint256 boostAmount)
        public
        nonReentrant
        inTimeBounds
        unpaused
    {
        require(
            (baseAmount > 0) || (boostAmount > 0),
            "Boardroom: one amount should be > 0"
        );
        updateAccruals();
        if (baseAmount > 0) {
            _stakeBase(msg.sender, baseAmount);
        }
        if (boostAmount > 0) {
            _stakeBoost(msg.sender, boostAmount);
        }
        _updateRewardTokenBalance(msg.sender);
    }

    /// Withdraw tokens from Boardroom
    /// @param baseAmount amount of base token
    /// @param boostAmount amount of boost token
    /// @dev One of amounts should be > 0
    function withdraw(uint256 baseAmount, uint256 boostAmount)
        public
        nonReentrant
    {
        require(
            (baseAmount > 0) || (boostAmount > 0),
            "Boardroom: one amount should be > 0"
        );
        updateAccruals();
        if (baseAmount > 0) {
            _withdrawBase(msg.sender, baseAmount);
        }
        if (boostAmount > 0) {
            _withdrawBoost(msg.sender, boostAmount);
        }
        _updateRewardTokenBalance(msg.sender);
    }

    /// Update accrued rewards for all tokens of sender
    function updateAccruals() public unpaused {
        address[] memory tokens = tokenManager.allTokens();
        for (uint256 i = 0; i < tokens.length; i++) {
            _updateAccrual(tokens[i], msg.sender);
        }
    }

    /// Transfer all rewards to sender
    function claimRewards() public nonReentrant unpaused {
        address[] memory tokens = tokenManager.allTokens();
        for (uint256 i = 0; i < tokens.length; i++) {
            _claimReward(tokens[i]);
        }
    }

    // ------- Public, EmissionManager ----------

    /// Notify Boardroom about new incoming reward for token
    /// @param token Rewards denominated in this token
    /// @param amount The amount of rewards
    function notifyTransfer(address token, uint256 amount) external override {
        require(
            msg.sender == address(emissionManager),
            "Boardroom: can only be called by EmissionManager"
        );
        require(
            rewardTokenSupply > 0,
            "Boardroom: Cannot receive incoming reward when token balance is 0"
        );
        PoolRewardSnapshot[] storage tokenSnapshots =
            poolRewardSnapshots[token];
        PoolRewardSnapshot storage lastSnapshot =
            tokenSnapshots[tokenSnapshots.length - 1];
        uint256 deltaRPSU = amount.mul(10**decimals).div(rewardTokenSupply);
        tokenSnapshots.push(
            PoolRewardSnapshot({
                timestamp: block.timestamp,
                addedSyntheticReward: amount,
                accruedRewardPerShareUnit: lastSnapshot
                    .accruedRewardPerShareUnit
                    .add(deltaRPSU)
            })
        );
        emit IncomingBoardroomReward(token, msg.sender, amount);
    }

    // ------- Public, LockManager ----------

    /// Updates reward token balance of the owner after locking tokens
    /// @param owner address of the owner
    function updateRewardsAfterLock(address owner) public override {
        require(
            msg.sender == address(lockPool),
            "Boardroom: can only be called by LockPool"
        );
        _updateRewardTokenBalance(owner);
    }

    // ------- Public, Owner (timelock) ----------

    /// Updates LockPool
    /// @param _lockPool new LockPool
    function setLockPool(address _lockPool) public onlyOwner {
        lockPool = LockPool(_lockPool);
        emit UpdatedLockPool(msg.sender, _lockPool);
    }

    /// Updates Base
    /// @param _base new Base
    function setBase(address _base) public onlyOwner {
        base = SyntheticToken(_base);
        emit UpdatedBase(msg.sender, _base);
    }

    /// Updates Boost
    /// @param _boost new Boost
    function setBoost(address _boost) public onlyOwner {
        boost = SyntheticToken(_boost);
        emit UpdatedBoost(msg.sender, _boost);
    }

    /// Updates TokenManager
    /// @param _tokenManager new TokenManager
    function setTokenManager(address _tokenManager) public onlyOwner {
        tokenManager = ITokenManager(_tokenManager);
        emit UpdatedTokenManager(msg.sender, _tokenManager);
    }

    /// Updates EmissionManager
    /// @param _emissionManager new EmissionManager
    function setEmissionManager(address _emissionManager) public onlyOwner {
        emissionManager = _emissionManager;
        emit UpdatedEmissionManager(msg.sender, _emissionManager);
    }

    // ------- Public, Operator (multisig) ----------

    /// Set pause
    /// @param _pause pause value
    function setPause(bool _pause) public onlyOperator {
        pause = _pause;
        emit UpdatedPause(msg.sender, _pause);
    }

    // ------- Internal ----------

    function _stakeReward(address owner, uint256 amount) internal {
        rewardTokenBalances[owner] = rewardTokenBalances[owner].add(amount);
        rewardTokenSupply = rewardTokenSupply.add(amount);
        emit RewardStaked(owner, amount);
    }

    function _withdrawReward(address owner, uint256 amount) internal {
        rewardTokenBalances[owner] = rewardTokenBalances[owner].sub(amount);
        rewardTokenSupply = rewardTokenSupply.sub(amount);
        emit RewardWithdrawn(owner, amount);
    }

    function _stakeBase(address owner, uint256 amount) internal {
        baseTokenBalances[owner] = baseTokenBalances[owner].add(amount);
        baseTokenSupply = baseTokenSupply.add(amount);
        base.transferFrom(owner, address(this), amount);
        emit BaseStaked(owner, amount);
    }

    function _withdrawBase(address owner, uint256 amount) internal {
        baseTokenBalances[owner] = baseTokenBalances[owner].sub(amount);
        baseTokenSupply = baseTokenSupply.sub(amount);
        base.transfer(owner, amount);
        emit BaseWithdrawn(owner, amount);
    }

    function _stakeBoost(address owner, uint256 amount) internal {
        boostTokenBalances[owner] = boostTokenBalances[owner].add(amount);
        boostTokenSupply = boostTokenSupply.add(amount);
        boost.transferFrom(owner, address(this), amount);
        emit BoostStaked(owner, amount);
    }

    function _withdrawBoost(address owner, uint256 amount) internal {
        boostTokenBalances[owner] = boostTokenBalances[owner].sub(amount);
        boostTokenSupply = boostTokenSupply.sub(amount);
        boost.transfer(owner, amount);
        emit BoostWithdrawn(owner, amount);
    }

    function _claimReward(address syntheticTokenAddress) internal {
        uint256 reward =
            personRewardAccruals[syntheticTokenAddress][msg.sender]
                .accruedReward;
        if (reward > 0) {
            personRewardAccruals[syntheticTokenAddress][msg.sender]
                .accruedReward = 0;
            SyntheticToken token = SyntheticToken(syntheticTokenAddress);
            token.transfer(msg.sender, reward);
            emit RewardPaid(syntheticTokenAddress, msg.sender, reward);
        }
    }

    function _updateAccrual(address syntheticTokenAddress, address owner)
        internal
    {
        _updateRewardTokenBalance(owner);
        PersonRewardAccrual storage accrual =
            personRewardAccruals[syntheticTokenAddress][owner];
        PoolRewardSnapshot[] storage tokenSnapshots =
            poolRewardSnapshots[syntheticTokenAddress];
        if (accrual.lastAccrualSnaphotId == tokenSnapshots.length - 1) {
            return;
        }
        PoolRewardSnapshot storage lastSnapshot =
            tokenSnapshots[tokenSnapshots.length - 1];
        uint256 lastOverallRPSU = lastSnapshot.accruedRewardPerShareUnit;
        PoolRewardSnapshot storage lastAccrualSnapshot =
            tokenSnapshots[accrual.lastAccrualSnaphotId];
        uint256 lastUserAccrualRPSU =
            lastAccrualSnapshot.accruedRewardPerShareUnit;
        uint256 deltaRPSU = lastOverallRPSU.sub(lastUserAccrualRPSU);
        uint256 addedUserReward =
            rewardsTokenBalance(owner).mul(deltaRPSU).div(10**decimals);
        accrual.lastAccrualSnaphotId = tokenSnapshots.length - 1;
        accrual.accruedReward = accrual.accruedReward.add(addedUserReward);
        emit RewardAccrued(
            syntheticTokenAddress,
            owner,
            addedUserReward,
            accrual.accruedReward
        );
    }

    function _updateRewardTokenBalance(address owner) internal {
        uint256 currentBalance = rewardTokenBalances[owner];
        uint256 newBalance = rewardsTokenBalance(owner);
        if (newBalance == currentBalance) {
            return;
        }
        if (newBalance > currentBalance) {
            _stakeReward(owner, newBalance.sub(currentBalance));
        } else {
            _withdrawReward(owner, currentBalance.sub(newBalance));
        }
    }

    // ------- Events ----------

    event RewardAccrued(
        address syntheticTokenAddress,
        address to,
        uint256 incrementalReward,
        uint256 totalReward
    );
    event RewardPaid(
        address indexed syntheticTokenAddress,
        address indexed to,
        uint256 reward
    );
    event IncomingBoardroomReward(
        address indexed token,
        address indexed from,
        uint256 amount
    );
    event RewardStaked(address indexed to, uint256 amount);
    event RewardWithdrawn(address indexed to, uint256 amount);
    event BaseStaked(address indexed to, uint256 amount);
    event BaseWithdrawn(address indexed to, uint256 amount);
    event BoostStaked(address indexed to, uint256 amount);
    event BoostWithdrawn(address indexed to, uint256 amount);
    event UpdatedLockPool(address indexed operator, address newPool);
    event UpdatedBase(address indexed operator, address newBase);
    event UpdatedBoost(address indexed operator, address newBoost);
    event UpdatedPause(address indexed operator, bool pause);
    event UpdatedTokenManager(
        address indexed operator,
        address newTokenManager
    );
    event UpdatedEmissionManager(
        address indexed operator,
        address newEmissionManager
    );
}
