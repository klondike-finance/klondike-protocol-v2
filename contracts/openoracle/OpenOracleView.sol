// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.6.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./OpenOraclePriceData.sol";
import "../access/Operatable.sol";

/**
 * @title The Open Oracle View Base Contract
 * @author Compound Labs, Inc.
 */
contract OpenOracleView is Operatable {
    using SafeMath for uint256;
    /**
     * @notice The Oracle Data Contract backing this View
     */
    OpenOraclePriceData public priceData;

    /**
     * @notice The static list of sources used by this View
     * @dev Note that while it is possible to create a view with dynamic sources,
     *  that would not conform to the Open Oracle Standard specification.
     */
    address[] public sources;

    /**
     * @notice Construct a view given the oracle backing address and the list of sources
     * @dev According to the protocol, Views must be immutable to be considered conforming.
     * @param data_ The address of the oracle data contract which is backing the view
     */
    constructor(OpenOraclePriceData data_) public {
        priceData = data_;
    }

    /// Normalized to 10^18
    function getUnitPriceAPerB(string memory tokenA, string memory tokenB) public view returns (uint256) {
        uint256 priceA = getUSDPrice(tokenA);
        uint256 priceB = getUSDPrice(tokenB);
        require(priceA != 0, "OpenOracleView: no data for token A");
        require(priceB != 0, "OpenOracleView: no data for token B");
        return priceA.mul(1 ether).div(priceB);
    }

    /// Normalize to 10^6
    function getUSDPrice(string memory token) public view returns (uint256) {
        uint[] memory values = new uint[](sources.length);
        uint j;
        for (uint i = 0; i < sources.length; i++) {
            uint256 price = priceData.getPrice(sources[i], token);
            if (price != 0) {
                values[j] = price;
                j++;
            }
        }
        if (j == 0) {
            return 0;
        }
        _quickSort(values, 0, int(j - 1));
        return values[(j - 1) / 2];
    }

    function addSource(address source) public onlyOperator {
        for (uint i = 0; i < sources.length; i++) {
            if (sources[i] == source) {
                return;
            }
        }
        sources.push(source);
        emit SourceAdded(operator, source);
    }
    function deleteSource(address source) public onlyOperator {
        for (uint i = 0; i < sources.length; i++) {
            if (sources[i] == source) {
                delete sources[i];
            }
        }
        emit SourceDeleted(operator, source);
    }

    function sort(uint[] memory data) public pure returns(uint[] memory) {
       _quickSort(data, int(0), int(data.length - 1));
       return data;
    }

    function _quickSort(uint[] memory arr, int left, int right) internal pure {
        int i = left;
        int j = right;
        if (i == j) return;
        uint pivot = arr[uint(left + (right - left) / 2)];
        while (i <= j) {
            while (arr[uint(i)] < pivot) i++;
            while (pivot < arr[uint(j)]) j--;
            if (i <= j) {
                (arr[uint(i)], arr[uint(j)]) = (arr[uint(j)], arr[uint(i)]);
                i++;
                j--;
            }
        }
        if (left < j)
            _quickSort(arr, left, j);
        if (i < right)
            _quickSort(arr, i, right);
    }

    event SourceAdded(address indexed operator, address source);
    event SourceDeleted(address indexed operator, address source);
}