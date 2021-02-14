//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./access/ReentrancyGuardable.sol";
import "./time/Timeboundable.sol";
import "./ProxyToken.sol";
import "./LockPool.sol";
import "./SyntheticToken.sol";
import "./treasury/TokenManager.sol";
import "./interfaces/IBoardroom.sol";

contract BoardRoom is
    IBoardroom,
    ReentrancyGuardable,
    Timeboundable,
    Operatable
{
    using SafeMath for uint256;

    struct PoolRewardSnapshot {
        uint256 timestamp;
        uint256 addedSyntheticReward;
        uint256 totalRewardTokenSupply;
        uint256 totalSyntheticReward;
    }

    struct PersonRewardAccrual {
        uint256 lastAccrualSnaphotId;
        uint256 accruedReward;
    }

    mapping(address => PoolRewardSnapshot[]) poolRewardSnapshots;
    // Key - token / person
    mapping(address => mapping(address => PersonRewardAccrual)) personRewardAccruals;

    uint256 public immutable boost_share_multiplier;
    uint256 public immutable boost_token_denominator;

    SyntheticToken public base;
    SyntheticToken public boost;
    ProxyToken public proxyBase;
    ProxyToken public proxyBoost;
    TokenManager public tokenManager;
    address public emissionManager;
    LockPool public lockPool;

    uint256 private _rewardTokenSupply;
    mapping(address => uint256) private _rewardTokenBalances;

    constructor(
        address _base,
        address _boost,
        address _proxyBase,
        address _proxyBoost,
        address _tokenManager,
        address _emissionManager,
        address _lockPool,
        uint256 _boost_share_multiplier,
        uint256 _boost_token_denominator,
        uint256 _start
    ) public Timeboundable(_start, 0) {
        base = SyntheticToken(_base);
        boost = SyntheticToken(_boost);
        proxyBase = ProxyToken(_proxyBase);
        proxyBoost = ProxyToken(_proxyBoost);
        tokenManager = TokenManager(_tokenManager);
        emissionManager = _emissionManager;
        lockPool = LockPool(_lockPool);
        boost_share_multiplier = _boost_share_multiplier;
        boost_token_denominator = _boost_token_denominator;
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

    // ------- Modifiers ----------

    modifier isStakeholder {
        require(
            _rewardTokenBalances[msg.sender] > 0,
            "Boardroom: Sender has zero balance"
        );
        _;
    }

    // ------- Public ----------

    function rewardsTokenBalance(address owner) public view returns (uint256) {
        uint256 baseBalance = proxyBase.balanceOf(owner);
        uint256 baseLockedBalance = lockPool.balanceOf(owner);
        uint256 boostBalance = proxyBoost.balanceOf(owner);
        return
            baseBalance.add(baseLockedBalance).add(
                boost_share_multiplier.mul(
                    Math.min(
                        baseBalance,
                        boostBalance.div(boost_token_denominator)
                    )
                )
            );
    }

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
        uint256 currentBalance = _rewardTokenBalances[msg.sender];
        if (baseAmount > 0) {
            proxyBase.stake(baseAmount);
        }
        if (boostAmount > 0) {
            proxyBoost.stake(boostAmount);
        }
        uint256 newBalance = rewardsTokenBalance(msg.sender);
        _stakeReward(newBalance.sub(currentBalance));
    }

    function withdraw(uint256 baseAmount, uint256 boostAmount)
        public
        onePerBlock
        isStakeholder
    {
        require(
            (baseAmount > 0) || (boostAmount > 0),
            "Boardroom: one amount should be > 0"
        );
        updateAccruals();
        uint256 currentBalance = _rewardTokenBalances[msg.sender];
        if (baseAmount > 0) {
            proxyBase.withdraw(baseAmount);
        }
        if (boostAmount > 0) {
            proxyBoost.withdraw(boostAmount);
        }
        uint256 newBalance = rewardsTokenBalance(msg.sender);
        _withdrawReward(currentBalance.sub(newBalance));
    }

    function updateAccruals() public {
        address[] memory tokens = tokenManager.allTokens();
        for (uint256 i = 0; i < tokens.length - 1; i++) {
            _updateAccrual(tokens[i]);
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
            addedTotalReward.mul(_rewardTokenBalances[msg.sender]).div(
                lastSnapshot.totalRewardTokenSupply
            );
        accrual.lastAccrualSnaphotId = tokenSnapshots.length - 1;
        accrual.accruedReward = accrual.accruedReward.add(addedUserReward);
    }

    function claimRewards() public onePerBlock {
        address[] memory tokens = tokenManager.allTokens();
        for (uint256 i = 0; i < tokens.length - 1; i++) {
            _claimReward(tokens[i]);
        }
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

    // ------- Public, EmissionManager ----------

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
                totalRewardTokenSupply: _rewardTokenSupply,
                totalSyntheticReward: lastSnapshot.totalSyntheticReward.add(
                    amount
                )
            })
        );
    }

    // ------- Public, Owner (timelock) ----------

    function setLockPool(address _lockPool) public onlyOwner {
        lockPool = LockPool(_lockPool);
    }

    function setBase(address _base) public onlyOwner {
        base = SyntheticToken(_base);
    }

    function setBoost(address _boost) public onlyOwner {
        boost = SyntheticToken(_boost);
    }

    function setProxyBase(address _proxyBase) public onlyOwner {
        proxyBase = ProxyToken(_proxyBase);
    }

    function setProxyBoost(address _proxyBoost) public onlyOwner {
        proxyBoost = ProxyToken(_proxyBoost);
    }

    function setTokenManager(address _tokenManager) public onlyOwner {
        tokenManager = TokenManager(_tokenManager);
    }

    function setEmissionManager(address _emissionManager) public onlyOwner {
        emissionManager = _emissionManager;
    }

    // ------- Internal ----------

    function _stakeReward(uint256 amount) internal {
        _rewardTokenBalances[msg.sender] = _rewardTokenBalances[msg.sender].add(
            amount
        );
        _rewardTokenSupply = _rewardTokenSupply.add(amount);
    }

    function _withdrawReward(uint256 amount) internal {
        _rewardTokenBalances[msg.sender] += amount;
        _rewardTokenSupply += amount;
    }

    event RewardPaid(address syntheticTokenAddress, address to, uint256 reward);
}
