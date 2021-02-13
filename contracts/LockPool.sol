//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "./SyntheticToken.sol";
import "./ProxyToken.sol";
import "./time/Timeboundable.sol";
import "./access/ReentrancyGuardable.sol";
import "./access/Operatable.sol";

/// Contract for locking tokens for some time and receiving rewards immediately
contract LockPool is
    Timeboundable,
    ProxyToken,
    Operatable,
    ReentrancyGuardable
{
    /// Marks the moment of staking. At staking usedDate is 0.
    /// If UTXO is used for withdraw usedDate is the time of withdraw.
    struct UTXO {
        uint256 unlockDate;
        uint256 amount;
        uint256 usedDate;
    }

    /// Utxos for a staker
    mapping(address => UTXO[]) public utxos;
    /// Before that UTXO all utxos are used
    mapping(address => uint256) public firstUtxo;
    /// Rewarding factor mapping days of lock to factor applied
    mapping(uint32 => uint32) public rewardFactor;
    /// Tracks all relevant rewardDays
    uint32[] private rewardDays;

    /// Token for lock
    SyntheticToken stakingToken;
    /// Token for rewards given immediately after lock
    SyntheticToken rewardsToken;

    /// Creates new lock pool
    /// @param _stakingToken Address of the token to be staked
    /// @param _rewardsToken Address of the rewarding token
    /// @param _start When this pool is started
    constructor(
        address _stakingToken,
        address _rewardsToken,
        uint256 _start
    ) public Timeboundable(_start, 0) ProxyToken(_stakingToken) {
        stakingToken = SyntheticToken(_stakingToken);
        rewardsToken = SyntheticToken(_rewardsToken);
    }

    // ------- Modifiers ----------

    /// Checks if contract is ready to be used
    modifier initialized() {
        require(validPermissions(), "LockPool: token permissions are not set");
        _;
    }

    // ------- View ----------

    /// Returns all tracked reward days
    function getRewardDays() public view returns (uint32[] memory) {
        return rewardDays;
    }

    /// Token permissions are set correctly
    function validPermissions() public view returns (bool) {
        return rewardsToken.operator() == address(this);
    }

    /// Check how many staking tokens is available for user withdraw
    /// @param owner owner of the tokens
    function stakeAvailableForUnlock(address owner)
        public
        view
        returns (uint256 actualAmount)
    {
        actualAmount = 0;
        UTXO[] storage ownerUtxos = utxos[owner];
        uint256 start = firstUtxo[owner];
        for (uint256 i = start; i < ownerUtxos.length; i++) {
            UTXO storage utxo = ownerUtxos[i];
            if ((utxo.unlockDate < block.timestamp) && (utxo.usedDate == 0)) {
                actualAmount += utxo.amount;
            }
        }
    }

    // ------- Public ----------

    /// Stake tokens and receive rewards
    /// @param amount of tokens to stake
    /// @param daysLock number of days to lock tokens
    function stake(uint256 amount, uint32 daysLock)
        public
        initialized
        onePerBlock
    {
        uint32 multiplier = rewardFactor[daysLock];
        uint256 reward = daysLock * amount * multiplier;
        require(reward > 0, "Invalid daysLock or amount param param");
        uint256 unlockDate = block.timestamp + daysLock * 86400;

        super.stake(amount);
        utxos[msg.sender].push(UTXO(unlockDate, amount, 0));
        rewardsToken.mint(msg.sender, reward);

        emit Staked(msg.sender, amount, reward, daysLock);
    }

    /// Withdraws all available tokens
    function withdraw() public onePerBlock {
        uint256 actualAmount = 0;
        UTXO[] storage ownerUtxos = utxos[msg.sender];
        uint256 first = firstUtxo[msg.sender];
        for (uint256 i = first; i < ownerUtxos.length; i++) {
            UTXO storage utxo = ownerUtxos[i];
            if ((utxo.unlockDate < block.timestamp) && (utxo.usedDate == 0)) {
                actualAmount += utxo.amount;
                utxo.usedDate = block.timestamp;
                if (i == first) {
                    first++;
                }
            }
        }
        if (firstUtxo[msg.sender] != first) {
            firstUtxo[msg.sender] = first;
        }
        if (actualAmount == 0) {
            return;
        }
        super.withdraw(actualAmount);
        emit Withdrawn(actualAmount);
    }

    // ------- Public, Operator ----------

    /// Set reward factor
    /// @param daysLock for this number of days
    /// @param factor the value of the factor
    function setRewardFactor(uint32 daysLock, uint32 factor)
        public
        onlyOperator
    {
        rewardFactor[daysLock] = factor;
        bool dayExists = false;
        for (uint256 i = 0; i < rewardDays.length; i++) {
            if (rewardDays[i] == daysLock) {
                dayExists = true;
                break;
            }
        }
        if (!dayExists) {
            rewardDays.push(daysLock);
        }
        emit UpdatedRewardFactor(daysLock, factor);
    }

    event Staked(
        address from,
        uint256 amountStaked,
        uint256 rewardReceived,
        uint32 daysLock
    );
    event Withdrawn(uint256 amount);
    event UpdatedRewardFactor(uint32 daysLock, uint32 factor);
}
