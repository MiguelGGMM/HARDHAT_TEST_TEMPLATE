# HARDHAT_TEST_TEMPLATE

[![Solidity testing CI using hardhat]( https://github.com/MiguelGGMM/HARDHAT_TEST_TEMPLATE/actions/workflows/hardhat-test-pnpm.js.yml/badge.svg)]( https://github.com/MiguelGGMM/HARDHAT_TEST_TEMPLATE/actions/workflows/hardhat-test-pnpm.js.yml)

 Project template for testing smart contracts using hardhat, includes linter, prettier and CI using github actions \
 The example contract imports openzeppelin standard contracts \
 During tests chainlink datafeeds are used for validations 

 ## INSTALLATION INSTRUCTIONS

 ```
 pnpm install
 ```
 
 Using 'pnpm run' you can check the commands you will need to test your smart contract and run linter and prettier for solidity or typescript files
 
 If you want to test deployments you have to include your pk on .pk.example and remove the .example 
 
 You have to include your API KEY if you desire to test the verification plugin //TODO

 Gas reporter //TODO

 Coverage //TODO

