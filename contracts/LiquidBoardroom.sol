//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "./interfaces/IVotingEscrow.sol";
import "./Boardroom.sol";

/// Boardroom distributes token emission among shareholders that stake Klon and lock Klon in veToken
contract LiquidBoardroom is Boardroom {
    /// Address of veToken
    IVotingEscrow public veToken;

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

    /// Update veToken
    /// @param _veToken new token address
    function setVeToken(address _veToken) public onlyOwner {
        veToken = IVotingEscrow(_veToken);
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
            stakingToken.balanceOf(owner).add(veToken.locked__balance(owner));
    }

    /// Shows the supply of the virtual token that participates in reward calculation
    function shareTokenSupply() public view override returns (uint256) {
        stakingToken.balanceOf(address(this)).add(veToken.supply());
    }
}
