//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "./SyntheticToken.sol";
import "./ProxyToken.sol";
import "./time/Timeboundable.sol";
import "./access/Operatable.sol";

contract LockPool is Timeboundable, ProxyToken, Operatable {
    struct UTXO {
        uint256 unlockDate;
        uint256 amount;
        uint256 usedDate;
    }

    mapping(address => UTXO[]) private utxos;
    mapping(address => uint256) private firstUtxo;
    mapping(uint32 => uint32) public rewardFactor;

    SyntheticToken stakingToken;
    SyntheticToken rewardsToken;

    constructor(
        uint256 _start,
        address _stakingToken,
        address _rewardsToken
    ) public Timeboundable(_start, 0) ProxyToken(_stakingToken) {
        stakingToken = SyntheticToken(_stakingToken);
        rewardsToken = SyntheticToken(_rewardsToken);
        _setRewardFactor(7, 100);
        _setRewardFactor(30, 150);
        _setRewardFactor(90, 200);
        _setRewardFactor(180, 250);
        _setRewardFactor(365, 300);
        _setRewardFactor(1460, 450);
    }

    modifier initialized() {
        require(
            validTokenPermissions(),
            "LockPool: token permissions are not set"
        );
        _;
    }

    function validTokenPermissions() public view returns (bool) {
        return rewardsToken.operator() == address(this);
    }

    function stake(uint256 amount, uint32 daysLock) public initialized {
        uint32 multiplier = rewardFactor[daysLock];
        uint256 reward = daysLock * amount * multiplier;
        require(reward > 0, "Invalid daysLock or amount param param");
        uint256 unlockDate = block.timestamp + daysLock * 86400;

        super.stake(amount);
        rewardsToken.mint(msg.sender, reward);
        utxos[msg.sender].push(UTXO(unlockDate, amount, 0));

        emit Staked(msg.sender, amount, reward, daysLock);
    }

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

    function withdraw() public {
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
        super.withdraw(actualAmount);
        emit Withdrawn(actualAmount);
    }

    function setRewardFactor(uint32 daysLock, uint32 factor)
        public
        onlyOperator
    {
        _setRewardFactor(daysLock, factor);
    }

    function _setRewardFactor(uint32 daysLock, uint32 factor) internal {
        rewardFactor[daysLock] = factor;
        emit UpdatedRewardFactor(daysLock, factor);
    }

    event Staked(address from, uint256 amount, uint256 reward, uint32 daysLock);
    event Withdrawn(uint256 amount);
    event UpdatedRewardFactor(uint32 daysLock, uint32 factor);
}
