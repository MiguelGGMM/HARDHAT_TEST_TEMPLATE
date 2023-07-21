// SPDX-License-Identifier: MIT
// DEV telegram: @campermon

pragma solidity ^0.8.0;

import {IDEXRouter} from "../Libraries/IDEXRouter.sol";
import {ILiqPair} from "../Libraries/ILiqPair.sol";
import {IFactory} from "../Libraries/IFactory.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeMath} from "@openzeppelin/contracts/utils/math/SafeMath.sol";

/**
 * @dev You can use this contract to check the price mcap of a token against DEX (PANCAKESWAPV2 contract supported).
 * WARNING: PANCAKESWAPV2 contract update his reserves after token buy/sell transaction, so if you call this methods inside
 * token contract transfer methods you will get data before the current transaction (outdated)
 */

contract DEXStats {
    using SafeMath for uint256;

    // Decimals for price calculation
    uint8 internal decimalsPrecision = 6;

    // Contracts
    IERC20Metadata private TOKEN;
    IERC20Metadata private PAIR;
    IERC20Metadata private STABLE;
    ILiqPair private liqPairWethToken;
    ILiqPair private liqPairWethStable;
    IFactory private factory;

    // Others
    uint256 private decsDiffPairToken;
    bool private decsDiffPairTokenDiv;
    uint256 private decsDiffPairStable;
    bool private decsDiffPairStableDiv;

    uint8 private tokenDecs;
    bool public initialized;

    modifier notInitialized() {
        require(!initialized, "Already initialized");
        _;
    }

    modifier onlyToken() {
        require(msg.sender == address(TOKEN), "Only token");
        _;
    }

    constructor(address token_, address pair_, address stable_, address factory_, uint8 decimalsPrecision_) {
        TOKEN = IERC20Metadata(token_);
        PAIR = IERC20Metadata(pair_);
        STABLE = IERC20Metadata(stable_);
        factory = IFactory(factory_);
        decimalsPrecision = decimalsPrecision_;
    }

    function setLiqPairToken() private {
        address liqPairToken = factory.getPair(address(TOKEN), address(PAIR));
        liqPairWethToken = ILiqPair(liqPairToken);
        uint8 decsToken0 = IERC20Metadata(liqPairWethToken.token0()).decimals();
        uint8 decsToken1 = IERC20Metadata(liqPairWethToken.token1()).decimals();
        if (decsToken1 > decsToken0) {
            decsDiffPairToken = 10 ** (decsToken1 - decsToken0);
            decsDiffPairTokenDiv = true;
        } else {
            decsDiffPairToken = 10 ** (decsToken0 - decsToken1);
            decsDiffPairTokenDiv = false;
        }
    }

    function setLiqPairStable() private {
        address liqPairStable = factory.getPair(address(STABLE), address(PAIR));
        liqPairWethStable = ILiqPair(liqPairStable);
        uint8 decsToken0 = IERC20Metadata(liqPairWethStable.token0()).decimals();
        uint8 decsToken1 = IERC20Metadata(liqPairWethStable.token1()).decimals();
        if (decsToken0 > decsToken1) {
            decsDiffPairStable = 10 ** (decsToken0 - decsToken1);
            decsDiffPairStableDiv = false;
        } else {
            decsDiffPairStable = 10 ** (decsToken1 - decsToken0);
            decsDiffPairStableDiv = true;
        }
    }

    function initializeDEXStats(uint8 _decimals) external notInitialized onlyToken {
        setLiqPairToken();
        setLiqPairStable();
        tokenDecs = _decimals;
    }

    function getReservesPairToken() public view returns (uint256, uint256) {
        (uint256 token0, uint256 token1, ) = liqPairWethToken.getReserves();
        return liqPairWethToken.token1() != address(TOKEN) ? (token1, token0) : (token0, token1);
    }

    function getReservesPairStable() public view returns (uint256, uint256) {
        (uint256 token0, uint256 token1, ) = liqPairWethStable.getReserves();
        return liqPairWethStable.token1() != address(STABLE) ? (token1, token0) : (token0, token1);
    }

    // Get WETH price
    function getWETHprice(uint8 _decimalsPrecision) public view returns (uint256) {
        (uint256 wethAmount, uint256 stableAmount) = getReservesPairStable(); //WETH/STABLE
        stableAmount = decsDiffPairStableDiv
            ? stableAmount.div(decsDiffPairStable)
            : stableAmount.mul(decsDiffPairStable);
        stableAmount = stableAmount.mul(10 ** _decimalsPrecision);
        return stableAmount.div(wethAmount);
    }

    // Get TOKEN price
    function getTOKENprice(uint8 _decimalsPrecision) public view returns (uint256) {
        (uint256 wethAmount, uint256 tokenAmount) = getReservesPairToken(); //WETH/TOKEN
        wethAmount = decsDiffPairTokenDiv ? wethAmount.div(decsDiffPairToken) : wethAmount.mul(decsDiffPairToken);
        uint256 wethAmountDollars = wethAmount.mul(getWETHprice(_decimalsPrecision));
        return wethAmountDollars.div(tokenAmount);
    }

    // Get user TOKEN holdings
    function getTOKENholdings(address _adr) public view returns (uint256) {
        return TOKEN.balanceOf(_adr);
    }

    // Get user TOKEN holdings dollars
    function getTOKENholdingsDollar(address _adr) public view returns (uint256) {
        uint256 _holdings = getTOKENholdings(_adr);
        uint256 _tokenPriceDeffdecs = getTOKENprice(decimalsPrecision);
        return _holdings.mul(_tokenPriceDeffdecs).div(10 ** decimalsPrecision).div(10 ** tokenDecs);
    }

    // Dollars to TOKEN
    function getTOKENfromDollars(uint256 _dollars) public view returns (uint256) {
        if (_dollars == 0) {
            return 0;
        }
        uint256 tokenPriceDecs = getTOKENprice(decimalsPrecision);
        return _dollars.mul(10 ** decimalsPrecision).mul(10 ** tokenDecs).div(tokenPriceDecs);
    }

    // TOKEN to dollars
    function getDollarsFromTOKEN(uint256 _token) public view returns (uint256) {
        if (_token == 0) {
            return 0;
        }
        uint256 tokenPriceDecs = getTOKENprice(decimalsPrecision);
        return _token.mul(tokenPriceDecs).div(10 ** tokenDecs).div(10 ** decimalsPrecision);
    }

    // Marketcap
    function getTOKENdilutedMarketcap(uint8 _decimalsPrecision) public view returns (uint256) {
        return
            TOKEN.totalSupply().mul(getTOKENprice(_decimalsPrecision)).div(10 ** tokenDecs).div(
                10 ** _decimalsPrecision
            );
    }
}
