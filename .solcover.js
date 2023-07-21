module.exports = {
  client: require("ganache-cli"),
  providerOptions: {
    port: 8545,
    hostname: "127.0.0.1",
  },
  //skipFiles: ['token/testAux/PancakeRouter.sol']
  skipFiles: [
    "Libraries/IDEXRouter.sol",
    "Libraries/IDividendDistributor.sol",
    "Libraries/IFactory.sol",
    "Libraries/ILiqPair.sol",
    "token/testAux/IPairDatafeed.sol",
  ],
};
