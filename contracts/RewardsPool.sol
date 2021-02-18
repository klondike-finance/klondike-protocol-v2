//SPDX-License-Identifier: MIT
pragma solidity ^0.5.16;

import "synthetix/contracts/StakingRewards.sol";

/// @title Rewards pool for distributing synthetic tokens
contract RewardsPool is StakingRewards {
    string public name;

    /// Creates a new contract.
    /// @param _name an address allowed to add rewards
    /// @param _owner an address allowed to add set reward period, recover funds and pause
    /// @param _rewardsDistribution an address allowed notify about new rewards and recalculate rate
    /// @param _rewardsToken token distributed to stakeholders
    /// @param _stakingToken token to be staked
    /// @param _rewardsDuration lifetime of the pool in seconds
    constructor(
        string memory _name,
        address _owner,
        address _rewardsDistribution,
        address _rewardsToken,
        address _stakingToken,
        uint256 _rewardsDuration
    )
        public
        StakingRewards(
            _owner,
            _rewardsDistribution,
            _rewardsToken,
            _stakingToken
        )
    {
        name = _name;
        rewardsDuration = _rewardsDuration;
    }
}
