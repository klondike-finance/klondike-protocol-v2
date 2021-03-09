//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "./interfaces/IVotingEscrow.sol";
import "./Boardroom.sol";

/// Boardroom distributes token emission among shareholders that stake Klon
contract LiquidBoardroom is Boardroom {
    address public veBoardroom;

    /// Creates new Boardroom
    /// @param _stakingToken address of the base token
    /// @param _tokenManager address of the TokenManager
    /// @param _emissionManager address of the EmissionManager
    /// @param _start start of the pool date
    constructor(
        address _stakingToken,
        address _tokenManager,
        address _emissionManager,
        uint256 _start
    )
        public
        Boardroom(_stakingToken, _tokenManager, _emissionManager, _start)
    {}

    function setVeKlonBoardroom(address _veKlonBoardroom) public onlyOperator {
        veKlonBoardroom = _veKlonBoardroom;
    }

    function _doStakeTransfer(
        address from,
        address,
        uint256 amount
    ) internal override {
        stakingToken.transferFrom(from, address(this), amount);
    }

    function _doWithdrawTransfer(
        address,
        address to,
        uint256 amount
    ) internal override {
        stakingToken.transfer(to, amount);
    }

    /// Shows the balance of the virtual token that participates in reward calculation
    /// @param owner the owner of the share tokens
    function shareTokenBalance(address owner)
        public
        view
        override
        returns (uint256)
    {
        return
            stakingToken.balanceOf(owner).add(
                IVotingEscrow(veKlonBoardRoom).locked__balance(owner)
            );
    }

    /// Shows the supply of the virtual token that participates in reward calculation
    function shareTokenSupply() public view override returns (uint256) {
        stakingToken.balanceOf(address(owner)).add(
            stakingToken.balanceOf(veKlonBoardRoom)
        );
    }
}
