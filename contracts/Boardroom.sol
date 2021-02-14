//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./access/ReentrancyGuardable.sol";
import "./time/Timeboundable.sol";
import "./LockPool.sol";
import "./SyntheticToken.sol";
import "./treasury/TokenManager.sol";
import "./interfaces/IBoardroom.sol";

/// Boardroom distributes token emission among shareholders
contract Boardroom is
    IBoardroom,
    ReentrancyGuardable,
    Timeboundable,
    Operatable
{
    using SafeMath for uint256;

    /// Added each time reward to the Boardroom is added
    struct PoolRewardSnapshot {
        uint256 timestamp;
        uint256 addedSyntheticReward;
        uint256 totalRewardTokenSupply;
        uint256 totalSyntheticReward;
    }

    /// Accumulated personal rewards available for claiming
    struct PersonRewardAccrual {
        uint256 lastAccrualSnaphotId;
        uint256 accruedReward;
    }

    /// A set of PoolRewardSnapshots for every synthetic token
    mapping(address => PoolRewardSnapshot[]) poolRewardSnapshots;
    /// A set of records of personal accumulated income.
    /// The first key is token, the second is holder address.
    mapping(address => mapping(address => PersonRewardAccrual)) personRewardAccruals;

    /// Reward token formula param
    uint256 public immutable boostShareMultiplier;
    /// Reward token formula param
    uint256 public immutable boostTokenDenominator;

    /// Base token. Both base and boost token yield reward token which ultimately participates in rewards distribution.
    SyntheticToken public base;
    /// Boost token
    SyntheticToken public boost;
    /// TokenManager ref
    TokenManager public tokenManager;
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
    /// @param _lockPool address of the LockPool
    /// @param _boostShareMultiplier boost formula param
    /// @param _boostTokenDenominator boost formula param
    /// @param _start start of the pool date
    constructor(
        address _base,
        address _boost,
        address _tokenManager,
        address _emissionManager,
        address _lockPool,
        uint256 _boostShareMultiplier,
        uint256 _boostTokenDenominator,
        uint256 _start
    ) public Timeboundable(_start, 0) {
        base = SyntheticToken(_base);
        boost = SyntheticToken(_boost);
        tokenManager = TokenManager(_tokenManager);
        emissionManager = _emissionManager;
        lockPool = LockPool(_lockPool);
        boostShareMultiplier = _boostShareMultiplier;
        boostTokenDenominator = _boostTokenDenominator;
        address[] memory syntheticTokens = tokenManager.allTokens();
        for (uint256 i = 0; i < syntheticTokens.length; i++) {
            address token = syntheticTokens[i];
            poolRewardSnapshots[token].push(
                PoolRewardSnapshot({
                    timestamp: block.timestamp,
                    addedSyntheticReward: 0,
                    totalRewardTokenSupply: 0,
                    totalSyntheticReward: 0
                })
            );
        }
    }

    // ------- Public ----------

    /// Get reward token balance for a user
    function rewardsTokenBalance(address owner) public view returns (uint256) {
        uint256 baseBalance = baseTokenBalances[owner];
        uint256 baseLockedBalance = lockPool.balanceOf(owner);
        uint256 boostBalance = boostTokenBalances[owner];
        return
            baseBalance.add(baseLockedBalance).add(
                boostShareMultiplier.mul(
                    Math.min(
                        baseBalance,
                        boostBalance.div(boostTokenDenominator)
                    )
                )
            );
    }

    /// Stake tokens into Boardroom
    /// @param baseAmount amount of base token
    /// @param boostAmount amount of boost token
    /// @dev One of amounts should be > 0
    function stake(uint256 baseAmount, uint256 boostAmount)
        public
        onePerBlock
        inTimeBounds
    {
        require(
            (baseAmount > 0) || (boostAmount > 0),
            "Boardroom: one amount should be > 0"
        );
        updateAccruals();
        if (baseAmount > 0) {
            _stakeBase(baseAmount);
        }
        if (boostAmount > 0) {
            _stakeBoost(boostAmount);
        }
        _updateRewardTokenBalance(msg.sender);
    }

    /// Withdraw tokens from Boardroom
    /// @param baseAmount amount of base token
    /// @param boostAmount amount of boost token
    /// @dev One of amounts should be > 0
    function withdraw(uint256 baseAmount, uint256 boostAmount)
        public
        onePerBlock
    {
        require(
            (baseAmount > 0) || (boostAmount > 0),
            "Boardroom: one amount should be > 0"
        );
        updateAccruals();
        if (baseAmount > 0) {
            _withdrawBase(baseAmount);
        }
        if (boostAmount > 0) {
            _withdrawBoost(boostAmount);
        }
        _updateRewardTokenBalance(msg.sender);
    }

    /// Update accrued rewards for all tokens of sender
    function updateAccruals() public {
        address[] memory tokens = tokenManager.allTokens();
        for (uint256 i = 0; i < tokens.length - 1; i++) {
            _updateAccrual(tokens[i]);
        }
    }

    /// Transfer all rewards to sender
    function claimRewards() public onePerBlock {
        address[] memory tokens = tokenManager.allTokens();
        for (uint256 i = 0; i < tokens.length - 1; i++) {
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
        PoolRewardSnapshot[] storage tokenSnapshots =
            poolRewardSnapshots[token];
        PoolRewardSnapshot storage lastSnapshot =
            tokenSnapshots[tokenSnapshots.length - 1];
        tokenSnapshots.push(
            PoolRewardSnapshot({
                timestamp: block.timestamp,
                addedSyntheticReward: amount,
                totalRewardTokenSupply: rewardTokenSupply,
                totalSyntheticReward: lastSnapshot.totalSyntheticReward.add(
                    amount
                )
            })
        );
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
        tokenManager = TokenManager(_tokenManager);
        emit UpdatedTokenManager(msg.sender, _tokenManager);
    }

    /// Updates EmissionManager
    /// @param _emissionManager new EmissionManager
    function setEmissionManager(address _emissionManager) public onlyOwner {
        emissionManager = _emissionManager;
        emit UpdatedEmissionManager(msg.sender, _emissionManager);
    }

    // ------- Internal ----------

    function _stakeReward(uint256 amount) internal {
        rewardTokenBalances[msg.sender] = rewardTokenBalances[msg.sender].add(
            amount
        );
        rewardTokenSupply = rewardTokenSupply.add(amount);
        emit RewardStaked(msg.sender, amount);
    }

    function _withdrawReward(uint256 amount) internal {
        rewardTokenBalances[msg.sender] += amount;
        rewardTokenSupply += amount;
        emit RewardWithdrawn(msg.sender, amount);
    }

    function _stakeBase(uint256 amount) internal {
        baseTokenBalances[msg.sender] = baseTokenBalances[msg.sender].add(
            amount
        );
        baseTokenSupply = baseTokenSupply.add(amount);
        emit BaseStaked(msg.sender, amount);
    }

    function _withdrawBase(uint256 amount) internal {
        baseTokenBalances[msg.sender] += amount;
        baseTokenSupply += amount;
        emit BaseStaked(msg.sender, amount);
    }

    function _stakeBoost(uint256 amount) internal {
        boostTokenBalances[msg.sender] = boostTokenBalances[msg.sender].add(
            amount
        );
        boostTokenSupply = boostTokenSupply.add(amount);
        emit BoostStaked(msg.sender, amount);
    }

    function _withdrawBoost(uint256 amount) internal {
        boostTokenBalances[msg.sender] += amount;
        boostTokenSupply += amount;
        emit BoostWithdrawn(msg.sender, amount);
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

    function _updateAccrual(address syntheticTokenAddress) internal {
        PersonRewardAccrual storage accrual =
            personRewardAccruals[syntheticTokenAddress][msg.sender];
        PoolRewardSnapshot[] storage tokenSnapshots =
            poolRewardSnapshots[syntheticTokenAddress];
        if (accrual.lastAccrualSnaphotId == tokenSnapshots.length - 1) {
            return;
        }
        PoolRewardSnapshot storage lastSnapshot =
            tokenSnapshots[tokenSnapshots.length - 1];
        PoolRewardSnapshot storage lastAccrualSnapshot =
            tokenSnapshots[accrual.lastAccrualSnaphotId];
        uint256 addedTotalReward =
            lastSnapshot.totalSyntheticReward.sub(
                lastAccrualSnapshot.totalSyntheticReward
            );
        uint256 addedUserReward =
            addedTotalReward.mul(rewardTokenBalances[msg.sender]).div(
                lastSnapshot.totalRewardTokenSupply
            );
        accrual.lastAccrualSnaphotId = tokenSnapshots.length - 1;
        accrual.accruedReward = accrual.accruedReward.add(addedUserReward);
        emit RewardAccrued(
            syntheticTokenAddress,
            msg.sender,
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
            _stakeReward(newBalance.sub(currentBalance));
        } else {
            _withdrawReward(currentBalance.sub(newBalance));
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
    event RewardStaked(address indexed to, uint256 amount);
    event RewardWithdrawn(address indexed to, uint256 amount);
    event BaseStaked(address indexed to, uint256 amount);
    event BaseWithdrawn(address indexed to, uint256 amount);
    event BoostStaked(address indexed to, uint256 amount);
    event BoostWithdrawn(address indexed to, uint256 amount);
    event UpdatedLockPool(address indexed operator, address newPool);
    event UpdatedBase(address indexed operator, address newBase);
    event UpdatedBoost(address indexed operator, address newBoost);
    event UpdatedTokenManager(
        address indexed operator,
        address newTokenManager
    );
    event UpdatedEmissionManager(
        address indexed operator,
        address newEmissionManager
    );
}
