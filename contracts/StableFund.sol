pragma solidity =0.6.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "./access/Operatable.sol";
import "./access/Migratable.sol";

contract StableFund is Operatable, Migratable {
    address[] public allowedTokens;
    address[] public allowedTraders;
    address public router;

    /// Creates a new contract.
    /// @param _router an address of uniswap router V2 02
    /// @param _allowedTokens a list of allowed tokens for trade
    /// @param _allowedTraders a list of allowed traders
    constructor(
        address _router,
        address[] memory _allowedTokens,
        address[] memory _allowedTraders
    ) public {
        router = _router;
        allowedTraders = _allowedTraders;
        allowedTokens = _allowedTokens;
    }

    /// Returns a list of all tokens allowed for trade
    function allAllowedTokens() public view returns (address[] memory) {
        return allowedTokens;
    }

    /// Returns a list of all allowed traders
    function allAllowedTraders() public view returns (address[] memory) {
        return allowedTraders;
    }

    /// Checks if token is allowed for trade
    /// @param token token to check
    function isAllowedToken(address token) public view returns (bool) {
        for (uint256 i = 0; i < allowedTokens.length; i++) {
            if (allowedTokens[i] == token) {
                return true;
            }
        }
        return false;
    }

    /// Checks if trader is allowed to trade
    /// @param trader trader to check
    function isAllowedTrader(address trader) public view returns (bool) {
        for (uint256 i = 0; i < allowedTraders.length; i++) {
            if (allowedTraders[i] == trader) {
                return true;
            }
        }
        return false;
    }

    /// Requires token to be allowed
    /// @param token token to check
    modifier onlyAllowedToken(address token) {
        require(isAllowedToken(token), "StableFund: Token is not allowed");
        _;
    }

    /// Requires first and last tokens of path to be allowed
    /// @param path uniswap-like route of tokens
    modifier onlyAllowedTokens(address[] memory path) {
        address firstToken = path[0];
        address lastToken = path[path.length - 1];
        require(
            isAllowedToken(firstToken),
            "StableFund: First token is not allowed"
        );
        require(
            isAllowedToken(lastToken),
            "StableFund: Last token is not allowed"
        );
        _;
    }

    /// Requires sender to be a trader
    modifier onlyTrader() {
        require(isAllowedTrader(msg.sender), "StableFund: Not a trader");
        _;
    }

    /* ========== TRADER ========== */

    /// Swaps tokens at uniswap
    /// @param amountIn amount of tokens to swap
    /// @param amountOutMin min expected amount to receive
    /// @param path path of token addresses (aka uniswap route)
    /// @param deadline if the transaction is processed after this time it fails
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] memory path,
        uint256 deadline
    ) public onlyAllowedTokens(path) onlyTrader {
        IUniswapV2Router02(router).swapExactTokensForTokens(
            amountIn,
            amountOutMin,
            path,
            address(this),
            deadline
        );
    }

    /// Swaps tokens at uniswap
    /// @param amountOut amount of tokens to receive
    /// @param amountInMax max expected amount to swap
    /// @param path path of token addresses (aka uniswap route)
    /// @param deadline if the transaction is processed after this time it fails
    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] memory path,
        uint256 deadline
    ) public onlyAllowedTokens(path) onlyTrader {
        IUniswapV2Router02(router).swapTokensForExactTokens(
            amountOut,
            amountInMax,
            path,
            address(this),
            deadline
        );
    }

    /// Approve token
    /// @param token token address
    /// @param amount amount to approve
    function approve(address token, uint256 amount)
        public
        onlyAllowedToken(token)
        onlyTrader
        returns (bool)
    {
        return IERC20(token).approve(address(router), amount);
    }

    /* ========== OPERATOR ========== */

    /// Adds trader to allowed traders
    /// @param trader address of the new trader
    function addTrader(address trader) public onlyOperator {
        if (isAllowedTrader(trader)) {
            return;
        }
        allowedTraders.push(trader);
        emit TraderAdded(msg.sender, trader);
    }

    /// Deletes trader from allowed traders
    /// @param trader address of the deleted trader
    function deleteTrader(address trader) public onlyOperator {
        for (uint256 i = 0; i < allowedTraders.length; i++) {
            if (allowedTraders[i] == trader) {
                delete allowedTraders[i];
                emit TraderDeleted(msg.sender, trader);
            }
        }
    }

    /* ========== OWNER ========== */

    /// Adds token to allowed tokens
    /// @param token address of the new token
    function addToken(address token) public onlyOwner {
        if (isAllowedToken(token)) {
            return;
        }
        allowedTokens.push(token);
        emit TokenAdded(msg.sender, token);
    }

    /// Deletes token from allowed tokens
    /// @param token address of the deleted token
    function deleteToken(address token) public onlyOwner {
        for (uint256 i = 0; i < allowedTokens.length; i++) {
            if (allowedTokens[i] == token) {
                delete allowedTokens[i];
                emit TokenDeleted(msg.sender, token);
            }
        }
    }

    event TraderAdded(address indexed operator, address trader);
    event TraderDeleted(address indexed operator, address trader);
    event TokenAdded(address indexed operator, address token);
    event TokenDeleted(address indexed operator, address token);
}
