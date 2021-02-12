//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "./SyntheticToken.sol";
import "./time/Timeboundable.sol";

contract LockPool is Timeboundable {
    struct LockEvent {
        uint256 timestamp;
        uint256 amount;
    }

    mapping(address => mapping(uint256 => LockEvent)) private lockEvents;
    mapping(address => uint256) private lastWithdraw;

    SyntheticToken stakingToken;
    SyntheticToken rewardsToken;

    constructor(
        uint256 _start,
        address _stakingToken,
        address _rewardsToken
    ) public Timeboundable(_start, 0) {
        stakingToken = SyntheticToken(_stakingToken);
        rewardsToken = SyntheticToken(_rewardsToken);
    }

    function validTokenPermissions() public view returns (bool) {
        return rewardsToken.operator() == address(this);
    }
}
