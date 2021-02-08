// SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

abstract contract ReentrancyGuardable {
    mapping(uint256 => mapping(address => bool)) private _blockStatus;

    /// Checks if a function was already called in this block by tx origin
    function originReentered() internal view returns (bool) {
        return _blockStatus[block.number][tx.origin];
    }

    /// Checks if a function was already called in this block by tx sender
    function senderReentered() internal view returns (bool) {
        return _blockStatus[block.number][msg.sender];
    }

    /// Reverts if a function was called by origin or sender
    modifier onePerBlock() {
        require(
            !senderReentered(),
            "SingleBlock: one function marked as `onePerBlock` was already called in this block by this sender"
        );
        require(
            !originReentered(),
            "SingleBlock: one function marked as `onePerBlock` was already called in this block by this origin"
        );

        _;

        _blockStatus[block.number][tx.origin] = true;
        _blockStatus[block.number][msg.sender] = true;
    }
}
