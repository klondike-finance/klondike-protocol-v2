//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "./SyntheticToken.sol";
import "./ProxyToken.sol";
import "./time/Timeboundable.sol";

contract LockPool is Timeboundable, ProxyToken {
    struct LockEvent {
        uint256 timestamp;
        uint256 unlockDate;
        uint256 amount;
        bool withdrawn;
    }

    mapping(address => LockEvent[]) private lockEvents;
    mapping(address => uint256) private lockEventLookupStart;

    SyntheticToken stakingToken;
    SyntheticToken rewardsToken;

    constructor(
        uint256 _start,
        address _stakingToken,
        address _rewardsToken
    ) public Timeboundable(_start, 0) ProxyToken(_stakingToken) {
        stakingToken = SyntheticToken(_stakingToken);
        rewardsToken = SyntheticToken(_rewardsToken);
    }

    function validTokenPermissions() public view returns (bool) {
        return rewardsToken.operator() == address(this);
    }

    function stake(uint256 amount) public override {
        super.stake(amount);
    }

    function withdraw(uint256 amount) public override {
        super.withdraw(amount);
    }
}
