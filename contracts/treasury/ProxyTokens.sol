pragma solidity ^0.6.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ProxyTokens {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    mapping(address => IERC20) public innerProxyTokens;

    mapping(address => uint256) private _proxyTotalSupply;
    mapping(address => mapping(address => uint256)) private _proxyBalances;

    function totalSupply(address syntheticTokenAddress)
        public
        view
        returns (uint256)
    {
        return _proxyTotalSupply[syntheticTokenAddress];
    }

    function balanceOf(address syntheticTokenAddress, address account)
        public
        view
        returns (uint256)
    {
        return _proxyBalances[syntheticTokenAddress][account];
    }

    function stakeInnerToken(address syntheticTokenAddress, uint256 amount)
        public
        virtual
    {
        _proxyTotalSupply[syntheticTokenAddress] = _proxyTotalSupply[
            syntheticTokenAddress
        ]
            .add(amount);
        _proxyBalances[syntheticTokenAddress][msg.sender] = _proxyBalances[
            syntheticTokenAddress
        ][msg.sender]
            .add(amount);
        innerProxyTokens[syntheticTokenAddress].safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );
    }

    function withdrawInnerToken(address syntheticTokenAddress, uint256 amount)
        public
        virtual
    {
        _proxyTotalSupply[syntheticTokenAddress] = _proxyTotalSupply[
            syntheticTokenAddress
        ]
            .sub(amount);
        _proxyBalances[syntheticTokenAddress][msg.sender] = _proxyBalances[
            syntheticTokenAddress
        ][msg.sender]
            .sub(amount);
        innerProxyTokens[syntheticTokenAddress].safeTransfer(
            msg.sender,
            amount
        );
    }
}
