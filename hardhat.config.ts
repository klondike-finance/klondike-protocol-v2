import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-etherscan";
import "hardhat-gas-reporter";
import "solidity-coverage";
import { HardhatUserConfig } from "hardhat/config";
import { config as dotenv } from "dotenv";
import "./tasks/oracle";
dotenv();

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {},
    dev: {
      url: "http://localhost:8545",
    },
    kovan: {
      url: process.env["TEST_INFURA_ENDPOINT"] || "http://localhost:8545",
      accounts: [
        process.env["TEST_OPERATOR_PK"] ||
          "0x0000000000000000000000000000000000000000000000000000000000000000",
      ],
    },
    mainnet: {
      url: process.env["INFURA_ENDPOINT"] || "http://localhost:8545",
      accounts: [
        process.env["OPERATOR_PK"] ||
          "0x0000000000000000000000000000000000000000000000000000000000000000",
      ],
    },
  },

  solidity: {
    compilers: [
      {
        version: "0.6.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
          evmVersion: "istanbul",
        },
      },
      {
        version: "0.5.16",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
          evmVersion: "istanbul",
        },
      },
    ],
  },
  etherscan: {
    apiKey: process.env["ETHERSCAN_API_KEY"],
  },
};

export default config;
