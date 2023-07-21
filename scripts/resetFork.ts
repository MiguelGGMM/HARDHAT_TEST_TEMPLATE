import { ethers, network } from "hardhat";
//import _ from "lodash";

const jsonRpcUrl = "https://bsc-dataseed1.binance.org/";

async function main() {
  const bscProvider = new ethers.JsonRpcProvider(jsonRpcUrl);
  const latestBlock = await bscProvider.getBlockNumber();

  await network.provider.send("hardhat_reset", [
    {
      forking: {
        jsonRpcUrl: jsonRpcUrl,
        blockNumber: latestBlock - 30, //5 blocks in the past, we ensure the block has the necessary confirmations
      },
    },
  ]);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
