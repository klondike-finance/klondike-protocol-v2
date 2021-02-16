// SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./Operatable.sol";

contract Migratable is Ownable {
    /// Migrate ownership and operator of a set of tokens
    /// @param tokens a set of tokens to transfer ownership and operator to target
    /// @param target new owner and operator of the token
    function migrateOwnership(address[] memory tokens, address target)
        public
        onlyOwner
    {
        for (uint256 i = 0; i < tokens.length; i++) {
            Operatable token = Operatable(tokens[i]);
            if (token.owner() == address(this)) {
                token.transferOperator(target);
                token.transferOwnership(target);
                emit MigratedOwnership(address(token), target);
            }
        }
    }

    /// Migrate balances of a set of tokens
    /// @param tokens a set of tokens to transfer balances to target
    /// @param target new owner of contract balances
    function migrateBalances(address[] memory tokens, address target)
        public
        onlyOwner
    {
        for (uint256 i = 0; i < tokens.length; i++) {
            IERC20 token = IERC20(tokens[i]);
            uint256 balance = token.balanceOf(address(this));
            if (balance > 0) {
                token.transfer(target, balance);
                emit MigratedBalance(address(token), target, balance);
            }
        }
    }

    event MigratedBalance(address indexed token, address target, uint256 value);
    event MigratedOwnership(address indexed token, address target);
}
