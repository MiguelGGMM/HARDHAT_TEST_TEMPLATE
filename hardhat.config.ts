import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
//import "hardhat-gas-reporter";
import "@nomiclabs/hardhat-solhint";
//import "solidity-coverage";
import "ganache-cli";
//import "@nomiclabs/hardhat-waffle"; //doesnt work fine with @nomicfoundation/hardhat-chai-matchers

import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

// Private key for deployments...
import fs from 'fs'; 
//import { ethers } from "ethers";

let privateKey = ''
try { privateKey = fs.readFileSync(".pk").toString().trim() }catch(ex: any){ console.log(ex.toString()) }

const config: HardhatUserConfig = {
  solidity: { 
    compilers: [
      {        
        version: "0.8.12",          
        settings: {
          //evmVersion: "byzantium",
          evmVersion: "istanbul",
          optimizer: {
            enabled: true,
            runs: 999,            
          }
        }
      },
      {
        //Need for pancakeswapV2...
        version: "0.6.6",
        settings: {
          //evmVersion: "byzantium",
          evmVersion: "istanbul",
          optimizer: {
            enabled: true,
            runs: 999
          }
        }
      }
    ]
  },  
  mocha: {
    
  },
  defaultNetwork: "hardhat",
  networks: {    
    hardhat: {      
      forking: {
        url: 'https://bsc-dataseed1.binance.org/',
        enabled: true
      },
      hardfork: 'istanbul',
      allowUnlimitedContractSize: true, //Needed for coverage...
      gasPrice: 5000000000,
      gas: 20000000,
      gasMultiplier: 1.2,
      throwOnCallFailures: true,
      blockGasLimit: 30000000
    },
    bscMainnet: {
      url: 'https://bsc-dataseed1.binance.org/',
      accounts: privateKey ? [`0x${privateKey}`] : [],
      gasPrice: 5000000000
    }
  },
  gasReporter: {
    enabled: true,

    token: 'BNB',
    gasPriceApi: 'https://api.bscscan.com/api?module=proxy&action=eth_gasPrice',

    // token: 'ETH',
    // gasPriceApi: 'https://api.etherscan.io/api?module=proxy&action=eth_gasPrice',

    // if we want the report in a file
    outputFile: 'gasReporterOutput.json',
    noColors: true, //needed if we print report in file

    //rst: true,
    //onlyCalledMethods: true,
    showMethodSig: true,
    currency: 'USD',//'EUR',
    coinmarketcap: process.env.CMC_KEY,
    gasPrice: 5
  }
};

export default config;
