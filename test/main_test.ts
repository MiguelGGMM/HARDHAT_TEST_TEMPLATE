import { ethers, network } from "hardhat";
import {
  DEXStats,
  DEXStats__factory,
  IERC20Metadata,
  IPairDatafeed,
  // PancakeRouter,
  ThePromisedMoon,
  IDEXRouter,
  ThePromisedMoon__factory,
} from "../typechain-types";
import { Addressable, BigNumberish, TransactionReceipt } from "ethers";
import { expect } from "chai";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { BN } from "bn.js";

const gasLimit = "5000000";
const gasPrice = "5000000000";

/* const ZERO_ADDRESS = `0x0000000000000000000000000000000000000000`;
const DEAD_ADDRESS = `0x000000000000000000000000000000000000dEaD`; */

let _ThePromisedMoon: ThePromisedMoon;
let _IERC20MetadataPair: IERC20Metadata;
let _IERC20MetadataRewards: IERC20Metadata;
let _DEXSTATS: DEXStats;
let _IDEXRouter: IDEXRouter;
let _IPAIRDATAFEED: IPairDatafeed;
let pairAdr: string;
let accounts: HardhatEthersSigner[];
let _owner: HardhatEthersSigner;

//Unique way make eth-gas-reporter work fine
const dexContractName = "IDEXRouter"; //"PancakeRouter";

const debug = process.env.DEBUG_TEST == "1";

const getAccountBalance = async (account: string) => {
  const balance = await ethers.provider.getBalance(account);
  return ethers.formatUnits(balance, "ether");
};

const BN2 = (x: BigNumberish) => new BN(x.toString());
const toWei = (value: BigNumberish) => ethers.parseEther(value.toString());
/* const fromWei = (value: BigNumberish, fixed: number = 2) =>
  parseFloat(ethers.formatUnits(value, "ether")).toFixed(fixed); */

const getBlockTimestamp = async () => {
  return (await ethers.provider.getBlock("latest"))?.timestamp;
};

/* const getBlockNumber = async () => {
  return (await ethers.provider.getBlock("latest"))?.number;
}; */

const increaseDays = async (days: number) => {
  await increase(86400 * days);
};

const increase = async (duration: number) => {
  return new Promise((resolve /* reject */) => {
    network.provider
      .request({
        method: "evm_increaseTime",
        params: [duration],
      })
      .finally(() => {
        network.provider
          .request({
            method: "evm_mine",
            params: [],
          })
          .finally(() => {
            resolve(undefined);
          });
      });
  });
};

const log = (message: string) => {
  if (debug) {
    console.log(`\t[DEBUG] ${message}`);
  }
};

