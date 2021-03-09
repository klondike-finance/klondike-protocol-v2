//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "./interfaces/IVotingEscrow.sol";
import "./Boardroom.sol";

/// Boardroom distributes token emission among shareholders that stake veKlon
contract VeBoardroom is Boardroom {
    address public veToken;

    /// Creates new Boardroom
    /// @param _stakingToken address of the base token
    /// @param _tokenManager address of the TokenManager
    /// @param _emissionManager address of the EmissionManager
    /// @param _start start of the boardroom date
    constructor(
        address _stakingToken,
        address _tokenManager,
        address _emissionManager,
        uint256 _start
    )
        public
        Boardroom(_stakingToken, _tokenManager, _emissionManager, _start)
    {}

    function setVeToken(address _veToken) public onlyOperator {
        veToken = _veToken;
    }

    function _doStakeTransfer(
        address,
        address,
        uint256
    ) internal override {
        revert("VeBoardroom: Staking is disabled");
    }

    function _doWithdrawTransfer(
        address,
        address,
        uint256
    ) internal override {
        revert("VeBoardroom: Withdrawing is disabled");
    }

    /// Shows the balance of the virtual token that participates in reward calculation
    /// @param owner the owner of the share tokens
    function shareTokenBalance(address owner)
        public
        view
        override
        returns (uint256)
    {
        return IERC20(veToken).balanceOf(owner);
    }

    /// Shows the supply of the virtual token that participates in reward calculation
    function shareTokenSupply() public view override returns (uint256) {
        return IERC20(veToken).totalSupply();
    }
}
