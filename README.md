# HARDHAT_TEST_TEMPLATE

[![Solidity testing CI using hardhat]( https://github.com/MiguelGGMM/HARDHAT_TEST_TEMPLATE/actions/workflows/hardhat-test-pnpm.js.yml/badge.svg)]( https://github.com/MiguelGGMM/HARDHAT_TEST_TEMPLATE/actions/workflows/hardhat-test-pnpm.js.yml) 
[![Coverage Status](https://coveralls.io/repos/github/MiguelGGMM/HARDHAT_TEST_TEMPLATE/badge.svg?branch=master)](https://coveralls.io/github/MiguelGGMM/HARDHAT_TEST_TEMPLATE?branch=master)

 Template project for testing smart contracts using [hardhat](https://github.com/NomicFoundation/hardhat), includes linter, prettier and CI using github actions 
 
 The example contract imports [openzeppelin standard contracts](https://github.com/OpenZeppelin/openzeppelin-contracts)
 
 During tests [chainlink datafeeds](https://data.chain.link/) are used for validations against contracts calculations that use DEX liquidity pools 
 
 [Codechecks](https://app.codechecks.io/) and [Coveralls]( https://coveralls.io) are also integrated with github actions in order to check and control solidity code coverage and gas costs

 ## INSTRUCTIONS

 ```
 pnpm install
 ```
 
 Using ```pnpm run``` you can check the commands you will need to test your smart contract and run linter and prettier for solidity or typescript files

## DEPLOYMENT

If you want to test deployments you have to include your pk on .pk.example and remove the .example \
Also edit the deploy.js script and the deploy command to include the network you want to deploy against, this network has to be previously configured in hardhat.config.ts \
Check https://hardhat.org/hardhat-runner/docs/guides/deploying if you are lost here

## Verification
 
You have to include your API KEY if you desire to test the verification plugin, also you have to configure the networks you want to use, if your constructor receives complex arguments you also will have to create a file
Everything is explained here: https://hardhat.org/hardhat-runner/plugins/nomicfoundation-hardhat-verify

## GAS REPORTER

We are using the gas reporter included in hardhat and codechecks integration for github actions, for this you have to add your repo here https://app.codechecks.io/, copy the code and add it as a secret for your repository named CC_SECRET, check the codecheks.yml and the .yml for github actions depending on your branch name changes could be needed. \
https://github.com/codechecks/docs/blob/master/getting-started.md \
Diff parameters can be configured in hardhat.config.ts so will end in a failure if the gas spent rises too much.

![image](https://github.com/MiguelGGMM/HARDHAT_TEST_TEMPLATE/assets/104460442/fe8b23a4-4c15-40f7-839d-5ab42e09ccc3)

You can see the avg column is empty, if you need that include your CMC key in .cmc.example and remove the .example \
CI=true in enviroment variables is required so it generates the required json output in gasReporterOutput.json

If you want see previous output locally you have to run ```pnpm run codechecks```

![image](https://github.com/MiguelGGMM/HARDHAT_TEST_TEMPLATE/assets/104460442/d99a03cc-6f36-481a-bb25-16e1c5ce7edd)


## Coverage
 
Coveralls integration for github actions is also included, for this you have to add your repo here https://coveralls.io/repos and add a secret for your repository COVERALLS_REPO_TOKEN and set there your repo token, there you will also find a link in order to add your coverage badge in your readme. You can also configure coverage decrease thresholds for failure so if someone ruins the coverage the merge will be blocked.

![image](https://github.com/MiguelGGMM/HARDHAT_TEST_TEMPLATE/assets/104460442/d94f5392-0a71-47ff-ac0a-4f443c67b359)


Locally once you run ```pnpm run coverage``` a report summary will be generated where you can see the % of lines covered for your tests etc, also folder named coverage will be generated with an index.html file inside, if you click it you can check the coverage report similar to the summary you saw after execution but you can also navigate using your browser and check inside each contract which lines are covered which not and how much times each line.

![image](https://github.com/MiguelGGMM/HARDHAT_TEST_TEMPLATE/assets/104460442/4c6fb2ae-f300-4d64-9e09-cfc821d51f33)


