//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "./SyntheticToken.sol";
import "./access/Migratable.sol";
import "./interfaces/ISmelter.sol";

contract Swap is Operatable, Migratable {
    mapping(address => address) public tokenIndex;
    address[] public tokens;
    address public smelter;

    constructor(address _smelter) public {
        smelter = _smelter;
    }

    function validPermissions() public view returns (bool) {
        for (uint256 i = 0; i < tokens.length; i++) {
            ISmelter sm = ISmelter(smelter);
            if (
                SyntheticToken(tokenIndex[tokens[i]]).owner() !=
                address(smelter)
            ) {
                return false;
            }

            if (!sm.isTokenAdmin(address(this))) {
                return false;
            }
        }
        return true;
    }

    function swap(
        address inToken,
        address outToken,
        uint256 amount
    ) public {
        require(
            tokenIndex[inToken] == outToken,
            "Swap: token pair is not swappable"
        );
        SyntheticToken inT = SyntheticToken(inToken);
        if (inT.owner() != address(smelter)) {
            inT.transferFrom(
                msg.sender,
                0x000000000000000000000000000000000000dEaD,
                amount
            );
        } else {
            inT.burnFrom(msg.sender, amount);
        }
        ISmelter(smelter).mintSynthetic(outToken, msg.sender, amount);
    }

    function setTokenPair(address inToken, address outToken)
        public
        onlyOperator
    {
        if (tokenIndex[inToken] == address(0)) {
            tokens.push(inToken);
        }
        tokenIndex[inToken] = outToken;
    }

    function setSmelter(address _smelter) public onlyOperator {
        smelter = _smelter;
    }
}
