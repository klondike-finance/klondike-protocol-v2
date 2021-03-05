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

    constructor(
        address _router,
        address[] memory _allowedTokens,
        address[] memory _allowedTraders
    ) public {
        router = _router;
        allowedTraders = _allowedTraders;
        allowedTokens = _allowedTokens;
    }

    function allAllowedTokens() public view returns (address[] memory) {
        return allowedTokens;
    }

    function allAllowedTraders() public view returns (address[] memory) {
        return allowedTraders;
    }

    function isAllowedToken(address token) public view returns (bool) {
        for (uint256 i = 0; i < allowedTokens.length; i++) {
            if (allowedTokens[i] == token) {
                return true;
            }
        }
        return false;
    }

    function isAllowedTrader(address token) public view returns (bool) {
        for (uint256 i = 0; i < allowedTraders.length; i++) {
            if (allowedTraders[i] == token) {
                return true;
            }
        }
        return false;
    }

    modifier onlyAllowedToken(address token) {
        require(isAllowedToken(token), "StableFund: Token is not allowed");
        _;
    }

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

    modifier onlyTrader() {
        require(isAllowedTrader(msg.sender), "StableFund: Not a trader");
        _;
    }

    /* ========== TRADER ========== */

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

    function approve(address token, uint256 amount)
        public
        onlyAllowedToken(token)
        onlyTrader
        returns (bool)
    {
        return IERC20(token).approve(address(router), amount);
    }

    /* ========== OPERATOR ========== */

    function addTrader(address trader) public onlyOperator {
        if (isAllowedTrader(trader)) {
            return;
        }
        allowedTraders.push(trader);
        emit TraderAdded(msg.sender, trader);
    }

    function deleteTrader(address trader) public onlyOperator {
        for (uint256 i = 0; i < allowedTraders.length; i++) {
            if (allowedTraders[i] == trader) {
                delete allowedTraders[i];
                emit TraderDeleted(msg.sender, trader);
            }
        }
    }

    /* ========== OWNER ========== */

    function addToken(address token) public onlyOwner {
        if (isAllowedToken(token)) {
            return;
        }
        allowedTokens.push(token);
        emit TokenAdded(msg.sender, token);
    }

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
