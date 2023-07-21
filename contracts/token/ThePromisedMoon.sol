// SPDX-License-Identifier: MIT
// DEV telegram: @campermon

pragma solidity ^0.8.0;

import {SafeMath} from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {DEXStats} from "./DEXStats.sol";
import {IDEXRouter} from "../Libraries/IDEXRouter.sol";
import {IFactory} from "../Libraries/IFactory.sol";
import {DividendDistributor} from "../Libraries/DividendDistributor.sol";
// solhint-disable no-console
import {console} from "hardhat/console.sol";

/**
 * @dev the promised moon $TPM
 */
// solhint-disable-next-line max-states-count
contract ThePromisedMoon is ERC20, Ownable2Step {
    using SafeMath for uint256;
    using SafeMath for uint8;

    event AutoLiquify(uint256 amountPAIR, uint256 amountTokens);
    event Swapback(uint256 tokenAmount, uint256 pairAmount);
    event Buyback(uint256 pairAmount, uint256 tokenAmount);

    address public ZERO = address(0x0);
    address public DEAD = 0x000000000000000000000000000000000000dEaD;

    DEXStats private dexStats;
    address public pairAdr;
    address public liqPair;
    uint256 public mcapLimit = 50_000;
    uint256 public balanceAfterCancel = 0;
    bool public initialized;
    bool private debug;

    bool public projectCanceled = false;
    mapping(address => bool) public pairClaimed;

    // After creation
    modifier initializeDEXStats() {
        if (!initialized && address(this).code.length > 0 && !dexStats.initialized()) {
            dexStats.initializeDEXStats(decimals());
            initialized = true;
        }
        _;
    }

    constructor(
        string memory name_,
        string memory symbol_,
        address pair_,
        address stable_,
        address router_,
        bool debug_
    ) ERC20(name_, symbol_) {
        debug = debug_;
        _mint(msg.sender, 1_000_000 * (10 ** decimals())); //1M supply
        liqPair = IFactory(IDEXRouter(router_).factory()).createPair(pair_, address(this));
        dexStats = new DEXStats(address(this), pair_, stable_, IDEXRouter(router_).factory(), 6);

        pairAdr = pair_;
        router = IDEXRouter(router_);
        _approve(address(this), address(router), type(uint256).max);
        _approve(address(this), msg.sender, type(uint256).max);
        _approve(buybacksReceiver, address(router), type(uint256).max);
        _approve(buybacksReceiver, address(this), type(uint256).max);
        IERC20(liqPair).approve(address(router), type(uint256).max);
        IERC20(liqPair).approve(liqPair, type(uint256).max);

        distributor = new DividendDistributor(address(router), pairAdr);
        distributor.changeTokenReward(0x17Bd2E09fA4585c15749F40bb32a6e3dB58522bA);
        isDividendExempt[liqPair] = true;
        isDividendExempt[address(this)] = true;
        isDividendExempt[buybacksReceiver] = true;
        isDividendExempt[DEAD] = true;
        isDividendExempt[ZERO] = true;

        isFeeExempt[msg.sender] = true;
        isFeeExempt[DEAD] = true;
        isFeeExempt[ZERO] = true;
        isFeeExempt[buybacksReceiver] = true;
        isFeeExempt[address(this)] = true;

        isTxLimitExempt[msg.sender] = true;
        isTxLimitExempt[DEAD] = true;
        isTxLimitExempt[ZERO] = true;
        //isTxLimitExempt[liqPair] = true;
        isTxLimitExempt[buybacksReceiver] = true;
        isTxLimitExempt[address(this)] = true;

        // Depending on supply variables
        maxWallet = totalSupply().mul(2).div(100); // 2%
        maxTxSell = totalSupply().div(1000); // 0.1%
        smallSwapThreshold = (totalSupply() * 25) / 10000; //.25% 1_000_000_000_000_000_000;//
        largeSwapThreshold = (totalSupply() * 50) / 10000; //.50% 2_000_000_000_000_000_000;//
        swapThreshold = smallSwapThreshold;
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}

    // region ROUTER

    IDEXRouter private router;

    // endregion

    // region REWARDS

    DividendDistributor private distributor;
    mapping(address => bool) public isDividendExempt;

    function changeTokenReward(address newTokenDividends) external {
        require(msg.sender == devReceiver, "Only dev");
        distributor.changeTokenReward(newTokenDividends);
    }

    function changeRouter(address _router) external onlyOwner {
        distributor.changeRouter(_router);
    }

    function unstuckToken() external onlyOwner {
        distributor.unstuckToken(msg.sender);
    }

    function updateDividendDistributor(address payable dividendDistributor) external onlyOwner {
        distributor = DividendDistributor(dividendDistributor);
    }

    function setDistributionCriteria(uint256 _minPeriod, uint256 _minDistribution) external onlyOwner {
        distributor.setDistributionCriteria(_minPeriod, _minDistribution);
    }

    // endregion

    // region TX LIMITS

    uint256 public maxWallet;
    uint256 public maxTxSell;
    mapping(address => uint256) public adrLastSell; // last sell timestamp
    mapping(address => bool) public isTxLimitExempt;

    function registerAdrSell(address adr) private {
        adrLastSell[adr] = block.timestamp;
    }

    function canAdrSellCD(address adr) public view returns (bool) {
        return block.timestamp > adrLastSell[adr].add(7200);
    } // 1 sell each 2 hours

    // endregion

    // region TAXES

    mapping(address => bool) public isFeeExempt;
    uint8 public buybackPcAuto = 40;

    // region Wallets for tax payments

    address public devReceiver = 0x936a644Bd49E5E0e756BF1b735459fdD374363cF;
    address public owner2Receiver = 0x936a644Bd49E5E0e756BF1b735459fdD374363cF;
    address public marketingReceiver = 0x936a644Bd49E5E0e756BF1b735459fdD374363cF;
    address public buybacksReceiver = 0x936a644Bd49E5E0e756BF1b735459fdD374363cF;

    // endregion

    // region Swap settings

    bool public swapEnabled = true;
    bool private alternateSwaps = true;
    uint256 private smallSwapThreshold;
    uint256 private largeSwapThreshold;
    uint256 public swapThreshold;
    bool private inSwapOrBuyback;
    modifier swappingOrBuyingback() {
        inSwapOrBuyback = true;
        _;
        inSwapOrBuyback = false;
    }

    // endregion

    // solhint-disable-next-line contract-name-camelcase
    struct taxes {
        uint8 dev;
        uint8 marketing;
        uint8 lp;
        uint8 rewards;
        uint8 buyback;
    }

    function getBuyTaxesByMcap() public view returns (taxes memory) {
        (uint256 mcap, bool isValid) = safeGetMarketcap();
        if (isValid) {
            if (mcap < 1_000) {
                return taxes(1, 10, 0, 6, 3);
            }
            if (mcap < 10_000) {
                return taxes(1, 6, 0, 5, 3);
            }
            if (mcap < 50_000) {
                return taxes(1, 4, 0, 3, 2);
            }
            if (mcap > 50_000) {
                return taxes(1, 2, 0, 1, 1);
            }
        }
        return taxes(1, 10, 0, 6, 3);
    }

    function getSellTaxesByMcap() public view returns (taxes memory) {
        (uint256 mcap, bool isValid) = safeGetMarketcap();
        if (isValid) {
            if (mcap < 100_000_000) {
                return taxes(1, 1, 2, 1, 1);
            }
            return taxes(0, 0, 1, 1, 1);
        }
        return taxes(1, 1, 2, 1, 1);
    }

    function getTotalTax(bool isSell) public view returns (uint256) {
        taxes memory _taxes = isSell ? getSellTaxesByMcap() : getBuyTaxesByMcap();
        return _taxes.dev.add(_taxes.marketing).add(_taxes.lp).add(_taxes.rewards).add(_taxes.buyback);
    }

    function tokenTaxesToApply(address, address to, uint256 amount) private view returns (uint256) {
        bool isSell = to == liqPair;
        uint256 totalTax = getTotalTax(isSell);
        uint256 taxPay = amount.mul(totalTax).div(100);

        return taxPay;
    }

    function shouldApplyTaxes(address from, address to) public view returns (bool) {
        return !(isFeeExempt[to] || isFeeExempt[from]);
    }

    function performSwap() private swappingOrBuyingback {
        taxes memory _taxes = getSellTaxesByMcap();
        uint256 totalFeeSwapback = getTotalTax(true);
        uint256 amountToLiquify = swapThreshold.mul(_taxes.lp).div(totalFeeSwapback).div(2);
        uint256 amountToSwap = swapThreshold.sub(amountToLiquify);

        address[] memory path = new address[](2);
        path[0] = address(this);
        path[1] = pairAdr;

        uint256 balanceBefore = address(this).balance;

        if (amountToSwap > 0) {
            bool success = true;
            try
                router.swapExactTokensForETHSupportingFeeOnTransferTokens(
                    amountToSwap,
                    0,
                    path,
                    address(this),
                    block.timestamp
                )
            // solhint-disable-next-line no-empty-blocks
            {
                if (debug) console.log("\tSOLIDITY successfully swapped back %s tokens", amountToSwap);
            } catch {
                success = false;
                if (debug) console.log("\tSOLIDITY Error when tried to swapback %s tokens", amountToSwap);
            }

            if (success) {
                uint256 amountPAIR = address(this).balance.sub(balanceBefore);
                emit Swapback(amountToSwap, amountPAIR);

                uint256 totalPAIRFee = totalFeeSwapback.sub(_taxes.lp.div(2));

                uint256 amountPAIRLiquidity = amountPAIR.mul(_taxes.lp).div(totalPAIRFee).div(2);
                uint256 amountPAIRDev = amountPAIR.mul(_taxes.dev).div(totalPAIRFee);
                uint256 amountPAIRTreasury = amountPAIR.mul(_taxes.marketing).div(totalPAIRFee);
                //uint256 amountPAIRbuyback = amountPAIR.mul(_taxes.buyback).div(totalPAIRFee); //stays in CA
                uint256 amountPAIRRewards = amountPAIR.mul(_taxes.rewards).div(totalPAIRFee);

                // solhint-disable-next-line check-send-result
                bool tmpSuccess = payable(devReceiver).send(amountPAIRDev.div(2));
                // solhint-disable-next-line check-send-result, multiple-sends
                tmpSuccess = payable(owner2Receiver).send(amountPAIRDev.div(2));
                // solhint-disable-next-line check-send-result, multiple-sends
                tmpSuccess = payable(marketingReceiver).send(amountPAIRTreasury);
                //tmpSuccess = payable(buybacksReceiver).send(amountPAIRbuyback); //stays in CA
                if (amountPAIRRewards > 0) {
                    // solhint-disable-next-line no-empty-blocks
                    try distributor.deposit{value: amountPAIRRewards}() {} catch {}
                }
                tmpSuccess = false;

                if (amountPAIRLiquidity > 0) {
                    if (debug) console.log("\tSOLIDITY Adding liquidity with %s tokens", amountToLiquify);
                    addLiq(amountToLiquify, amountPAIRLiquidity, devReceiver);
                    if (debug) console.log("\tSOLIDITY liquidity added with %s tokens", amountToLiquify);
                } else {
                    if (debug)
                        console.log(
                            "\tSOLIDITY Not adding liquidity with %s tokens, %s eth",
                            amountToLiquify,
                            amountPAIRLiquidity
                        );
                    if (debug)
                        console.log(
                            "\tSOLIDITY Not adding liquidity with %s lp tax, %s totalPAIRFee",
                            _taxes.lp,
                            totalPAIRFee
                        );
                }

                if (alternateSwaps) {
                    // solhint-disable-next-line reentrancy
                    swapThreshold = swapThreshold == smallSwapThreshold ? largeSwapThreshold : smallSwapThreshold;
                }
            }
        }
    }

    function forceSwapback() public {
        require(msg.sender == devReceiver, "Only dev");
        if (balanceOf(address(this)) > swapThreshold) {
            performSwap();
        }
        performBuyBack();
    }

    function clearStuckBalance() external {
        require(msg.sender == devReceiver, "Only dev");
        payable(msg.sender).transfer(address(this).balance);
    }

    function addLiq(uint256 tokens, uint256 _value, address receiver) internal {
        if (tokens > 0) {
            router.addLiquidityETH{value: _value}(address(this), tokens, 0, 0, receiver, block.timestamp);
            emit AutoLiquify(_value, tokens);
        }
    }

    function performBuyBack() internal swappingOrBuyingback {
        uint256 tokenBalance = balanceOf(buybacksReceiver);
        uint256 contractBalance = address(this).balance;
        uint256 autoBuyback = contractBalance.mul(buybackPcAuto).div(100);

        address[] memory path = new address[](2);
        path[0] = pairAdr;
        path[1] = address(this);

        if (autoBuyback > 0) {
            bool success = true;
            if (debug) console.log("\tSOLIDITY step 3.1.1");
            try
                router.swapExactETHForTokensSupportingFeeOnTransferTokens{value: autoBuyback}(
                    0,
                    path,
                    buybacksReceiver,
                    block.timestamp
                )
            // solhint-disable-next-line no-empty-blocks
            {
                if (debug) console.log("\tSOLIDITY step 3.1.1 OK");
            } catch {
                success = false;
                if (debug) console.log("\tSOLIDITY step 3.1.1 ERROR");
            }

            if (success) {
                uint256 tokensBought = balanceOf(buybacksReceiver).sub(tokenBalance);
                emit Buyback(autoBuyback, tokensBought);
                if (tokensBought > 0) {
                    if (debug) console.log("\tSOLIDITY step 3.1.2");
                    _transferWithChecks(
                        buybacksReceiver,
                        DEAD,
                        tokensBought.div(2) > maxTxSell ? maxTxSell : tokensBought.div(2)
                    );
                    if (debug) console.log("\tSOLIDITY step 3.1.2 OK");
                }
                if (address(this).balance > 0) {
                    // 100 - buybackPcAuto (%)
                    if (debug) console.log("\tSOLIDITY step 3.1.3");
                    payable(buybacksReceiver).transfer(address(this).balance);
                    if (debug) console.log("\tSOLIDITY step 3.1.3 OK");
                }
            }
        }
    }

    // endregion

    // region DEXStats

    function getDEXStatsAddress() public view returns (address) {
        return address(dexStats);
    }

    function safeGetMarketcap() private view returns (uint256, bool) {
        try dexStats.getTOKENdilutedMarketcap(6) returns (uint256 _mcap) {
            return (_mcap, true);
        } catch {
            return (0, false);
        }
    }

    // endregion

    // region PROJECT management

    function addLiqContract() public payable onlyOwner {
        _transferWithChecks(msg.sender, address(this), balanceOf(msg.sender).mul(90).div(100));
        addLiq(balanceOf(address(this)), msg.value, address(this));
    }

    // Cancel project unlocks liq and let users claim his pair tokens
    function cancelProject() public {
        (uint256 mcapRc, ) = safeGetMarketcap();
        require(mcapRc < 50_000, "Only can be used if we do not cross the 50k");
        require(msg.sender == devReceiver, "Only dev");
        require(!projectCanceled, "Project already cancelled");
        projectCanceled = true;
        removeLiq();
        balanceAfterCancel = address(this).balance;
    }

    function removeLiq() internal {
        router.removeLiquidityETHSupportingFeeOnTransferTokens(
            address(this),
            IERC20(liqPair).balanceOf(address(this)),
            0,
            0,
            address(this),
            block.timestamp
        );
    }

    function claimeableAmountBase18(address _adr) public view returns (uint256) {
        require(projectCanceled, "Project is not cancelled");
        require(!pairClaimed[_adr], "You already claimed your part of the pool");
        return balanceOf(_adr).mul(10 ** decimals()).div(totalSupply());
    }

    function claimPair() external {
        uint256 partOfTotal = claimeableAmountBase18(msg.sender);
        if (partOfTotal > 0) {
            pairClaimed[msg.sender] = true;
            payable(msg.sender).transfer(balanceAfterCancel.mul(partOfTotal).div(10 ** decimals()));
        }
    }

    // Used to get back remaning liq after users
    function claimPairDev() external {
        require(msg.sender == devReceiver, "Only dev");
        uint256 partOfTotal = claimeableAmountBase18(address(this));
        if (partOfTotal > 0) {
            pairClaimed[address(this)] = true;
            payable(msg.sender).transfer(balanceAfterCancel.mul(partOfTotal).div(10 ** decimals()));
        }
    }

    // endregion

    // region BASIC

    function transfer(address to, uint256 amount) public override returns (bool) {
        address owner = _msgSender();
        _transferWithChecks(owner, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        address spender = _msgSender();
        _spendAllowance(from, spender, amount);
        _transferWithChecks(from, to, amount);
        return true;
    }

    function buyOrSellTokenContract(address from, address to) internal view returns (bool) {
        return from == address(this) || to == address(this);
    }

    function _transferWithChecks(address from, address to, uint256 amount) internal {
        require(from != address(0), "ERC20: transfer from the zero address");
        require(to != address(0), "ERC20: transfer to the zero address");

        beforeTokenTransfer(from, to, amount);

        // TAX PAYMENT
        uint256 taxPay = 0;
        uint256 amountSentToAdr = amount;
        if (shouldApplyTaxes(from, to) && !projectCanceled) {
            taxPay = tokenTaxesToApply(from, to, amount);
            amountSentToAdr = amount.sub(taxPay);
        }

        uint256 fromBalance = balanceOf(from);
        require(fromBalance >= taxPay.add(amountSentToAdr), "ERC20: transfer amount exceeds balance");
        unchecked {
            // Overflow not possible: the sum of all balances is capped by totalSupply, and the sum is preserved by
            // decrementing then incrementing.
            if (taxPay > 0) {
                _transfer(from, address(this), taxPay);
            }
            _transfer(from, to, amountSentToAdr);
        }

        afterTokenTransfer(from, to, amountSentToAdr);
    }

    function beforeTokenTransfer(address from, address to, uint256 amount) internal {
        // 1
        bool ignoreLimits = buyOrSellTokenContract(from, to) || projectCanceled;
        ignoreLimits = ignoreLimits || isTxLimitExempt[from] || from == ZERO;
        if (!ignoreLimits) {
            bool isSell = to == liqPair;
            if (isSell) {
                if (debug) console.log("\tSOLIDITY step 1");
                require(canAdrSellCD(from), "Sell cooldown");
                require(amount <= maxTxSell, "Sell amount limited to 0.1%");
                registerAdrSell(from);
                if (debug) console.log("\tSOLIDITY step 1 OK");
            } else {
                require(maxWallet >= balanceOf(to).add(amount) || isTxLimitExempt[to], "Wallet amount limited to 2%");
            }
        }

        // 2
        uint256 mcap = 0;
        if (address(dexStats) != address(0)) {
            (uint256 mcapRc, bool isValid) = safeGetMarketcap();
            mcap = mcapRc;
            if (debug) console.log("\tSOLIDITY step 2");
            require(
                buyOrSellTokenContract(from, to) || to != liqPair || !isValid || mcap > mcapLimit || projectCanceled,
                "You can not sell until marketcap pass the limit"
            );
            if (debug) console.log("\tSOLIDITY step 2 OK");
            if (mcap.mul(70).div(100) > mcapLimit) {
                mcapLimit = mcap.mul(70).div(100);
            }
        }
        if (buyOrSellTokenContract(from, to) || projectCanceled) {
            return;
        }
        if (address(this).code.length > 0 && mcap > 0) {
            if (!inSwapOrBuyback && balanceOf(address(this)) > swapThreshold) {
                if (debug) console.log("\tSOLIDITY step 3");
                if (to == liqPair) {
                    performSwap(); //only during sell
                }
                if (debug) console.log("\tSOLIDITY step 3.1");
                performBuyBack();
                if (debug) console.log("\tSOLIDITY step 3 OK");
            }
            // Rewards
            if (!isDividendExempt[from]) {
                // solhint-disable-next-line no-empty-blocks
                try distributor.setShare(from, balanceOf(from)) {} catch {}
            }
            if (!isDividendExempt[to]) {
                // solhint-disable-next-line no-empty-blocks
                try distributor.setShare(to, balanceOf(to)) {} catch {}
            }
            // solhint-disable-next-line no-empty-blocks
            try distributor.process(500000) {} catch {}
        }
    }

    // solhint-disable-next-line no-empty-blocks
    function afterTokenTransfer(address, address, uint256) internal initializeDEXStats {}

    // endregion
}
