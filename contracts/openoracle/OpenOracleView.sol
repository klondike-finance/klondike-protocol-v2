// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.6.6;

import "./OpenOraclePriceData.sol";
import "../access/Operatable.sol";

/**
 * @title The Open Oracle View Base Contract
 * @author Compound Labs, Inc.
 */
contract OpenOracleView is Operatable {
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
     * @param sources_ The list of source addresses to include in the aggregate value
     */
    constructor(OpenOraclePriceData data_, address[] memory sources_) public {
        require(sources_.length > 0, "Must initialize with sources");
        priceData = data_;
        sources = sources_;
    }

    function getPrice(address tokenA, address tokenB) public view returns (uint256) {
        (address token0, address token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);
        string memory key = string(abi.encodePacked(token0, token1));
        uint[] memory values = new uint[](sources.length);
        uint j;
        for (uint i = 0; i < sources.length; i++) {
            uint256 price = priceData.getPrice(sources[i], key);
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

    function _sort(uint[] memory data) internal pure returns(uint[] memory) {
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