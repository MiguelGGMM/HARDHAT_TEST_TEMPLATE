import { ethers } from "hardhat";
import _ from 'lodash';

async function main() {
  console.log(
    `Deploying using parameters: \n\t${_.filter(Object.keys(process.env), (_o) => 
      ["NAME", "SYMBOL", "PAIR", "STABLE", "ROUTER"].includes(_o)).map(_o => `${_o}:${process.env[_o]}\n\t`)}`
  );

  const thePromisedMoon = await ethers.deployContract("ThePromisedMoon", [process.env.NAME, process.env.SYMBOL, process.env.PAIR, process.env.STABLE, process.env.ROUTER, process.env.DEBUG_SOLIDITY == '1'])
  await thePromisedMoon.waitForDeployment();
  console.log(
    `ThePromisedMoon successfully deployed: ${thePromisedMoon.target}`
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
