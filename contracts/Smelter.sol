//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "./interfaces/ISmelter.sol";
import "./SyntheticToken.sol";

contract Smelter is ISmelter, Ownable {
    /// Addresses of contracts allowed to mint / burn synthetic tokens
    address[] tokenAdmins;

    modifier tokenAdmin() {
        require(isTokenAdmin(msg.sender), "Smelter: Must be called by token admin");
        _;
    }

    /// Check if address is token admin
    /// @param admin - address to check
    function isTokenAdmin(address admin) public view override returns (bool) {
        for (uint256 i = 0; i < tokenAdmins.length; i++) {
            if (tokenAdmins[i] == admin) {
                return true;
            }
        }
        return false;
    }

    /// All token admins allowed to mint / burn
    function allTokenAdmins() public view returns (address[] memory) {
        return tokenAdmins;
    }

    /// Burns synthetic token from the owner
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @param owner Owner of the tokens to burn
    /// @param amount Amount to burn
    function burnSyntheticFrom(
        address syntheticTokenAddress,
        address owner,
        uint256 amount
    ) public override virtual tokenAdmin {
        SyntheticToken(syntheticTokenAddress).burnFrom(owner, amount);
    }

    /// Mints synthetic token
    /// @param syntheticTokenAddress The address of the synthetic token
    /// @param receiver Address to receive minted token
    /// @param amount Amount to mint
    function mintSynthetic(
        address syntheticTokenAddress,
        address receiver,
        uint256 amount
    ) public override virtual tokenAdmin {
        SyntheticToken(syntheticTokenAddress).mint(receiver, amount);
    }

    function addTokenAdmin(address admin) public onlyOwner {
        if (isTokenAdmin(admin)) {
            return;
        }
        tokenAdmins.push(admin);
    }

    function deleteTokenAdmin(address admin) public onlyOwner {
        for (uint256 i = 0; i < tokenAdmins.length; i++) {
            if (tokenAdmins[i] == admin) {
                delete tokenAdmins[i];
            }
        }
    }
}