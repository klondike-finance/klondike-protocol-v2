//SPDX-License-Identifier: MIT
pragma solidity ^0.5.16;

import "synthetix/contracts/StakingRewards.sol";

/// @title Rewards pool for distributing synthetic tokens
contract StableTokenPool is StakingRewards {
    string public name;

    /// Creates a new contract.
    /// @param _name an address allowed to add rewards
    /// @param _rewardsDistribution an address allowed to add rewards
    /// @param _rewardsToken token distributed to stakeholders
    /// @param _stakingToken token to be staked
    /// @param _rewardsDuration lifetime of the pool in seconds
    constructor(
        string memory _name,
        address _rewardsDistribution,
        address _rewardsToken,
        address _stakingToken,
        uint256 _rewardsDuration
    )
        public
        StakingRewards(
            msg.sender,
            _rewardsDistribution,
            _rewardsToken,
            _stakingToken
        )
    {
        name = _name;
        rewardsDuration = _rewardsDuration;
    }

    /// Disabled parent method for changing lifetime of the pool
    function setRewardsDuration(uint256) external onlyOwner {
        revert("Disabled");
    }
}