describe("ThePromisedMoon", function () {
  async function deployment() {
    const thePromisedMoon = await ethers.deployContract(
      "ThePromisedMoon",
      [
        process.env.NAME,
        process.env.SYMBOL,
        process.env.PAIR,
        process.env.STABLE,
        process.env.ROUTER,
        process.env.DEBUG_SOLIDITY == "1",
      ],
      {
        gasPrice: gasPrice,
        gasLimit: "20000000",
      },
    );
    await thePromisedMoon.waitForDeployment();
    log(
      `ThePromisedMoon successfully deployed: ${
        thePromisedMoon.target
      } (by: ${await thePromisedMoon.owner()})`,
    );
    // Contracts are deployed using the first signer/account by default
    const _accounts = await ethers.getSigners();
    return { thePromisedMoon, _accounts };
  }

  async function attachContracts() {
    if (process.env.PAIR && process.env.ROUTER && process.env.PAIR_DATAFEED) {
      _IERC20MetadataPair = await ethers.getContractAt(
        "IERC20Metadata",
        process.env.PAIR,
      ); //IERC20Metadata__factory.connect(process.env.PAIR);
      _IERC20MetadataRewards = await ethers.getContractAt(
        "IERC20Metadata",
        "0x17Bd2E09fA4585c15749F40bb32a6e3dB58522bA",
      ); //IERC20Metadata__factory.connect('0x17Bd2E09fA4585c15749F40bb32a6e3dB58522bA');
      _IDEXRouter = await ethers.getContractAt(
        dexContractName,
        process.env.ROUTER,
      ); //IDEXRouter__factory.connect(process.env.ROUTER);
      _IPAIRDATAFEED = await ethers.getContractAt(
        "IPairDatafeed",
        process.env.PAIR_DATAFEED,
      ); //IPairDatafeed__factory.connect(process.env.PAIR_DATAFEED);

      log(
        `Contracts attached: Token pair, Token rewards, DEX router, Chainlink pair datafeed`,
      );
      log(
        `Addresses: ${_IERC20MetadataPair.target}, ${_IERC20MetadataRewards.target}, ${_IDEXRouter.target}, ${_IPAIRDATAFEED.target}`,
      );
      return true;
    }
    return false;
  }

  async function checkMcapVSDatafeed() {
    const token_bal = await _ThePromisedMoon.balanceOf(_owner.address);
    const bal = await getAccountBalance(_owner.address);
    const currMarketcap = parseInt(
      (await _DEXSTATS.getTOKENdilutedMarketcap(6)).toString(),
    );
    // Mcap taking price from chainlink datafeed
    const wethPriceChainlinkDF = await _IPAIRDATAFEED.latestAnswer();
    const pairReserves = await _DEXSTATS.getReservesPairToken();
    const pairDecs = await _IERC20MetadataPair.decimals();
    const totalSupply = await _ThePromisedMoon.totalSupply();
    const datafeedDecimals = await _IPAIRDATAFEED.decimals();
    const pairAmount = BN2(pairReserves[0].toString())
      .mul(BN2("1000"))
      .div(BN2((10 ** parseInt(pairDecs.toString())).toString()));
    const marketcapPDF = BN2(wethPriceChainlinkDF)
      .mul(BN2(totalSupply))
      .div(BN2(pairReserves[1]))
      .mul(pairAmount)
      .div(BN2("1000"));
    const marketcapPDFnoDecs =
      parseInt(marketcapPDF.toString()) /
      10 ** parseInt(datafeedDecimals.toString());
    log(
      `Acc. ether balance ${bal}, acc. Token balance ${token_bal}, token marketcap ${currMarketcap}$, token marketcap chainlink ${marketcapPDFnoDecs.toFixed(
        0,
      )}$`,
    );
    return [
      currMarketcap < marketcapPDFnoDecs * 1.01 &&
        currMarketcap > marketcapPDFnoDecs * 0.99,
      currMarketcap,
    ];
  }

  const buyDEX = async (_eth: BigNumberish, _account: HardhatEthersSigner) => {
    log(`Buying ${_eth} ether...`);
    const _IDEXRouter2 = await ethers.getContractAt(
      dexContractName,
      _IDEXRouter.target,
      _account,
    ); //IDEXRouter__factory.connect(_IDEXRouter.target.toString(), _account);
    const _tx =
      await _IDEXRouter2.swapExactETHForTokensSupportingFeeOnTransferTokens(
        0,
        [await _IDEXRouter.WETH(), _ThePromisedMoon.target],
        _account,
        parseInt(((await getBlockTimestamp()) ?? 0).toString()) + 3600,
        {
          value: toWei(_eth),
          gasPrice: gasPrice,
          gasLimit: gasLimit,
        },
      );
    log(`Buy performed, ${_eth} ether`);
    return _tx;
  };

  const sellDEX = async (
    _nTokens: BigNumberish,
    _account: HardhatEthersSigner,
  ) => {
    log(`Approving tokens ${_nTokens}`);
    ThePromisedMoon__factory.connect(
      _ThePromisedMoon.target.toString(),
      _account,
    ).approve(_IDEXRouter.target, _nTokens);
    log(`Selling... ${_nTokens.toString()} tokens`);
    const _IDEXRouter2 = await ethers.getContractAt(
      dexContractName,
      _IDEXRouter.target,
      _account,
    ); //IDEXRouter__factory.connect(_IDEXRouter.target.toString(), _account);
    const _tx =
      await _IDEXRouter2.swapExactTokensForETHSupportingFeeOnTransferTokens(
        _nTokens.toString(),
        0,
        [_ThePromisedMoon.target, await _IDEXRouter2.WETH()],
        _account,
        parseInt(((await getBlockTimestamp()) ?? 0).toString()) + 3600,
        {
          //value: toWei("0.05"),
          gasPrice: gasPrice,
          gasLimit: gasLimit,
        },
      );
    log(`Sell performed: ${_nTokens.toString()} tokens`);
    return _tx;
  };

  const getDevSigner = async () =>
    await ethers.getImpersonatedSigner(await _ThePromisedMoon.devReceiver());

  describe("Deployment", function () {
    it("We check environment variables config", async function () {
      log(
        `Environment PAIR, ROUTER, PAIR_DATAFEED: ${process.env.PAIR}, ${process.env.ROUTER}, ${process.env.PAIR_DATAFEED}`,
      );
      expect([
        process.env.PAIR,
        process.env.ROUTER,
        process.env.PAIR_DATAFEED,
      ]).to.satisfy(
        (s: (string | undefined)[]) =>
          s.every((_s) => _s != undefined && _s != ""),
        "Environment variables PAIR, ROUTER, PAIR_DATAFEED can not be empty or undefined",
      );
    });

    it("We attach already existing contracts we have to use", async function () {
      expect(await attachContracts()).to.be.equals(
        true,
        "An error happened attaching already existing contracts",
      );
    });

    it("We attach contracts that have been deployed", async function () {
      const { ...args } = await deployment();
      _ThePromisedMoon = args.thePromisedMoon;
      accounts = args._accounts;
      _owner = accounts[0]; //depends... check

      log(`Contracts deployed: ThePromisedMoon`);
      log(`Addresses: ${_ThePromisedMoon.target}`);
      log(`Deployer address: ${_owner.address}`);
      log(
        `Full list of addresses: \n${accounts
          .map((_a) => `\t\t${_a.address}`)
          .join(",\n")}`,
      );
      expect(_ThePromisedMoon.target).to.satisfy(
        (s: string | Addressable) => s != undefined && s != "",
      );
    });

    it("We attach internal deployed contracts", async function () {
      const adr = await _ThePromisedMoon.getDEXStatsAddress();
      _DEXSTATS = DEXStats__factory.connect(adr, _owner);

      log(`Contracts deployed internally attached: DEXStats`);
      log(`Addresses: ${_DEXSTATS.target}`);

      expect(_DEXSTATS.target).to.satisfy(
        (s: string | Addressable) => s != undefined && s != "",
      );
    });

    it("We attach liq pair", async function () {
      pairAdr = await _ThePromisedMoon.liqPair();

      log(`Address of contracts deployed internally attached: Liq pair`);
      log(`Addresses: ${pairAdr}`);

      expect(pairAdr).to.satisfy((s: string) => s != undefined && s != "");
    });
  });

  describe("Add liquidity and checks", function () {
    it("We add the liquidity", async function () {
      const ownerBalBefore = await getAccountBalance(_owner.address);
      /* const transactionResponse =  */ await _ThePromisedMoon.addLiqContract({
        value: toWei(200),
      });
      const ownerBalAfter = await getAccountBalance(_owner.address);
      //expect(transactionResponse).not.to.be.reverted;
      log(
        `Owner ${_owner.address} bal before: ${ownerBalBefore}, bal after: ${ownerBalAfter}`,
      );
      expect(parseInt(ownerBalBefore) - parseInt(ownerBalAfter)).to.be.gte(
        200,
        "200 ether was added to liq, so we have to confirm the balance difference",
      );
    });

    it("Perform marketcap check against chainlink datafeed", async function () {
      const [validMcap] = await checkMcapVSDatafeed();
      expect(validMcap).to.be.equal(
        true,
        "Contract calculated marketcap difference compared with chainlink datafeeds can not be bigger than 1%",
      );
    });
  });

  describe("Transactions checks", function () {
    it("Owner transaction without fee applied", async function () {
      const [ownerBeforeBalance, userBeforeBalance] = await Promise.all([
        BN2(await _ThePromisedMoon.balanceOf(_owner)),
        BN2(await _ThePromisedMoon.balanceOf(accounts[1])),
      ]);
      const sumBefore = ownerBeforeBalance.add(userBeforeBalance).toString();
      await _ThePromisedMoon.transfer(
        accounts[1],
        ownerBeforeBalance.div(BN2(100)).toString(),
      );
      const [ownerAfterBalance, userAfterBalance] = await Promise.all([
        BN2(await _ThePromisedMoon.balanceOf(_owner)),
        BN2(await _ThePromisedMoon.balanceOf(accounts[1])),
      ]);
      const sumAfter = ownerAfterBalance.add(userAfterBalance).toString();
      expect(sumAfter).to.satisfy(
        (afterBalance: string) => BN2(afterBalance).eq(BN2(sumBefore)),
        "Total amount has to be the same than before because no fees are applied",
      );
    });

    it("User transaction with fee applied", async function () {
      const [ownerBeforeBalance, userBeforeBalance] = await Promise.all([
        BN2(await _ThePromisedMoon.balanceOf(accounts[1])),
        BN2(await _ThePromisedMoon.balanceOf(accounts[2])),
      ]);
      const sumBefore = ownerBeforeBalance.add(userBeforeBalance).toString();
      const _ThePromisedMoon2 = ThePromisedMoon__factory.connect(
        _ThePromisedMoon.target.toString(),
        accounts[1],
      );
      await _ThePromisedMoon2.transfer(
        accounts[2].address.toLowerCase(),
        ownerBeforeBalance.div(BN2(100)).toString(),
      );
      const [ownerAfterBalance, userAfterBalance] = await Promise.all([
        BN2(await _ThePromisedMoon.balanceOf(accounts[1])),
        BN2(await _ThePromisedMoon.balanceOf(accounts[2])),
      ]);
      const sumAfter = ownerAfterBalance.add(userAfterBalance).toString();
      expect(sumAfter).to.satisfy(
        (afterBalance: string) => BN2(afterBalance).lt(BN2(sumBefore)),
        "Total amount has to be lower than before because of fees applied",
      );
    });

    it("Perform marketcap check against chainlink datafeed", async function () {
      const [validMcap] = await checkMcapVSDatafeed();
      expect(validMcap).to.be.equal(
        true,
        "Contract calculated marketcap difference compared with chainlink datafeeds can not be bigger than 1%",
      );
    });
  });

  describe("Buys checks", function () {
    it("Perform buys, with all the accounts, should work", async function () {
      const txs = await Promise.all(
        accounts.map((_account) => buyDEX("2", _account)),
      );
      const txsR = await Promise.all(txs.map((_tx) => _tx.wait()));
      expect(txsR).to.satisfy((_txs: TransactionReceipt[]) =>
        _txs.every((_tx) => _tx.status == 1),
      );
    });

    it("Perform marketcap check against chainlink datafeed", async function () {
      const [validMcap] = await checkMcapVSDatafeed();
      expect(validMcap).to.be.equal(
        true,
        "Contract calculated marketcap difference compared with chainlink datafeeds can not be bigger than 1%",
      );
    });
  });

  describe("Sells checks", function () {
    it("Perform sell should work", async function () {
      const tokensSellBefore = await _ThePromisedMoon.balanceOf(accounts[1]);
      log(
        `Can adr ${accounts[1].address} sell? ${(
          await _ThePromisedMoon.canAdrSellCD(accounts[1])
        ).toString()}, liq pair balance: ${await _ThePromisedMoon.balanceOf(
          pairAdr,
        )}`,
      );
      await sellDEX(BN2(tokensSellBefore).div(BN2(10)).toString(), accounts[1]);
      const tokensSellAfter = await _ThePromisedMoon.balanceOf(accounts[1]);
      expect(BN2(tokensSellBefore).sub(BN2(tokensSellAfter))).to.be.gte(
        BN2(tokensSellBefore).div(BN2(10)),
      ); //.not.to.be.reverted("Transaction should not revert")
    });

    it("Perform sell should not work", async function () {
      const tokensSellBefore = await _ThePromisedMoon.balanceOf(accounts[1]);
      log(
        `Can adr ${accounts[1].address} sell? ${(
          await _ThePromisedMoon.canAdrSellCD(accounts[1])
        ).toString()}, liq pair balance: ${await _ThePromisedMoon.balanceOf(
          pairAdr,
        )}`,
      );
      //expect(sellDexsync(BN2(tokensSellBefore).div(BN2(10)).toString(), accounts[1])).to.be.revertedWith("TransferHelper: TRANSFER_FROM_FAILED")
      try {
        await sellDEX(
          BN2(tokensSellBefore).div(BN2(10)).toString(),
          accounts[1],
        );
        /* eslint-disable no-empty */
      } catch (ex) {}
      const tokensSellAfter = await _ThePromisedMoon.balanceOf(accounts[1]);
      expect(BN2(tokensSellBefore).sub(BN2(tokensSellAfter))).not.to.be.gte(
        BN2(tokensSellBefore).div(BN2(10)),
      );
    });

    it("Increase time 1 day", async function () {
      const blockTimestampBefore = await getBlockTimestamp();
      await increaseDays(1);
      const blockTimestampAfter = await getBlockTimestamp();
      const _diff = (blockTimestampAfter ?? 0) - (blockTimestampBefore ?? 0);
      log(
        `Block timestamp before-after: ${blockTimestampBefore}-${blockTimestampAfter} (${_diff})`,
      );
      expect(_diff).to.be.gte(3600 * 24);
    });

    it("Perform sell should work", async function () {
      const tokensSellBefore = await _ThePromisedMoon.balanceOf(accounts[1]);
      log(
        `Can adr ${accounts[1].address} sell? ${(
          await _ThePromisedMoon.canAdrSellCD(accounts[1])
        ).toString()}, liq pair balance: ${await _ThePromisedMoon.balanceOf(
          pairAdr,
        )}`,
      );
      await sellDEX(BN2(tokensSellBefore).div(BN2(10)).toString(), accounts[1]);
      const tokensSellAfter = await _ThePromisedMoon.balanceOf(accounts[1]);
      expect(BN2(tokensSellBefore).sub(BN2(tokensSellAfter))).to.be.gte(
        BN2(tokensSellBefore).div(BN2(10)),
      );
    });

    it("Perform marketcap check against chainlink datafeed", async function () {
      const [validMcap] = await checkMcapVSDatafeed();
      expect(validMcap).to.be.equal(
        true,
        "Contract calculated marketcap difference compared with chainlink datafeeds can not be bigger than 1%",
      );
    });
  });

  describe("Auxiliary functions", function () {
    it("Force swapback", async function () {
      const txs = await ThePromisedMoon__factory.connect(
        _ThePromisedMoon.target.toString(),
        await getDevSigner(),
      ).forceSwapback({ gasLimit: gasLimit });
      const txsR = await txs.wait();
      expect(txsR).to.satisfy((_tx: TransactionReceipt) => _tx.status == 1); //expect().not.to.be.reverted;
    });

    it("Clear stuck", async function () {
      const txs = await ThePromisedMoon__factory.connect(
        _ThePromisedMoon.target.toString(),
        await getDevSigner(),
      ).clearStuckBalance();
      const txsR = await txs.wait();
      expect(txsR).to.satisfy((_tx: TransactionReceipt) => _tx.status == 1); //expect().not.to.be.reverted;
    });
  });

  describe("Test rewards functions", function () {
    it("Change token", async function () {
      log("We set tether as new reward");
      const txs = await ThePromisedMoon__factory.connect(
        _ThePromisedMoon.target.toString(),
        await getDevSigner(),
      ).changeTokenReward("0x55d398326f99059fF775485246999027B3197955");
      const txsR = await txs.wait();
      expect(txsR).to.satisfy((_tx: TransactionReceipt) => _tx.status == 1); //expect().not.to.be.reverte
    });

    it("Change router", async function () {
      log("Change router //ToDo!!");
      //expect(ThePromisedMoon__factory.connect(_ThePromisedMoon.target.toString(), (await getDevSigner())).changeRouter(_IDEXRouter.target)).not.to.be.reverted;
      expect(true).to.eq(true);
    });

    it("Unstuck token", async function () {
      expect(_ThePromisedMoon.unstuckToken()).to.be.reverted;
    });

    it("Update dividend distributor", async function () {
      log("Update dividend distributor //ToDo!!");
      expect(true).to.eq(true);
    });

    it("Update token distribution criteria, each 15 minutes when possible and min distribution ammount", async function () {
      const txs = await _ThePromisedMoon.setDistributionCriteria(
        15 * 60,
        2 * 10 ** 12,
      );
      const txsR = await txs.wait();
      expect(txsR).to.satisfy((_tx: TransactionReceipt) => _tx.status == 1);
    });
  });

  describe("More sells", async function () {
    const testingAcc = accounts[2];
    it("Perform sell should not work", async function () {
      const tokensSellBefore = await _ThePromisedMoon.balanceOf(testingAcc);
      log(
        `Can adr ${testingAcc.address} sell? ${(
          await _ThePromisedMoon.canAdrSellCD(testingAcc)
        ).toString()}, liq pair balance: ${await _ThePromisedMoon.balanceOf(
          pairAdr,
        )}`,
      );
      //expect(sellDexsync(BN2(tokensSellBefore).div(BN2(10)).toString(), testingAcc)).to.be.revertedWith("TransferHelper: TRANSFER_FROM_FAILED")
      try {
        await sellDEX(
          BN2(tokensSellBefore).div(BN2(10)).toString(),
          testingAcc,
        );
      } catch (ex) {}
      const tokensSellAfter = await _ThePromisedMoon.balanceOf(testingAcc);
      expect(BN2(tokensSellBefore).sub(BN2(tokensSellAfter))).not.to.be.gte(
        BN2(tokensSellBefore).div(BN2(10)),
      );
    });

    it("Increase time 1 day", async function () {
      const blockTimestampBefore = await getBlockTimestamp();
      await increaseDays(1);
      const blockTimestampAfter = await getBlockTimestamp();
      const _diff = (blockTimestampAfter ?? 0) - (blockTimestampBefore ?? 0);
      log(
        `Block timestamp before-after: ${blockTimestampBefore}-${blockTimestampAfter} (${_diff})`,
      );
      expect(_diff).to.be.gte(3600 * 24);
    });

    it("Perform sell should work", async function () {
      const tokensSellBefore = await _ThePromisedMoon.balanceOf(testingAcc);
      log(
        `Can adr ${testingAcc.address} sell? ${(
          await _ThePromisedMoon.canAdrSellCD(testingAcc)
        ).toString()}, liq pair balance: ${await _ThePromisedMoon.balanceOf(
          pairAdr,
        )}`,
      );
      await sellDEX(BN2(tokensSellBefore).div(BN2(10)).toString(), testingAcc);
      const tokensSellAfter = await _ThePromisedMoon.balanceOf(testingAcc);
      expect(BN2(tokensSellBefore).sub(BN2(tokensSellAfter))).to.be.gte(
        BN2(tokensSellBefore).div(BN2(10)),
      );
    });

    it("Perform marketcap check against chainlink datafeed", async function () {
      const [validMcap] = await checkMcapVSDatafeed();
      expect(validMcap).to.be.equal(
        true,
        "Contract calculated marketcap difference compared with chainlink datafeeds can not be bigger than 1%",
      );
    });
  });

  describe("Users holdings data using DEXStats contract", function () {
    it("Users holdings data", async function () {
      const results: boolean[][] = await Promise.all(
        accounts.map((_account) => {
          return _DEXSTATS
            .getTOKENholdings(_account.address)
            .then((holdings) => {
              return _DEXSTATS
                .getTOKENholdingsDollar(_account.address)
                .then((holdingsDollar) => {
                  return _DEXSTATS
                    .getTOKENfromDollars(holdingsDollar)
                    .then((holdings2_) => {
                      return _DEXSTATS
                        .getDollarsFromTOKEN(holdings2_)
                        .then((holdingsDollar2_) => {
                          log(
                            `Account ${_account.address} holds ${holdings}|${holdings2_} tokens`,
                          );
                          log(
                            `by value of ${holdingsDollar}|${holdingsDollar2_} dollars`,
                          );
                          return [
                            [holdings, holdings2_],
                            [holdingsDollar, holdingsDollar2_],
                          ].map((_args) => {
                            return BN2(_args[0].toString()).gte(
                              BN2(_args[1].toString())
                                .mul(BN2(99))
                                .div(BN2(100)),
                            );
                          });
                        });
                    });
                });
            });
        }),
      );
      expect(results.flat(1)).to.satisfy((_ar: boolean[]) =>
        _ar.every((_el) => _el == true),
      );
    });
  });
});
