// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IFactory {
    function getPair(address token0, address token1) external view returns (address _pair);

    function createPair(address token0, address token1) external returns (address _pair);
}
