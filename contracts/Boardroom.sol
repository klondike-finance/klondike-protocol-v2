//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./time/Timeboundable.sol";
import "./LockPool.sol";
import "./SyntheticToken.sol";
import "./interfaces/ITokenManager.sol";
import "./interfaces/IBoardroom.sol";

/// Boardroom distributes token emission among shareholders
abstract contract Boardroom is
    IBoardroom,
    ReentrancyGuard,
    Timeboundable,
    Operatable
{
    using SafeMath for uint256;

    /// Added each time reward to the Boardroom is added
    struct PoolRewardSnapshot {
        /// when snapshost was made
        uint256 timestamp;
        /// how much reward was added at this snapshot
        uint256 addedSyntheticReward;
        /// accumulated reward per share unit (10^18 of reward token)
        uint256 accruedRewardPerShareUnit;
    }

    /// Accumulated personal rewards available for claiming
    struct PersonRewardAccrual {
        /// Last accrual time represented by snapshotId
        uint256 lastAccrualSnaphotId;
        /// Accrued and ready for distribution reward
        uint256 accruedReward;
    }

    /// A set of PoolRewardSnapshots for every synthetic token
    mapping(address => PoolRewardSnapshot[]) public poolRewardSnapshots;
    /// A set of records of personal accumulated income.
    /// The first key is token, the second is holder address.
    mapping(address => mapping(address => PersonRewardAccrual))
        public personRewardAccruals;

    /// Pause
    bool public pause;

    /// Staking token. Both base and boost token yield reward token which ultimately participates in rewards distribution.
    SyntheticToken public stakingToken;
    /// TokenManager ref
    ITokenManager public tokenManager;
    /// EmissionManager ref
    address public emissionManager;

    /// Staking token supply in the Boardroom
    uint256 public stakingTokenSupply;
    /// Staking token balances in the Boardroom
    mapping(address => uint256) public stakingTokenBalances;

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
    ) public Timeboundable(_start, 0) {
        stakingToken = SyntheticToken(_stakingToken);
        tokenManager = ITokenManager(_tokenManager);
        emissionManager = _emissionManager;
    }

    // ------- Modifiers ----------

    /// Checks if pause is set
    modifier unpaused() {
        require(!pause, "Boardroom operations are paused");
        _;
    }

    // ------- Public ----------

    /// Funds available for user to withdraw
    /// @param syntheticTokenAddress the token we're looking up balance for
    /// @param owner the owner of the token
    function availableForWithdraw(address syntheticTokenAddress, address owner)
        public
        view
        returns (uint256)
    {
        PersonRewardAccrual storage accrual =
            personRewardAccruals[syntheticTokenAddress][owner];
        PoolRewardSnapshot[] storage tokenSnapshots =
            poolRewardSnapshots[syntheticTokenAddress];
        if (tokenSnapshots.length == 0) {
            return 0;
        }
        PoolRewardSnapshot storage lastSnapshot =
            tokenSnapshots[tokenSnapshots.length.sub(1)];
        uint256 lastOverallRPSU = lastSnapshot.accruedRewardPerShareUnit;
        PoolRewardSnapshot storage lastAccrualSnapshot =
            tokenSnapshots[accrual.lastAccrualSnaphotId];
        uint256 lastUserAccrualRPSU =
            lastAccrualSnapshot.accruedRewardPerShareUnit;
        uint256 deltaRPSU = lastOverallRPSU.sub(lastUserAccrualRPSU);
        uint256 addedUserReward =
            stakingTokenBalances[owner].mul(deltaRPSU).div(
                uint256(10)**stakingToken.decimals()
            );
        return accrual.accruedReward.add(addedUserReward);
    }

    /// Stake tokens into Boardroom
    /// @param to the receiver of the token
    /// @param amount amount of staking token
    function stake(address to, uint256 amount)
        public
        nonReentrant
        inTimeBounds
        unpaused
    {
        require((amount > 0), "Boardroom: amount should be > 0");
        updateAccruals();
        stakingTokenBalances[to] = stakingTokenBalances[to].add(amount);
        stakingTokenSupply = stakingTokenSupply.add(amount);
        _doStakeTransfer(msg.sender, amount);
        emit Staked(msg.sender, to, amount);
    }

    function _doStakeTransfer(address from, uint256 amount) internal virtual;

    function _doWithdrawTransfer(address to, uint256 amount) internal virtual;

    /// Withdraw tokens from Boardroom
    /// @param to the receiver of the token
    /// @param amount amount of base token
    function withdraw(address to, uint256 amount) public nonReentrant {
        require((amount > 0), "Boardroom: amount should be > 0");
        updateAccruals();
        stakingTokenBalances[msg.sender] = stakingTokenBalances[msg.sender].sub(
            amount
        );
        stakingTokenSupply = stakingTokenSupply.sub(amount);
        _doWithdrawTransfer(to, amount);
        emit Withdrawn(msg.sender, to, amount);
    }

    /// Update accrued rewards for all tokens of sender
    function updateAccruals() public unpaused {
        address[] memory tokens = tokenManager.allTokens();
        for (uint256 i = 0; i < tokens.length; i++) {
            _updateAccrual(tokens[i], msg.sender);
        }
    }

    /// Transfer all rewards to sender
    function claimRewards() public nonReentrant unpaused {
        address[] memory tokens = tokenManager.allTokens();
        for (uint256 i = 0; i < tokens.length; i++) {
            _claimReward(tokens[i]);
        }
    }

    // ------- Public, EmissionManager ----------

    /// Notify Boardroom about new incoming reward for token
    /// @param token Rewards denominated in this token
    /// @param amount The amount of rewards
    function notifyTransfer(address token, uint256 amount) external override {
        require(
            msg.sender == address(emissionManager),
            "Boardroom: can only be called by EmissionManager"
        );
        require(
            stakingTokenSupply > 0,
            "Boardroom: Cannot receive incoming reward when token balance is 0"
        );
        PoolRewardSnapshot[] storage tokenSnapshots =
            poolRewardSnapshots[token];
        PoolRewardSnapshot storage lastSnapshot =
            tokenSnapshots[tokenSnapshots.length - 1];
        uint256 deltaRPSU =
            amount.mul(uint256(10)**stakingToken.decimals()).div(
                stakingTokenSupply
            );
        tokenSnapshots.push(
            PoolRewardSnapshot({
                timestamp: block.timestamp,
                addedSyntheticReward: amount,
                accruedRewardPerShareUnit: lastSnapshot
                    .accruedRewardPerShareUnit
                    .add(deltaRPSU)
            })
        );
        emit IncomingBoardroomReward(token, msg.sender, amount);
    }

    // ------- Public, Owner (timelock) ----------

    /// Updates TokenManager
    /// @param _tokenManager new TokenManager
    function setTokenManager(address _tokenManager) public onlyOwner {
        tokenManager = ITokenManager(_tokenManager);
        emit UpdatedTokenManager(msg.sender, _tokenManager);
    }

    /// Updates EmissionManager
    /// @param _emissionManager new EmissionManager
    function setEmissionManager(address _emissionManager) public onlyOwner {
        emissionManager = _emissionManager;
        emit UpdatedEmissionManager(msg.sender, _emissionManager);
    }

    // ------- Public, Operator (multisig) ----------

    /// Set pause
    /// @param _pause pause value
    function setPause(bool _pause) public onlyOperator {
        pause = _pause;
        emit UpdatedPause(msg.sender, _pause);
    }

    // ------- Internal ----------

    function _claimReward(address syntheticTokenAddress) internal {
        uint256 reward =
            personRewardAccruals[syntheticTokenAddress][msg.sender]
                .accruedReward;
        if (reward > 0) {
            personRewardAccruals[syntheticTokenAddress][msg.sender]
                .accruedReward = 0;
            SyntheticToken token = SyntheticToken(syntheticTokenAddress);
            token.transfer(msg.sender, reward);
            emit RewardPaid(syntheticTokenAddress, msg.sender, reward);
        }
    }

    function _updateAccrual(address syntheticTokenAddress, address owner)
        internal
    {
        PersonRewardAccrual storage accrual =
            personRewardAccruals[syntheticTokenAddress][owner];
        PoolRewardSnapshot[] storage tokenSnapshots =
            poolRewardSnapshots[syntheticTokenAddress];
        if (tokenSnapshots.length == 0) {
            tokenSnapshots.push(
                PoolRewardSnapshot({
                    timestamp: block.timestamp,
                    addedSyntheticReward: 0,
                    accruedRewardPerShareUnit: 0
                })
            );
        }
        if (accrual.lastAccrualSnaphotId == tokenSnapshots.length - 1) {
            return;
        }
        PoolRewardSnapshot storage lastSnapshot =
            tokenSnapshots[tokenSnapshots.length - 1];
        uint256 lastOverallRPSU = lastSnapshot.accruedRewardPerShareUnit;
        PoolRewardSnapshot storage lastAccrualSnapshot =
            tokenSnapshots[accrual.lastAccrualSnaphotId];
        uint256 lastUserAccrualRPSU =
            lastAccrualSnapshot.accruedRewardPerShareUnit;
        uint256 deltaRPSU = lastOverallRPSU.sub(lastUserAccrualRPSU);
        uint256 addedUserReward =
            stakingTokenBalances[owner].mul(deltaRPSU).div(
                uint256(10)**stakingToken.decimals()
            );
        accrual.lastAccrualSnaphotId = tokenSnapshots.length - 1;
        accrual.accruedReward = accrual.accruedReward.add(addedUserReward);
        emit RewardAccrued(
            syntheticTokenAddress,
            owner,
            addedUserReward,
            accrual.accruedReward
        );
    }

    // ------- Events ----------

    event RewardAccrued(
        address syntheticTokenAddress,
        address to,
        uint256 incrementalReward,
        uint256 totalReward
    );
    event RewardPaid(
        address indexed syntheticTokenAddress,
        address indexed to,
        uint256 reward
    );
    event IncomingBoardroomReward(
        address indexed token,
        address indexed from,
        uint256 amount
    );
    event Staked(address indexed from, address indexed to, uint256 amount);
    event Withdrawn(address indexed from, address indexed to, uint256 amount);
    event UpdatedPause(address indexed operator, bool pause);
    event UpdatedTokenManager(
        address indexed operator,
        address newTokenManager
    );
    event UpdatedEmissionManager(
        address indexed operator,
        address newEmissionManager
    );
}
