// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IDividendDistributor {
    function setDistributionCriteria(uint256 _minPeriod, uint256 _minDistribution) external;

    function setShare(address shareholder, uint256 amount) external;

    function deposit() external payable;

    function process(uint256 gas) external;

    function changeTokenReward(address newTokenDividends) external;

    function changeRouter(address _router) external;

    function unstuckToken(address _receiver) external;
}
